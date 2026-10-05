// Checks for the storage layer (window.storage in index.html): honest saves, the upload queue, seal and
// continue, split values, the size table, backups with parts, and the storage-layer rule.
// Runs the page's REAL window.storage against the in-memory fake Firestore from p1-check.js; the live
// Firestore is never touched. Run: NODE_PATH=$(npm root -g) node scripts/storage-test.js [1-12|all]
const fs = require('fs');
const path = require('path');
const { openPage } = require('./p1-check');
const { check } = require('./storage-layer-check');
const F = require('./p1-fixtures');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const NOW = '2026-10-04T12:00:00';
const sanitise = (k) => k.replace(/[:/.#$[\]]/g, '_');
const asDocs = (kv) => Object.fromEntries(Object.entries(kv).map(([k, v]) => [sanitise(k), { key: k, value: v }]));
const NAV = ['Play', 'Kaizen', 'Fuel', 'Vitals', 'Practice', 'Pending', 'System'];

// A page whose SEALED_LOG_KEYS also lists `keys` (test only: the real list is just kaizen4:logs), so the
// sealing of arrays and { entries } docs can still be checked for a key added to the list later.
const SEALED_LINE = "const SEALED_LOG_KEYS = ['kaizen4:logs'];";
const sealedAlso = (keys) => (h) => { if (!h.includes(SEALED_LINE)) throw new Error('SEALED_LOG_KEYS line not found'); return h.replace(SEALED_LINE, `const SEALED_LOG_KEYS = ${JSON.stringify(['kaizen4:logs', ...keys])};`); };
async function open(fake, opts = {}) {
  const ctx = await openPage({ fakeFirestore: fake, now: NOW, ...opts });
  await ctx.page.waitForTimeout(3000); // let every pane finish its boot reads and writes
  return ctx;
}
const nav = (page, name) => page.getByRole('button', { name, exact: true }).click();
const statusLine = (page) => page.locator('[data-nw-status]').innerText();
const bannerTexts = (page, kind) => page.$$eval(`[data-nw-banner${kind ? `="${kind}"` : ''}]`, els => els.map(e => e.innerText.replace(/\s*OK$/, '').trim()));
const waitFor = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
async function done(ctx, label) {
  ok(ctx.errors.length === 0, `${label}: no console errors${ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''}`);
  await ctx.browser.close();
}
// In the page: makes navigator.onLine follow window.__online.
const controllableOnline = (page) => page.evaluate(() => {
  window.__online = true;
  Object.defineProperty(navigator, 'onLine', { get: () => window.__online, configurable: true });
});

// ── 1. Honest saves ─────────────────────────────────────────────────
async function part1() {
  console.log('\n[1. A rejected cloud write is device-only: banner on every tab, never "saved"]');
  {
    const fake = { ...asDocs(F.base()), kaizen4_logs: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-10-01': { highlight: 'earlier' } }) } };
    const ctx = await open(fake);
    const { page } = ctx;
    await page.evaluate(() => {
      window.__fakeFail = (op, id) => (op === 'set' && (id === 'practice_log_2026_10_04' || id === 'kaizen4_logs') ? 'reject' : null);
    });
    await nav(page, 'Practice');
    await page.waitForSelector('.pr-root h1');
    await page.getByRole('button', { name: 'Level 2', exact: true }).click();
    await page.waitForTimeout(600);
    let t = await page.locator('.pr-root').innerText();
    ok(t.includes('Logged: Waking ladder · level 2 — on this device only, not in the cloud yet') && !t.includes('✅ Logged'), 'Practice: the rep message says "on this device only, not in the cloud yet", not "✅ Logged"');
    let b = await bannerTexts(page, 'device-only');
    ok(b.length === 1 && b[0] === 'Practice log for 2026-10-04 saved on this device only, not in the cloud. Reason: the cloud rejected it (invalid-argument: Document exceeds the maximum size).', 'banner: "<what> saved on this device only, not in the cloud. Reason: <reason>." → ' + JSON.stringify(b));
    const dev = await page.evaluate(() => ({ local: JSON.parse(localStorage.getItem('practice:log:2026_10_04') || 'null'), cloud: window.__fakeDocs.has('practice_log_2026_10_04') }));
    ok(dev.local && dev.local.entries.length === 1 && dev.local.entries[0].level === 2 && !dev.cloud, 'the rep is kept on this device (localStorage), not in the cloud');
    ok((await statusLine(page)) === '1 waiting to upload', 'status line: "1 waiting to upload"');

    await nav(page, 'Kaizen');
    await page.getByPlaceholder('If only one thing happens, what makes today a win?').fill('Test win');
    await page.waitForTimeout(1500);
    t = await page.locator('body').innerText();
    ok(t.includes('This device only') && !/\bSaved\b/.test(t), 'Kaizen: the save pill says "This device only", not "Saved"');
    b = await bannerTexts(page, 'device-only');
    ok(b.length === 1 && b[0] === 'Kaizen daily log saved on this device only, not in the cloud. Reason: the cloud rejected it (invalid-argument: Document exceeds the maximum size).', 'one banner, naming the latest device-only save → ' + JSON.stringify(b));
    ok((await statusLine(page)) === '2 waiting to upload', 'status line: "2 waiting to upload"');
    let everyTab = true;
    for (const name of NAV) {
      await nav(page, name);
      const vis = await page.locator('[data-nw-banner="device-only"]').isVisible();
      const n = await page.locator('[data-nw-banner="device-only"]').count();
      const line = await page.locator('[data-nw-status]').isVisible();
      if (!vis || n !== 1 || !line) { everyTab = false; console.log('    missing on', name); }
    }
    ok(everyTab, 'the banner and the status line show on every tab: ' + NAV.join(', '));
    const direct = await page.evaluate(async () => {
      window.__fakeFail = () => 'reject';
      const r = await window.storage.set('test:direct', 'x');
      window.__fakeFail = null;
      return { r, local: localStorage.getItem('test:direct') };
    });
    ok(direct.r === 'device-only' && direct.local === 'x', "window.storage.set returns 'device-only' (not true) when the cloud rejects and the device copy worked");
    const good = await page.evaluate(async () => window.storage.set('test:good', 'y'));
    ok(good === 'cloud', "window.storage.set returns 'cloud' when the cloud has it");
    await done(ctx, '1');
  }

  console.log('\n[1. The 15-second limit; a slow write that lands later]');
  {
    const ctx = await open({});
    const { page } = ctx;
    await page.evaluate(() => {
      window.__fakeFail = (op, id) => (op === 'set' && id === 'test_slow' ? 'hang' : null);
      window.__res = null;
      const t0 = Date.now();
      window.storage.set('test:slow', 'v1').then(r => { window.__res = r; window.__dt = Date.now() - t0; });
    });
    await page.waitForTimeout(14000);
    const at14 = await page.evaluate(() => window.__res);
    ok(at14 === null, 'still waiting for the cloud at 14 s');
    await waitFor(page, () => window.__res !== null, null, 4000);
    const r = await page.evaluate(() => ({ res: window.__res, dt: window.__dt }));
    ok(r.res === 'device-only' && r.dt >= 15000 && r.dt < 16500, `not settled after 15 s → 'device-only' (after ${r.dt} ms)`);
    let b = await bannerTexts(page, 'device-only');
    ok(b[0] === `"test:slow" saved on this device only, not in the cloud. Reason: the cloud didn't answer within 15 seconds.`, 'banner names the 15-second limit → ' + JSON.stringify(b));
    // A write that timed out but lands later counts as uploaded.
    await page.evaluate(() => {
      let release;
      window.__late = new Promise(r => { release = r; });
      window.__release = release;
      window.__fakeFail = (op, id) => (op === 'set' && id === 'test_late' ? window.__late : null);
      window.__res2 = null;
      window.storage.set('test:late', 'v2').then(r => { window.__res2 = r; });
    });
    await waitFor(page, () => window.__res2 !== null, null, 17000);
    const before = await page.evaluate(() => ({ r: window.__res2, waiting: window.storage.status().waiting }));
    await page.evaluate(() => { window.__fakeFail = null; window.__release(); });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ waiting: window.storage.status().queue.map(q => q.key), doc: window.__fakeDocs.get('test_late') }));
    ok(before.r === 'device-only' && before.waiting === 2 && after.doc && after.doc.value === 'v2' && JSON.stringify(after.waiting) === '["test:slow"]', 'a timed-out write that lands later leaves the queue (the other one still waits)');
    await done(ctx, '1 timeout');
  }

  console.log('\n[1. Offline; this device full]');
  {
    const ctx = await open({ test_full: { key: 'test:full', value: 'old' } });
    const { page } = ctx;
    await controllableOnline(page);
    const r = await page.evaluate(async () => {
      window.__online = false;
      const t0 = Date.now();
      const off = await window.storage.set('test:offline', 'o');
      const dt = Date.now() - t0;
      const offBanner = window.storage.status().banners.find(b => b.kind === 'device-only').text;
      window.__online = true;
      // localStorage full for test:full, and the cloud rejects it → nothing stored anywhere.
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'test:full' || k === 'test:full2') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); };
      localStorage.removeItem('test:full2');
      window.__fakeFail = (op, id) => (op === 'set' && id === 'test_full' ? 'reject' : null);
      const both = await window.storage.set('test:full', 'new');
      window.__fakeFail = null;
      const failedBanner = (window.storage.status().banners.find(b => b.kind === 'failed') || {}).text;
      // localStorage full but the cloud takes it → 'cloud', no banner about the device.
      real.call(localStorage, 'test:full2', 'stale');
      const cloudOnly = await window.storage.set('test:full2', 'fresh');
      Storage.prototype.setItem = real;
      return { off, dt, offBanner, both, failedBanner, cloud: window.__fakeDocs.get('test_full').value, cloudOnly, stale: localStorage.getItem('test:full2'), banners: window.storage.status().banners.map(b => b.kind) };
    });
    ok(r.off === 'device-only' && r.dt < 1000 && r.offBanner === '"test:offline" saved on this device only, not in the cloud. Reason: the device is offline.', 'offline → device-only straight away, reason "the device is offline"');
    ok(r.both === false && r.cloud === 'old' && r.failedBanner === `"test:full" was not saved, not in the cloud and not on this device. Reason: the cloud rejected it (invalid-argument: Document exceeds the maximum size), and this device's storage is full.`, 'cloud rejected + this device full → false, and a banner says so → ' + JSON.stringify(r.failedBanner));
    ok(r.cloudOnly === 'cloud' && r.stale === null && r.banners.filter(k => k === 'failed').length === 1, "this device full but the cloud took it → 'cloud', no extra banner, and the stale device copy is removed");
    await done(ctx, '1 offline');
  }
}

// ── 2. Upload on reconnect + status line ───────────────────────────
async function part2() {
  console.log('\n[2. Reconnect: uploads in order, never overwrites a newer cloud copy]');
  {
    const ctx = await open({ q_b: { key: 'q:b', value: 'cloud-b-old', updatedAt: '2026-10-01T00:00:00.000Z' } });
    const { page } = ctx;
    await controllableOnline(page);
    const r1 = await page.evaluate(async () => {
      window.__online = false;
      const res = [];
      res.push(await window.storage.set('q:a', 'a1'));
      res.push(await window.storage.set('q:b', 'b1'));
      res.push(await window.storage.set('q:c', 'c1'));
      res.push(await window.storage.set('q:a', 'a2')); // latest value per key; moves to the end
      return { res, queue: window.storage.status().queue.map(q => q.key) };
    });
    ok(r1.res.every(x => x === 'device-only') && JSON.stringify(r1.queue) === '["q:b","q:c","q:a"]', 'offline saves queue one entry per key, in save order → ' + JSON.stringify(r1.queue));
    ok((await statusLine(page)) === '3 waiting to upload', 'status line: "3 waiting to upload"');
    // Another device writes q:b to the cloud after this device's save of it.
    const mark = await page.evaluate(() => {
      window.__fakeDocs.set('q_b', { key: 'q:b', value: 'cloud-b-new', updatedAt: new Date(Date.now() + 60000) });
      window.__online = true;
      const m = window.__fakeOrder.length;
      window.dispatchEvent(new Event('online'));
      return m;
    });
    await waitFor(page, () => window.storage.status().waiting === 0);
    const r2 = await page.evaluate((m) => {
      const d = (id) => window.__fakeDocs.get(id);
      const conflictId = [...window.__fakeDocs.keys()].find(k => k.startsWith('q_b__conflict_'));
      return { order: window.__fakeOrder.slice(m).filter(o => o.startsWith('set ')), conflictId, conflict: conflictId && d(conflictId), a: d('q_a').value, b: d('q_b').value, c: d('q_c').value };
    }, mark);
    ok(r2.order.length === 3 && r2.order[0] === 'set ' + r2.conflictId && r2.order[1] === 'set q_c' && r2.order[2] === 'set q_a', 'uploads go up in order (q:b, q:c, q:a) → ' + JSON.stringify(r2.order));
    ok(r2.b === 'cloud-b-new', "the newer cloud copy of q:b is not overwritten");
    ok(/^q_b__conflict_2026-10-0\dT\d\d_\d\d_\d\d_\d{3}Z$/.test(r2.conflictId || '') && r2.conflict.value === 'b1' && r2.conflict.key === 'q:b' && r2.conflict.conflictOf === 'q_b', "this device's q:b is saved as q_b__conflict_<timestamp> with key, value and conflictOf");
    ok(r2.a === 'a2' && r2.c === 'c1', 'q:a (latest value) and q:c are uploaded');
    const b = await bannerTexts(page);
    ok(!b.some(x => /saved on this device only/.test(x)), 'the device-only banner clears when the queue is empty');
    ok(b.some(x => x.startsWith(`"q:b": the cloud had a newer copy, so it was kept. This device's version was saved separately as ${r2.conflictId}.`)), 'a banner names the conflict copy → ' + JSON.stringify(b));
    ok(/^All saved · last cloud save \d{1,2}:\d\d\s?(AM|PM)$/.test(await statusLine(page)), 'status line: "All saved · last cloud save <time>" → ' + JSON.stringify(await statusLine(page)));
    const r3 = await page.evaluate(async () => {
      const w = await window.storage.set('q:b', 'b2');
      return { w, cloud: window.__fakeDocs.get('q_b').value, reason: window.storage.status().queue[0].reason, read: (await window.storage.get('q:b')).value };
    });
    ok(r3.w === 'device-only' && r3.cloud === 'cloud-b-new' && r3.reason === 'a newer copy is in the cloud from another device. Reload the app to see it' && r3.read === 'b2', 'after a conflict, later saves of that key stay on this device until reload (the cloud copy is not overwritten)');
    await page.locator('[data-nw-banner="conflict"] button').click();
    ok(!(await page.locator('[data-nw-banner="conflict"]').count()), 'the conflict banner closes with OK');
    await done(ctx, '2');
  }

  console.log('\n[2. App start: the queue uploads; a newer cloud copy gets a conflict copy]');
  {
    const fake = { q_conf: { key: 'q:conf', value: 'theirs', updatedAt: '2026-10-05T06:00:00.000Z' } };
    const ctx = await open(fake);
    const { page } = ctx;
    await controllableOnline(page);
    await page.evaluate(async () => {
      window.__online = false;
      await window.storage.set('q:start', 'device-value');
      await window.storage.set('q:conf', 'mine');
    });
    ok((await statusLine(page)) === '2 waiting to upload', 'two saves wait while offline');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('nav button') && window.storage && window.storage.status, null, { timeout: 60000 });
    await waitFor(page, () => window.storage.status().waiting === 0);
    const r = await page.evaluate(async () => {
      const conf = [...window.__fakeDocs.keys()].find(k => k.startsWith('q_conf__conflict_'));
      return { start: (window.__fakeDocs.get('q_start') || {}).value, conf: window.__fakeDocs.get('q_conf').value, copy: conf && window.__fakeDocs.get(conf).value, read: (await window.storage.get('q:conf')).value };
    });
    ok(r.start === 'device-value', 'at app start the waiting save is uploaded');
    ok(r.conf === 'theirs' && r.copy === 'mine' && r.read === 'theirs', 'at app start a newer cloud copy is kept, the device copy is saved beside it, and reads show the cloud copy');
    ok(/^All saved/.test(await statusLine(page)), 'status line back to "All saved…"');
    await done(ctx, '2 start');
  }
}

// ── 3. Seal and continue ───────────────────────────────────────────
// In the page: writes `value` under `key`, checks the seal, returns facts.
const sealCheck = (page, key, value) => page.evaluate(async ({ key, value }) => {
  const id = key.replace(/[:/.#$[\]]/g, '_');
  const m = window.__fakeOrder.length;
  const w = await window.storage.set(key, value);
  const order = window.__fakeOrder.slice(m);
  const act = window.__fakeDocs.get(id);
  const parts = (act.parts || []).map(p => ({ ...p, doc: window.__fakeDocs.get(p.id) }));
  return {
    w, order, parts, activeBytes: window.storage.docBytes(id, act), valueBytes: new TextEncoder().encode(value).length,
    partBytes: parts.map(p => window.storage.docBytes(p.id, p.doc)), shape: act.shape, orderField: act.order,
    all: (await window.storage.getAll(key)).value, activeValue: act.value,
  };
}, { key, value });
const pad = (n) => String(n).padStart(2, '0');
const day = (i) => { const d = new Date(Date.UTC(2025, 0, 1 + i)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

async function part3() {
  console.log('\n[3. Only keys in SEALED_LOG_KEYS seal; any other key is split]');
  {
    const ctx = await open({});
    const { page } = ctx;
    const items = Array.from({ length: 450 }, (_, i) => ({ n: i, text: 'a'.repeat(2100) }));
    const r = await page.evaluate(async (items) => {
      const out = {};
      for (const [key, v] of [['grow:array', items], ['grow:entries', { date: '2026-10-04', entries: items }]]) {
        const value = JSON.stringify(v);
        const w = await window.storage.set(key, value);
        const id = key.replace(/[:/.#$[\]]/g, '_');
        const main = window.__fakeDocs.get(id);
        out[key] = { w, parts: [...window.__fakeDocs.keys()].filter(k => k.startsWith(id + '__part_')).length, split: !!main.split, pieces: main.split ? main.split.pieces.length : 0,
          get: (await window.storage.get(key)).value === value, sealedList: window.storage.SEALED_LOG_KEYS };
      }
      return out;
    }, items);
    ok(JSON.stringify(r['grow:array'].sealedList) === '["kaizen4:logs"]', 'SEALED_LOG_KEYS is ["kaizen4:logs"]');
    ok(['grow:array', 'grow:entries'].every(k => r[k].w === 'cloud' && r[k].parts === 0 && r[k].split && r[k].pieces >= 2 && r[k].get), 'a 960 KB array and { entries } doc outside SEALED_LOG_KEYS are split into pieces (no __part_ docs) and read back whole with get');
    await done(ctx, '3 opt-in');
  }
  console.log('\n[3. Seal and continue at 800,000 bytes, for a key in SEALED_LOG_KEYS]');
  const ctx = await open({}, { html: sealedAlso(['grow:array', 'grow:entries', 'grow:dated', 'grow:newest', 'grow:import']) });
  const { page } = ctx;
  const items = Array.from({ length: 400 }, (_, i) => ({ n: i, text: 'a'.repeat(2100) }));
  const shapes = [
    ['an array', 'grow:array', items],
    ['an { entries } doc', 'grow:entries', { date: '2026-10-04', entries: items }],
    ['a date-keyed object', 'grow:dated', Object.fromEntries(items.map((it, i) => [day(i), it]))],
  ];
  for (const [label, key, v] of shapes) {
    const id = sanitise(key);
    const value = JSON.stringify(v);
    const r = await sealCheck(page, key, value);
    const p = r.parts[0];
    ok(r.w === 'cloud' && r.valueBytes > 800000 && r.parts.length === 1, `${label}: an ${r.valueBytes}-byte write seals one part`);
    const partAt = r.order.indexOf('set ' + p.id), activeAt = r.order.lastIndexOf('set ' + id);
    ok(partAt >= 0 && activeAt > partAt, `${label}: the part is written before the active doc is trimmed → ${JSON.stringify(r.order)}`);
    ok(r.activeBytes < 400000 && r.partBytes[0] <= 900000, `${label}: active doc now ${r.activeBytes} bytes (< 400,000); part ${r.partBytes[0]} bytes`);
    const d = p.doc;
    const isDate = key === 'grow:dated';
    ok(d.sealed === true && d.partOf === id && d.key === key && d.rangeKind === (isDate ? 'date' : 'index') &&
       (isDate ? d.from === '2025-01-01' && d.to === day(d.count - 1) : d.from === 0 && d.to === d.count - 1) && p.id === id + '__part_1',
       `${label}: part ${p.id} has key, sealed: true, partOf and its ${isDate ? 'date' : 'index'} range (${d.from} … ${d.to})`);
    ok(r.all === value, `${label}: getAll returns everything, in order (exact match)`);
    if (key === 'grow:entries') ok(JSON.parse(r.activeValue).date === '2026-10-04', `${label}: the doc's other fields stay in the active doc`);
    // Saving the whole history back plus one new item: nothing is sealed twice.
    const next = JSON.parse(value);
    const add = { n: 400, text: 'new' };
    if (Array.isArray(next)) next.push(add); else if (next.entries) next.entries.push(add); else next['2026-10-04'] = add;
    const r2 = await sealCheck(page, key, JSON.stringify(next));
    ok(r2.w === 'cloud' && r2.parts.length === 1 && r2.activeBytes < 400000 && r2.all === JSON.stringify(next), `${label}: saving the whole history back + 1 item keeps one part; getAll has the new item at the end`);
    const refuse = await page.evaluate(async (pid) => {
      const before = JSON.stringify(window.__fakeDocs.get(pid));
      const w = await window.storage.set(pid, '[]');
      return { w, same: JSON.stringify(window.__fakeDocs.get(pid)) === before, banner: (window.storage.status().banners.find(b => b.id === 'failed:' + pid) || {}).text };
    }, p.id);
    ok(refuse.w === false && refuse.same && /it is a sealed part, which is read-only/.test(refuse.banner || ''), `${label}: storage.set refuses to write the sealed part (and says so)`);
  }

  // Newest-first arrays (dates going backwards) seal their oldest items, at the end.
  const nf = Array.from({ length: 400 }, (_, i) => ({ date: day(399 - i), text: 'b'.repeat(2100) }));
  const rn = await sealCheck(page, 'grow:newest', JSON.stringify(nf));
  ok(rn.orderField === 'newest-first' && JSON.parse(rn.parts[0].doc.value)[0].date === day(rn.parts[0].doc.count - 1) && JSON.parse(rn.activeValue)[0].date === day(399) && rn.all === JSON.stringify(nf), 'a newest-first array seals its oldest items and getAll keeps newest first');
  // 2.4 MB of dated data in one save (an import) → several parts, each under the limit.
  const big = Object.fromEntries(Array.from({ length: 1100 }, (_, i) => [day(i), { text: 'c'.repeat(2150) }]));
  const rb = await sealCheck(page, 'grow:import', JSON.stringify(big));
  ok(rb.w === 'cloud' && rb.parts.length >= 3 && rb.partBytes.every(b => b <= 650000) && rb.activeBytes < 400000 && rb.all === JSON.stringify(big), `a ${rb.valueBytes}-byte import seals into ${rb.parts.length} parts, each ≤ 650,000 bytes; getAll exact`);

  // At 85% of SAFE: a banner naming the doc.
  const warn = await page.evaluate(async () => {
    await window.storage.set('warn:blob', JSON.stringify({ text: 'x'.repeat(780000) }));
    return (window.storage.status().banners.find(b => b.kind === 'size') || {}).text;
  });
  ok(/^"warn:blob" \(doc warn_blob\) is at 87% of the safe size: 780,\d{3} of 900,000 bytes\. It is split into pieces automatically above 900,000 bytes\.$/.test(warn || ''), 'a doc at 85% of SAFE or more gets a banner naming it → ' + JSON.stringify(warn));
  await page.locator('[data-nw-banner="size"] button').click();
  ok(!(await page.locator('[data-nw-banner="size"]').count()), 'the size banner closes with OK (until the doc grows again)');
  await done(ctx, '3');
}

// ── 4. Kaizen history ─────────────────────────────────────────────
async function part4() {
  console.log('\n[4. Kaizen still shows its existing archives (read as sealed parts)]');
  const L = (h) => ({ brainDump: '', highlight: h, micro: '', done: [], reflection: '' });
  const legacy = {
    kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify({ '2026-07-10': L('Old kaizen3 freeze day') }) },
    kaizen3_logs_archive_2026_08: { key: 'kaizen3:logs', value: JSON.stringify({ '2026-08-10': L('Kaizen3 archive day') }), archivedAt: '2026-08-31' },
    kaizen4_logs_archive_2026_07_06: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-09-10': L('Rescue archive day') }) },
  };
  const base = {
    kaizen3_projects: { key: 'kaizen3:projects', value: '[]' }, kaizen3_tasks: { key: 'kaizen3:tasks', value: '[]' }, kaizen3_seeded: { key: 'kaizen3:seeded', value: 'true' },
  };
  {
    const fake = { ...base, ...legacy, kaizen4_logs: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-10-01': L('Active day') }) } };
    const ctx = await open(fake);
    const { page } = ctx;
    await nav(page, 'Kaizen');
    await page.getByRole('button', { name: 'Reflect', exact: true }).click();
    await page.waitForTimeout(400);
    const t = await page.locator('body').innerText();
    ok(['Old kaizen3 freeze day', 'Kaizen3 archive day', 'Rescue archive day', 'Active day'].every(h => t.includes(h)), 'Reflect shows days from kaizen3_logs, kaizen3_logs_archive_*, kaizen4_logs_archive_* and the active doc');
    const before = await page.evaluate(() => Object.fromEntries(['kaizen3_logs', 'kaizen3_logs_archive_2026_08', 'kaizen4_logs_archive_2026_07_06'].map(id => [id, JSON.stringify(window.__fakeDocs.get(id))])));
    const mark = await page.evaluate(() => window.__fakeOrder.length);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByPlaceholder('If only one thing happens, what makes today a win?').fill('New win');
    await page.waitForTimeout(1500);
    const r = await page.evaluate(({ before, mark }) => {
      const same = Object.entries(before).every(([id, v]) => JSON.stringify(window.__fakeDocs.get(id)) === v);
      const act = JSON.parse(window.__fakeDocs.get('kaizen4_logs').value);
      return { same, writes: window.__fakeOrder.slice(mark), act };
    }, { before, mark });
    ok(r.same && r.writes.every(w => w === 'set kaizen4_logs') && r.act['2026-10-04'].highlight === 'New win' && r.act['2026-10-01'].highlight === 'Active day', 'a Kaizen edit writes only kaizen4_logs; the old archive docs are left where they are, unchanged');
    const ref = await page.evaluate(async () => window.storage.set('kaizen3:logs', '{}'));
    ok(ref === false, 'storage.set refuses to write kaizen3:logs (an old archive, read-only)');
    await page.getByRole('button', { name: 'Reflect', exact: true }).click();
    const t2 = await page.locator('body').innerText();
    ok(['Old kaizen3 freeze day', 'Kaizen3 archive day', 'Rescue archive day', 'Active day', 'New win'].every(h => t2.includes(h)), 'after the edit Reflect still shows every archived day');
    await done(ctx, '4');
  }

  console.log('\n[4. Kaizen\'s daily log seals through window.storage (no Kaizen rollover)]');
  {
    const big = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [day(i), L('d'.repeat(2800))]));
    const fake = { ...base, ...legacy, kaizen4_logs: { key: 'kaizen4:logs', value: JSON.stringify(big) } };
    const ctx = await open(fake);
    const { page } = ctx;
    const boot = await page.evaluate(() => ({ docs: [...window.__fakeDocs.keys()].filter(k => /^kaizen4_logs__/.test(k)) }));
    ok(boot.docs.length === 0, 'loading Kaizen writes nothing (no rollover on boot)');
    await nav(page, 'Kaizen');
    const m = await page.evaluate(() => window.__fakeOrder.length);
    await page.getByPlaceholder('If only one thing happens, what makes today a win?').fill('Win on a big day');
    await page.waitForTimeout(2000);
    const r = await page.evaluate(async (m) => {
      const act = window.__fakeDocs.get('kaizen4_logs');
      return { order: window.__fakeOrder.slice(m), parts: (act.parts || []).map(p => p.id), bytes: window.storage.docBytes('kaizen4_logs', act), today: JSON.parse(act.value)['2026-10-04'], all: Object.keys(JSON.parse((await window.storage.getAll('kaizen4:logs')).value)).length };
    }, m);
    ok(r.parts.length === 1 && r.order.indexOf('set kaizen4_logs__part_1') >= 0 && r.order.indexOf('set kaizen4_logs__part_1') < r.order.lastIndexOf('set kaizen4_logs') && r.bytes < 400000 && r.today.highlight === 'Win on a big day', 'an 860 KB daily log: Kaizen\'s save writes kaizen4_logs__part_1 first, then trims the active doc under 400,000 bytes');
    ok(r.all === 300 + 3 + 1, 'getAll still has every day: 300 + 3 archived + today');
    await page.getByPlaceholder('If only one thing happens, what makes today a win?').fill('Win on a big day, edited');
    await page.waitForTimeout(1500);
    const r2 = await page.evaluate(() => { const a = window.__fakeDocs.get('kaizen4_logs'); return { parts: a.parts.length, bytes: window.storage.docBytes('kaizen4_logs', a), part2: window.__fakeDocs.has('kaizen4_logs__part_2') }; });
    ok(r2.parts === 1 && !r2.part2 && r2.bytes < 400000, 'the next Kaizen save (its in-memory log still holds the sealed days) seals nothing twice');
    await done(ctx, '4 seal');
  }
}

// ── 5. Split values ───────────────────────────────────────────────
async function part5() {
  console.log('\n[5. A value of any other shape over 900,000 bytes is split, and put back exactly]');
  const ctx = await open({});
  const { page } = ctx;
  const r = await page.evaluate(async () => {
    const unit = 'abc é 漢字 😀 ';
    const v1 = JSON.stringify({ note: unit.repeat(50000), n: 1 });
    const v2 = JSON.stringify({ note: unit.repeat(52000), n: 2 });
    window.__v1 = v1; window.__v2 = v2;
    const m = window.__fakeOrder.length;
    const w = await window.storage.set('big:blob', v1);
    const main = window.__fakeDocs.get('big_blob');
    const order = window.__fakeOrder.slice(m);
    const pieces = main.split ? main.split.pieces : [];
    localStorage.removeItem('big:blob'); // read it back like a fresh device would
    const back = (await window.storage.get('big:blob')).value;
    return { w, bytes: new TextEncoder().encode(v1).length, valueNull: main.value === null, gen: main.split && main.split.gen, pieces, order,
      pieceBytes: pieces.map(id => window.storage.docBytes(id, window.__fakeDocs.get(id))), exact: back === v1 };
  });
  ok(r.w === 'cloud' && r.valueNull && r.pieces.length >= 2 && r.pieceBytes.every(b => b <= 900000), `a ${r.bytes}-byte value is stored in ${r.pieces.length} pieces, each ≤ 900,000 bytes (${r.pieceBytes.join(', ')})`);
  ok(r.order.slice(0, r.pieces.length).every((o, i) => o === 'set ' + r.pieces[i]) && r.order[r.pieces.length] === 'set big_blob', 'the pieces are written before the doc points at them');
  ok(r.exact, 'it reads back exactly (multi-byte characters and emoji intact)');
  const fail = await page.evaluate(async (oldGen) => {
    // The second new piece is rejected: the save must leave the old value whole.
    window.__fakeFail = (op, id, data) => (op === 'set' && /^big_blob__split_/.test(id) && data && data.gen !== oldGen && data.index === 1 ? 'reject' : null);
    const w = await window.storage.set('big:blob', window.__v2);
    window.__fakeFail = null;
    const main = window.__fakeDocs.get('big_blob');
    const stray = [...window.__fakeDocs.keys()].filter(k => k.startsWith('big_blob__split_') && !main.split.pieces.includes(k));
    const cloud = main.split.pieces.map(id => window.__fakeDocs.get(id).value).join('');
    return { w, sameGen: main.split.gen === oldGen, intact: cloud === window.__v1, stray };
  }, r.gen);
  ok(fail.w === 'device-only' && fail.sameGen && fail.intact && fail.stray.length === 0, 'a piece that fails → device-only; the cloud still has the whole old value, and the new pieces are cleaned up');
  const fail2 = await page.evaluate(async (oldGen) => {
    window.__fakeFail = (op, id) => (op === 'set' && id === 'big_blob' ? 'reject' : null);
    await window.storage.flush();
    window.__fakeFail = null;
    const main = window.__fakeDocs.get('big_blob');
    const stray = [...window.__fakeDocs.keys()].filter(k => k.startsWith('big_blob__split_') && !main.split.pieces.includes(k));
    return { sameGen: main.split.gen === oldGen, intact: main.split.pieces.map(id => window.__fakeDocs.get(id).value).join('') === window.__v1, stray, waiting: window.storage.status().waiting };
  }, r.gen);
  ok(fail2.sameGen && fail2.intact && fail2.stray.length === 0 && fail2.waiting === 1, 'the doc write itself fails (on upload) → old value intact, new pieces cleaned up, still waiting');
  const up = await page.evaluate(async () => {
    await window.storage.flush();
    const main = window.__fakeDocs.get('big_blob');
    const pieces = [...window.__fakeDocs.keys()].filter(k => k.startsWith('big_blob__split_'));
    return { waiting: window.storage.status().waiting, exact: (await window.storage.get('big:blob')).value === window.__v2, pieces: pieces.length, listed: main.split.pieces.length };
  });
  ok(up.waiting === 0 && up.exact && up.pieces === up.listed, 'the next upload succeeds: the new value reads back exactly and the old pieces are deleted');
  const small = await page.evaluate(async () => {
    const w = await window.storage.set('big:blob', '{"small":true}');
    const main = window.__fakeDocs.get('big_blob');
    return { w, value: main.value, split: !!main.split, pieces: [...window.__fakeDocs.keys()].filter(k => k.startsWith('big_blob__split_')).length };
  });
  ok(small.w === 'cloud' && small.value === '{"small":true}' && !small.split && small.pieces === 0, 'saving a small value again removes the pieces');
  await done(ctx, '5');
}

// ── 6. Size table, backup and restore with parts ───────────────────
async function part6() {
  console.log('\n[6. The size table; a format-3 backup restores into an empty database exactly]');
  const L = (h) => ({ brainDump: '', highlight: h, micro: '', done: [], reflection: '' });
  const fake = {
    kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify({ '2025-07-10': L('old') }) },
    kaizen3_seeded: { key: 'kaizen3:seeded', value: 'true' }, kaizen3_projects: { key: 'kaizen3:projects', value: '[]' }, kaizen3_tasks: { key: 'kaizen3:tasks', value: '[]' },
  };
  const ctx = await open(fake);
  const { page } = ctx;
  const setup = await page.evaluate(async () => {
    const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    const L = (h) => ({ brainDump: '', highlight: h, micro: '', done: [], reflection: '' });
    // kaizen4:logs (sealed) with 400 days, a 1.3 MB blob (split), and a conflict copy.
    const logs = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [day(i + 200), L('g'.repeat(2100))]));
    const a = await window.storage.set('kaizen4:logs', JSON.stringify(logs));
    window.__blob = JSON.stringify({ note: 'z'.repeat(1300000) });
    const b = await window.storage.set('size:blob', window.__blob);
    window.__fakeDocs.set('size_note__conflict_2026-10-04T10_00_00_000Z', { key: 'size:note', value: '"device version"', conflictOf: 'size_note', savedAt: new Date('2026-10-04T10:00:00Z') });
    window.__fakeDocs.set('size_note', { key: 'size:note', value: '"cloud version"', updatedAt: new Date('2026-10-04T11:00:00Z') });
    return { a, b, parts: (window.__fakeDocs.get('kaizen4_logs').parts || []).length };
  });
  ok(setup.a === 'cloud' && setup.b === 'cloud' && setup.parts >= 1, `set up a sealed kaizen4:logs (${setup.parts} part) and a split doc`);
  await nav(page, 'System');
  await page.waitForSelector('[data-nw-sizes] tbody tr');
  const rows = await page.$$eval('[data-nw-sizes] tbody tr', trs => trs.map(tr => { const td = tr.querySelectorAll('td'); return { id: td[0].firstChild.textContent, kind: td[0].innerText, pct: parseFloat(td[2].innerText) }; }));
  const ids = await page.evaluate(() => [...window.__fakeDocs.keys()].sort());
  ok(rows.length === ids.length && JSON.stringify(rows.map(r => r.id).sort()) === JSON.stringify(ids), `the size table lists every doc and part (${rows.length})`);
  ok(rows.every((r, i) => i === 0 || rows[i - 1].pct >= r.pct) && rows[0].pct > 50 && rows[0].pct < 86, 'largest first, as % of the 1,048,576-byte limit → ' + rows.slice(0, 3).map(r => `${r.id} ${r.pct}%`).join(', '));
  ok(rows.some(r => r.id === 'kaizen4_logs__part_1' && /sealed part/.test(r.kind)) && rows.some(r => /^size_blob__split_/.test(r.id) && /piece of a split value/.test(r.kind)) && rows.some(r => r.id === 'kaizen3_logs' && /old Kaizen archive/.test(r.kind)) && rows.some(r => /__conflict_/.test(r.id) && /conflict copy/.test(r.kind)), 'parts, pieces, old archives and conflict copies are labelled');
  ok(await page.evaluate(() => document.querySelector('[data-nw-sizes]').getBoundingClientRect().right <= 390 && document.documentElement.scrollWidth <= 390), 'the table fits a 390-px screen (no sideways scroll)');
  const rr = await page.evaluate(async () => {
    const { backup } = await window.nwGatherBackup();
    const keys = backup.entries.map(e => e.key);
    const before = {};
    for (const k of keys) before[k] = (await window.storage.getAll(k)).value;
    window.__fakeDocs.clear(); // everything lost
    window.confirm = () => true;
    const res = await window.nwRestoreBackup(JSON.parse(JSON.stringify(backup)));
    const after = {};
    for (const k of keys) after[k] = (await window.storage.getAll(k)).value;
    const conflicts = [...window.__fakeDocs.keys()].filter(k => /__conflict_/.test(k));
    return { keys, res, same: keys.filter(k => after[k] === before[k]), differ: keys.filter(k => after[k] !== before[k]), conflicts,
      conflictValue: (window.__fakeDocs.get('size_note__conflict_2026-10-04T10_00_00_000Z') || {}).value, blobSplit: !!(window.__fakeDocs.get('size_blob') || {}).split,
      sealed: (window.__fakeDocs.get('kaizen4_logs').parts || []).length };
  });
  ok(rr.res.restored === rr.keys.length && rr.res.failed.length === 0, `format 3: restore writes every key (${rr.keys.length}) through window.storage`);
  ok(rr.differ.length === 0 && rr.same.length === rr.keys.length, "after restoring into an empty database, every key's getAll matches the backup → differ: " + JSON.stringify(rr.differ));
  ok(rr.blobSplit && rr.sealed >= 1, 'the restored big value is split again and kaizen4:logs is sealed again');
  ok(rr.conflicts.length === 1 && rr.conflictValue === '"device version"', 'the conflict copy is kept in the backup and restored');
  await done(ctx, '6');
}

// ── Helpers for the parts below ───────────────────────────────────
const KL = (h, extra = {}) => ({ brainDump: '', highlight: h, micro: '', done: [], reflection: '', ...extra });
const KBASE = {
  kaizen3_projects: { key: 'kaizen3:projects', value: '[]' }, kaizen3_tasks: { key: 'kaizen3:tasks', value: '[]' }, kaizen3_seeded: { key: 'kaizen3:seeded', value: 'true' },
};
// A value stored the way window.storage splits it: the main doc points at pieces of ≤ 700,000 bytes (ASCII here).
const splitDocs = (key, value, gen = 'g1') => {
  const id = sanitise(key);
  const pieces = [];
  for (let i = 0; i * 700000 < value.length; i++) pieces.push(value.slice(i * 700000, (i + 1) * 700000));
  const docs = { [id]: { key, value: null, split: { gen, count: pieces.length, pieces: pieces.map((_, i) => `${id}__split_${gen}_${i}`), bytes: value.length }, updatedAt: '2026-10-01T00:00:00.000Z' } };
  pieces.forEach((p, i) => { docs[`${id}__split_${gen}_${i}`] = { key, splitOf: id, gen, index: i, count: pieces.length, value: p }; });
  return docs;
};
// In the page: navigator.onLine follows sessionStorage.__test_offline, which survives a reload.
const offlineSwitch = async (page) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => sessionStorage.getItem('__test_offline') !== '1', configurable: true });
  });
};
const setOnline = (page, on) => page.evaluate((on) => {
  if (on) sessionStorage.removeItem('__test_offline'); else sessionStorage.setItem('__test_offline', '1');
  window.dispatchEvent(new Event(on ? 'online' : 'offline'));
}, on);
const reloaded = async (page) => {
  await page.reload();
  await page.waitForFunction(() => document.querySelector('nav button') && window.storage && window.storage.status, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
};

// ── 8. Big keys outside SEALED_LOG_KEYS stay whole and editable ────
async function part8() {
  console.log('\n[8. A 1 MB kaizen3:tasks and a 1 MB creative-catch: whole, split, every item editable and deletable]');
  const tasks = Array.from({ length: 200 }, (_, i) => ({ id: 't' + i, projectId: 'p1', name: `Task ${String(i).padStart(4, '0')}`, leadDays: 0, sprint: 'S3', estimatedTime: 30, est: 30, actualTime: null, status: 'open', subtasks: [], notes: 'n'.repeat(5200), createdAt: '2026-09-01T00:00:00.000Z' }));
  const catches = Array.from({ length: 200 }, (_, i) => ({ id: 'c' + i, kind: 'text', text: `Catch ${String(i).padStart(4, '0')} ` + 'c'.repeat(5200), date: '2026-09-01T00:00:00.000Z' }));
  const tasksV = JSON.stringify(tasks), catchV = JSON.stringify(catches);
  const fake = {
    ...KBASE, kaizen3_projects: { key: 'kaizen3:projects', value: JSON.stringify([{ id: 'p1', name: 'Big project', archetype: 'x', finalDeadline: '2026-12-01', status: 'active' }]) },
    ...splitDocs('kaizen3:tasks', tasksV), ...splitDocs('creative-catch', catchV),
  };
  const ctx = await open(fake);
  const { page } = ctx;
  page.on('dialog', async (d) => { if (d.type() === 'prompt') await d.accept('Edited catch text'); else await d.accept(); });
  const r = await page.evaluate(async ({ tasksV, catchV }) => ({
    tasks: (await window.storage.get('kaizen3:tasks')).value === tasksV, catch: (await window.storage.get('creative-catch')).value === catchV,
    bytes: [tasksV.length, catchV.length],
  }), { tasksV, catchV });
  ok(r.tasks && r.catch && r.bytes.every(b => b > 1000000), `get returns each whole (${r.bytes.join(' and ')} bytes, put together from split pieces)`);
  await nav(page, 'Kaizen');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.waitForTimeout(500);
  const shown = await page.locator('body').innerText();
  ok(shown.includes('Task 0000') && shown.includes('Task 0199'), "Kaizen's Tasks view shows the first and the last task (loaded with get)");
  // Edit Task 0007's name.
  const editRow = (name) => page.evaluate((name) => {
    const rows = [...document.querySelectorAll('div')].filter(d => d.style.position === 'relative' && d.textContent.includes(name) && d.querySelector(':scope > button'));
    rows.sort((a, b) => a.textContent.length - b.textContent.length)[0].querySelector(':scope > button').click();
  }, name);
  await editRow('Task 0007');
  await page.evaluate(() => { [...document.querySelectorAll('input')].find(i => i.value === 'Task 0007').setAttribute('data-test-name', '1'); });
  await page.locator('input[data-test-name]').fill('Task 0007 edited');
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(1500);
  // Delete Task 0008.
  await editRow('Task 0008');
  await page.waitForTimeout(200);
  await page.evaluate(() => { const cancel = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel' && b.offsetParent !== null); cancel.nextElementSibling.click(); });
  await page.getByRole('button', { name: 'Sure?', exact: true }).click();
  await page.waitForTimeout(1500);
  const t = await page.evaluate(async () => {
    const v = JSON.parse((await window.storage.get('kaizen3:tasks')).value);
    const main = window.__fakeDocs.get('kaizen3_tasks');
    return { n: v.length, edited: v.find(x => x.id === 't7').name, gone: !v.some(x => x.id === 't8'), split: !!main.split && main.split.pieces.length >= 2, parts: [...window.__fakeDocs.keys()].filter(k => /__part_/.test(k)) };
  });
  ok(t.edited === 'Task 0007 edited' && t.gone && t.n === 199, 'a task edited and a task deleted in the Tasks view are saved (199 left)');
  ok(t.split && t.parts.length === 0, 'kaizen3:tasks is stored as split pieces, with no __part_ docs');
  // creative-catch: edit (prompt) and delete (confirm) in the Catch list.
  await nav(page, 'Play');
  await page.getByRole('button', { name: /^Catch \(/ }).click();
  await page.waitForTimeout(500);
  // The card's own buttons (the text box's parent holds "edit" and "delete").
  const press = (n, label) => page.evaluate(({ n, label }) => {
    const text = [...document.querySelectorAll('div')].find(d => d.offsetParent !== null && d.textContent.startsWith(`Catch ${n} `) && !d.querySelector('div'));
    const b = [...text.parentElement.querySelectorAll('button')].find(x => x.textContent.trim() === label);
    setTimeout(() => b.click(), 0);
    return !!b;
  }, { n, label });
  ok(await press('0003', 'edit'), 'the Catch list has an edit button on each catch');
  await page.waitForTimeout(1500);
  await press('0004', 'delete');
  await page.waitForTimeout(1500);
  const c = await page.evaluate(async () => {
    const v = JSON.parse((await window.storage.get('creative-catch')).value);
    const main = window.__fakeDocs.get('creative-catch');
    return { n: v.length, edited: (v.find(x => x.id === 'c3') || {}).text, gone: !v.some(x => x.id === 'c4'), split: !!main.split, parts: [...window.__fakeDocs.keys()].filter(k => /__part_/.test(k)) };
  });
  ok(c.edited === 'Edited catch text' && c.gone && c.n === 199, 'a catch edited and a catch deleted in the Catch list are saved (199 left)');
  ok(c.split && c.parts.length === 0, 'creative-catch is stored as split pieces, with no __part_ docs');
  const k4 = await page.evaluate(async () => {
    const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    const logs = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [day(i), { highlight: 'd'.repeat(2800) }]));
    const w = await window.storage.set('kaizen4:logs', JSON.stringify(logs));
    const act = window.__fakeDocs.get('kaizen4_logs');
    return { w, parts: (act.parts || []).map(p => p.id), bytes: window.storage.docBytes('kaizen4_logs', act), all: Object.keys(JSON.parse((await window.storage.getAll('kaizen4:logs')).value)).length };
  });
  ok(k4.w === 'cloud' && k4.parts.includes('kaizen4_logs__part_1') && k4.bytes < 400000 && k4.all === 300, 'kaizen4:logs still seals as before: an 860 KB log moves its oldest days to kaizen4_logs__part_1');
  await done(ctx, '8');
}

// ── 9. Deleting items of a key in SEALED_LOG_KEYS ──────────────────
async function part9() {
  console.log('\n[9. Deleting kaizen4:logs days in a sealed part and in an old Kaizen archive: hidden, parts unchanged, restorable]');
  const part1 = { '2026-09-05': KL('Sealed part day'), '2026-09-06': KL('Other sealed day') };
  const fake = {
    ...KBASE,
    kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify({ '2026-07-10': KL('Old kaizen3 freeze day') }) },
    kaizen4_logs_archive_2026_07_06: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-08-01': KL('Rescue archive day') }) },
    kaizen4_logs__part_1: { key: 'kaizen4:logs', value: JSON.stringify(part1), sealed: true, partOf: 'kaizen4_logs', n: 1, shape: 'dated', order: 'oldest-first', count: 2, rangeKind: 'date', from: '2026-09-05', to: '2026-09-06' },
    kaizen4_logs: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-10-01': KL('Active day') }), parts: [{ id: 'kaizen4_logs__part_1', n: 1, count: 2, rangeKind: 'date', from: '2026-09-05', to: '2026-09-06', bytes: 100 }], shape: 'dated', order: 'oldest-first', updatedAt: '2026-10-01T00:00:00.000Z' },
  };
  const ctx = await open(fake);
  const { page } = ctx;
  const partsBefore = await page.evaluate(() => Object.fromEntries(['kaizen3_logs', 'kaizen4_logs_archive_2026_07_06', 'kaizen4_logs__part_1'].map(id => [id, JSON.stringify(window.__fakeDocs.get(id))])));
  const partsSame = () => page.evaluate((b) => Object.entries(b).every(([id, v]) => JSON.stringify(window.__fakeDocs.get(id)) === v), partsBefore);
  await nav(page, 'Kaizen');
  await page.getByRole('button', { name: 'Reflect', exact: true }).click();
  await page.waitForTimeout(400);
  let t = await page.locator('body').innerText();
  ok(['Old kaizen3 freeze day', 'Rescue archive day', 'Sealed part day', 'Other sealed day', 'Active day'].every(h => t.includes(h)), 'Reflect shows days from the old archives, the sealed part and the active doc');
  const del = async (h, date) => {
    await page.getByText(h, { exact: false }).first().click();
    await page.locator(`[data-nw-delete-day="${date}"]`).click();
    ok((await page.locator(`[data-nw-delete-day="${date}"]`).innerText()) === 'Tap again to delete this day', `deleting ${date} asks for a second tap ("Tap again to delete this day")`);
    await page.locator(`[data-nw-delete-day="${date}"]`).click();
    await page.waitForTimeout(800);
  };
  await del('Sealed part day', '2026-09-05');
  await del('Old kaizen3 freeze day', '2026-07-10');
  t = await page.locator('body').innerText();
  const g = await page.evaluate(async () => {
    const all = JSON.parse((await window.storage.getAll('kaizen4:logs')).value);
    const act = window.__fakeDocs.get('kaizen4_logs');
    return { dates: Object.keys(all), deleted: (act.deleted || []).map(m => m.date), activeDates: Object.keys(JSON.parse(act.value)) };
  });
  ok(!t.includes('Sealed part day') && !t.includes('Old kaizen3 freeze day') && t.includes('Other sealed day') && t.includes('Rescue archive day'), 'Reflect hides both deleted days and still shows the others');
  ok(JSON.stringify(g.dates) === JSON.stringify(['2026-08-01', '2026-09-06', '2026-10-01']), 'getAll leaves both out → ' + g.dates.join(', '));
  ok(JSON.stringify(g.deleted.sort()) === JSON.stringify(['2026-07-10', '2026-09-05']) && JSON.stringify(g.activeDates) === '["2026-10-01"]', 'the active doc holds a deleted marker for each; its own days are unchanged');
  ok(await partsSame(), 'the sealed part and both old archive docs are unchanged');
  // Restore from "Deleted days".
  await page.locator('[data-nw-deleted-days] button').first().click();
  t = await page.locator('[data-nw-deleted-days]').innerText();
  ok(/Deleted days \(2\)/.test(t) && t.includes('Sealed part day') && t.includes('Old kaizen3 freeze day') && t.includes('Deleted days stay saved. Restore puts a day back.'), 'Reflect lists "Deleted days (2)" with each day\'s highlight');
  await page.locator('[data-nw-restore-day="2026-09-05"]').click();
  await page.waitForTimeout(800);
  const r1 = await page.evaluate(async () => ({ dates: Object.keys(JSON.parse((await window.storage.getAll('kaizen4:logs')).value)), deleted: (window.__fakeDocs.get('kaizen4_logs').deleted || []).map(m => m.date) }));
  t = await page.locator('body').innerText();
  ok(r1.dates.includes('2026-09-05') && JSON.stringify(r1.deleted) === '["2026-07-10"]' && t.includes('Sealed part day'), 'Restore removes the marker: the sealed-part day is back in getAll and in Reflect');
  await page.locator('[data-nw-restore-day="2026-07-10"]').click();
  await page.waitForTimeout(800);
  const r2 = await page.evaluate(async () => ({ dates: Object.keys(JSON.parse((await window.storage.getAll('kaizen4:logs')).value)), deleted: window.__fakeDocs.get('kaizen4_logs').deleted || [] }));
  t = await page.locator('body').innerText();
  ok(r2.dates.length === 5 && r2.deleted.length === 0 && t.includes('Old kaizen3 freeze day') && !(await page.locator('[data-nw-deleted-days]').count()), 'the old-archive day is back too; no markers left and the Deleted days list is gone');
  ok(await partsSame(), 'the part docs are still unchanged');
  // A day typed into again after it was deleted shows (the active doc's copy), and an edit of a sealed day wins.
  const e = await page.evaluate(async () => {
    await window.storage.deleteItem('kaizen4:logs', { date: '2026-09-06' });
    const cur = JSON.parse((await window.storage.get('kaizen4:logs')).value);
    cur['2026-09-06'] = { highlight: 'Retyped day' };
    await window.storage.set('kaizen4:logs', JSON.stringify(cur));
    return JSON.parse((await window.storage.getAll('kaizen4:logs')).value)['2026-09-06'];
  });
  ok(e && e.highlight === 'Retyped day', 'a deleted day typed into again shows the new copy');
  await done(ctx, '9');

  console.log('\n[9. Arrays in a sealed log: deletes by id, and by position for items with no id]');
  {
    const items = [{ id: 'a', t: 'one' }, { id: 'b', t: 'two' }, { t: 'no id' }, { t: 'no id' }, { t: 'third' }];
    const fake2 = {
      grow_list__part_1: { key: 'grow:list', value: JSON.stringify(items.slice(0, 4)), sealed: true, partOf: 'grow_list', n: 1, shape: 'array', order: 'oldest-first', count: 4, rangeKind: 'index', from: 0, to: 3 },
      grow_list: { key: 'grow:list', value: JSON.stringify(items.slice(4)), parts: [{ id: 'grow_list__part_1', n: 1, count: 4, rangeKind: 'index', from: 0, to: 3, bytes: 80 }], shape: 'array', order: 'oldest-first' },
    };
    const ctx2 = await open(fake2, { html: sealedAlso(['grow:list']) });
    const p2 = ctx2.page;
    const r = await p2.evaluate(async () => {
      const part = JSON.stringify(window.__fakeDocs.get('grow_list__part_1'));
      const all = async () => JSON.parse((await window.storage.getAll('grow:list')).value);
      const w1 = await window.storage.deleteItem('grow:list', { id: 'b' });
      const afterId = await all();
      const w2 = await window.storage.deleteItem('grow:list', { index: 2 }); // the second "no id" item (index in afterId)
      const afterPos = await all();
      const marks = window.__fakeDocs.get('grow_list').deleted;
      const w3 = await window.storage.deleteItem('grow:list', { index: afterPos.length - 1 }); // "third", in the active doc
      const afterActive = await all();
      const active = JSON.parse(window.__fakeDocs.get('grow_list').value);
      const listed = await window.storage.deletedItems('grow:list');
      await window.storage.restoreItem('grow:list', { id: 'b' });
      await window.storage.restoreItem('grow:list', marks.find(m => m.part));
      return { w: [w1, w2, w3], afterId, afterPos, marks, afterActive, active, listed: listed.map(x => x.item), restored: await all(), same: JSON.stringify(window.__fakeDocs.get('grow_list__part_1')) === part };
    });
    ok(r.w.every(x => x === 'cloud') && JSON.stringify(r.afterId) === JSON.stringify([{ id: 'a', t: 'one' }, { t: 'no id' }, { t: 'no id' }, { t: 'third' }]), 'an item with an id in a sealed part is hidden by an { id } marker');
    ok(JSON.stringify(r.afterPos) === JSON.stringify([{ id: 'a', t: 'one' }, { t: 'no id' }, { t: 'third' }]) && r.marks.some(m => m.part === 'grow_list__part_1' && m.index === 3 && typeof m.hash === 'string'), 'of two identical items with no id, only the one tapped is hidden: the marker names its part, position and a hash of it');
    ok(JSON.stringify(r.afterActive) === JSON.stringify([{ id: 'a', t: 'one' }, { t: 'no id' }]) && JSON.stringify(r.active) === '[]', 'an item in the active doc is simply removed from it');
    ok(r.listed.length === 2 && r.listed.some(x => x && x.id === 'b'), 'deletedItems lists each marker with the item it hides');
    ok(JSON.stringify(r.restored) === JSON.stringify([{ id: 'a', t: 'one' }, { id: 'b', t: 'two' }, { t: 'no id' }, { t: 'no id' }]) && r.same, 'removing both markers brings both back; the part doc is unchanged');
    await done(ctx2, '9 arrays');
  }
}

// ── 10. A key outside SEALED_LOG_KEYS that already has sealed parts ─
async function part10() {
  console.log('\n[10. Old sealed parts of a key outside SEALED_LOG_KEYS are folded back whole]');
  const mk = (key, partItems, activeItems) => {
    const id = sanitise(key);
    return {
      [id + '__part_1']: { key, value: JSON.stringify(partItems), sealed: true, partOf: id, n: 1, shape: 'array', order: 'oldest-first', count: partItems.length, rangeKind: 'index', from: 0, to: partItems.length - 1 },
      [id]: { key, value: JSON.stringify(activeItems), parts: [{ id: id + '__part_1', n: 1, count: partItems.length, rangeKind: 'index', from: 0, to: partItems.length - 1, bytes: 40 }], shape: 'array', order: 'oldest-first', updatedAt: '2026-10-01T00:00:00.000Z' },
    };
  };
  const fake = { ...mk('fold:list', [{ n: 1 }, { n: 2 }], [{ n: 3 }]), ...mk('fold:fail', [{ n: 1 }], [{ n: 2 }]), ...mk('fold:half', [{ n: 1 }], [{ n: 2 }]), ...mk('fold:blind', [{ n: 1 }, { n: 2 }], [{ n: 3 }]) };
  const ctx = await open(fake);
  const { page } = ctx;
  const r = await page.evaluate(async () => {
    const parts = () => JSON.stringify(['fold_list__part_1', 'fold_fail__part_1', 'fold_half__part_1', 'fold_blind__part_1'].map(id => window.__fakeDocs.get(id)));
    const before = parts();
    const got = (await window.storage.get('fold:list')).value;
    const seen = [];
    window.__fakeFail = (op, id, data) => { if (op === 'set' && id === 'fold_list') seen.push({ parts: Array.isArray(data.parts) && data.parts.length, folding: !!data.folding, value: data.value }); return null; };
    const v = JSON.parse(got); v.push({ n: 4 }); v.splice(0, 1); // a feature adds an item and deletes the oldest (which sits in the part)
    const w = await window.storage.set('fold:list', JSON.stringify(v));
    window.__fakeFail = null;
    const doc = window.__fakeDocs.get('fold_list');
    const after = { w, seen, docParts: 'parts' in doc, folding: 'folding' in doc, value: doc.value, get: (await window.storage.get('fold:list')).value, all: (await window.storage.getAll('fold:list')).value };
    // The first write fails: nothing changes, the parts list stays.
    await window.storage.get('fold:fail');
    window.__fakeFail = (op, id) => (op === 'set' && id === 'fold_fail' ? 'reject' : null);
    const wf = await window.storage.set('fold:fail', '[{"n":1},{"n":2},{"n":5}]');
    window.__fakeFail = null;
    const ff = window.__fakeDocs.get('fold_fail');
    // The second write (dropping the list) fails: the value is already whole and still reads whole.
    await window.storage.get('fold:half');
    let n = 0;
    window.__fakeFail = (op, id) => (op === 'set' && id === 'fold_half' && ++n === 2 ? 'reject' : null);
    const wh = await window.storage.set('fold:half', '[{"n":1},{"n":2},{"n":6}]');
    window.__fakeFail = null;
    const fh = window.__fakeDocs.get('fold_half');
    const halfGet = (await window.storage.get('fold:half')).value, halfAll = (await window.storage.getAll('fold:half')).value;
    // A save that didn't read the whole value first (no get this session): the parts are merged in, nothing is left out.
    const wb = await window.storage.set('fold:blind', '[{"n":9}]');
    const fb = window.__fakeDocs.get('fold_blind');
    return { before, afterParts: parts(), got, after, wf, ff: { parts: ff.parts.length, value: ff.value }, wh, fh: { parts: (fh.parts || []).length, folding: fh.folding, value: fh.value }, halfGet, halfAll, wb, fb: { parts: 'parts' in fb, value: fb.value } };
  });
  ok(r.got === '[{"n":1},{"n":2},{"n":3}]', 'get returns the merged whole (part + active) → ' + r.got);
  ok(r.after.w === 'cloud' && r.after.seen.length === 2 && r.after.seen[0].parts === 1 && r.after.seen[0].folding && r.after.seen[0].value === '[{"n":2},{"n":3},{"n":4}]' && !r.after.seen[1].parts && !r.after.seen[1].folding, 'the save writes the whole value first (parts list still there, marked folding), and only after that write is confirmed writes the doc again without the parts list');
  ok(!r.after.docParts && !r.after.folding && r.after.get === '[{"n":2},{"n":3},{"n":4}]' && r.after.all === r.after.get, "the key is plain again: get and getAll give the saved value (the feature's delete of an item from the old part sticks)");
  ok(r.wf === 'device-only' && r.ff.parts === 1 && r.ff.value === '[{"n":2}]', 'if the whole-value write fails, the doc and its parts list are left as they were (and the save waits on this device)');
  ok(r.wh === 'cloud' && r.fh.parts === 1 && r.fh.folding === true && r.fh.value === '[{"n":1},{"n":2},{"n":6}]' && r.halfGet === r.fh.value && r.halfAll === r.fh.value, "if only the second write fails, the whole value is in place; it reads whole (no item twice) and the next save retries");
  ok(r.wb === 'cloud' && !r.fb.parts && r.fb.value === '[{"n":1},{"n":2},{"n":9}]', "a save that didn't read the whole value first gets the part's items merged in, so nothing is left out");
  ok(r.before === r.afterParts, 'part docs are never touched');
  await done(ctx, '10');
}

// ── 11. Size banners and this device's saved data ─────────────────
async function part11() {
  console.log('\n[11. Size banners: none for old archives; one at 1.5 MB for a key outside SEALED_LOG_KEYS; the device meter]');
  const fake = {
    ...KBASE,
    kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify({ '2026-05-01': KL('x'.repeat(938000)) }) },
    'kaizen3_logs_archive_2026-06-14': { key: 'kaizen3:logs', value: JSON.stringify({ '2026-06-14': KL('y'.repeat(929000)) }) },
    kaizen4_logs: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-10-01': KL('Active day') }) },
  };
  const ctx = await open(fake);
  const { page } = ctx;
  await nav(page, 'Kaizen');
  await page.getByRole('button', { name: 'Reflect', exact: true }).click();
  await page.waitForTimeout(500);
  const sizes = await page.evaluate(() => ({ sizes: window.storage.status().banners.filter(b => b.kind === 'size' || b.kind === 'big'), bytes: ['kaizen3_logs', 'kaizen3_logs_archive_2026-06-14'].map(id => window.storage.docBytes(id, window.__fakeDocs.get(id))) }));
  ok(sizes.bytes.every(b => b > 900000) && sizes.sizes.length === 0, `no size banner for the old archives (${sizes.bytes.join(' and ')} bytes) after they are read`);
  await nav(page, 'System');
  await page.waitForSelector('[data-nw-sizes] tbody tr');
  const ids = await page.$$eval('[data-nw-sizes] tbody tr', trs => trs.map(tr => tr.querySelector('td').firstChild.textContent));
  ok(ids.includes('kaizen3_logs') && ids.includes('kaizen3_logs_archive_2026-06-14'), 'both stay in the size table');
  const big = await page.evaluate(async () => {
    const w = await window.storage.set('creative-catch', JSON.stringify([{ id: 'c1', text: 'q'.repeat(1.6 * 1024 * 1024) }]));
    const w2 = await window.storage.set('mystery:big', 'r'.repeat(1.7 * 1024 * 1024));
    return { w, w2, banners: window.storage.status().banners.filter(b => b.kind === 'big').map(b => b.text) };
  });
  ok(big.w === 'cloud' && big.banners.includes("Creative catch list (key creative-catch) is 1.6 MB in total. Each save now uploads the whole value, and this device's copy may stop fitting.") && big.banners.includes("\"mystery:big\" is 1.7 MB in total. Each save now uploads the whole value, and this device's copy may stop fitting."), 'a key outside SEALED_LOG_KEYS over 1.5 MB gets a banner naming it → ' + JSON.stringify(big.banners));
  const small = await page.evaluate(async () => {
    await window.storage.set('mystery:big', 'small now');
    return window.storage.status().banners.filter(b => b.kind === 'big').length;
  });
  ok(small === 1, 'the banner goes when the key is small again');
  // This device's saved data: the System tab meter matches a count of localStorage at 2 bytes per character.
  await nav(page, 'Kaizen'); await nav(page, 'System');
  await page.waitForTimeout(300);
  const meter = await page.evaluate(() => {
    let chars = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); chars += k.length + localStorage.getItem(k).length; }
    return { expect: `${(chars * 2 / 1048576).toFixed(2)} MB of about 5 MB (${Math.round(chars * 2 / (5 * 1048576) * 100)}%)`, shown: document.querySelector('[data-nw-device-usage]').textContent };
  });
  ok(meter.shown === meter.expect, `the System tab shows this device's saved data → "${meter.shown}"`);
  const before70 = await page.evaluate(() => window.storage.status().banners.filter(b => b.kind === 'device-full').length);
  const at = await page.evaluate(async () => {
    let chars = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); chars += k.length + localStorage.getItem(k).length; }
    const need = Math.ceil(0.71 * 5 * 1048576 / 2) - chars; // a fixture that takes this device to 71%
    localStorage.setItem('fixture:filler', 'f'.repeat(Math.max(0, need - 'fixture:filler'.length)));
    await window.storage.set('meter:poke', '1');
    await new Promise(r => setTimeout(r, 600));
    return { banner: (window.storage.status().banners.find(b => b.kind === 'device-full') || {}).text, usage: window.storage.deviceUsage() };
  });
  await nav(page, 'Kaizen'); await nav(page, 'System');
  await page.waitForTimeout(300);
  const shown = await page.locator('[data-nw-device-usage]').textContent();
  ok(before70 === 0 && /^This device's saved data is 3\.\d\d MB of about 5 MB \(7[01]%\)\. When it is full, saves made offline can't be kept on this device\.$/.test(at.banner || ''), 'at 70% a banner says so → ' + JSON.stringify(at.banner));
  ok(/^3\.\d\d MB of about 5 MB \(7[01]%\)$/.test(shown) && await page.locator('[data-nw-banner="device-full"]').isVisible(), 'the meter shows it and the banner is on screen → ' + shown);
  await page.evaluate(() => localStorage.removeItem('fixture:filler'));
  await done(ctx, '11');
}

// ── 12. Offline: this device's copy at once; older history line; never overwrite a newer cloud copy ──
async function part12() {
  console.log("\n[12. Offline reads use this device's copy at once; older history shows one plain line]");
  const fake = {
    ...KBASE,
    kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify({ '2026-07-10': KL('Old kaizen3 freeze day') }) },
    kaizen4_logs__part_1: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-09-05': KL('Sealed part day') }), sealed: true, partOf: 'kaizen4_logs', n: 1, shape: 'dated', order: 'oldest-first', count: 1, rangeKind: 'date', from: '2026-09-05', to: '2026-09-05' },
    kaizen4_logs: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-10-01': KL('Active day') }), parts: [{ id: 'kaizen4_logs__part_1', n: 1, count: 1, rangeKind: 'date', from: '2026-09-05', to: '2026-09-05', bytes: 90 }], shape: 'dated', order: 'oldest-first', updatedAt: '2026-10-01T00:00:00.000Z' },
    q_other: { key: 'q:other', value: 'cloud v1', updatedAt: '2026-10-01T00:00:00.000Z' },
    q_never: { key: 'q:never', value: 'cloud only', updatedAt: '2026-10-01T00:00:00.000Z' },
  };
  const ctx = await openPage({ fakeFirestore: fake, now: NOW });
  const { page } = ctx;
  await offlineSwitch(page);
  await reloaded(page);
  await page.evaluate(async () => { await window.storage.get('q:other'); await window.storage.getAll('kaizen4:logs'); localStorage.removeItem('q:never'); });
  await setOnline(page, false);
  await reloaded(page);
  const r = await page.evaluate(async () => {
    const t0 = Date.now();
    const a = await window.storage.get('kaizen4:logs');
    const all = await window.storage.getAll('kaizen4:logs');
    const other = await window.storage.get('q:other');
    return { ms: Date.now() - t0, active: JSON.parse(a.value)['2026-10-01'].highlight, all: Object.keys(JSON.parse(all.value)), other: other && other.value,
      banners: window.storage.status().banners.map(b => b.kind), older: window.storage.status().olderOffline };
  });
  ok(r.ms < 1000 && r.active === 'Active day' && r.other === 'cloud v1', `offline after a reload, reads give this device's copy at once (${r.ms} ms, no 15-second wait)`);
  await nav(page, 'Kaizen');
  await page.getByRole('button', { name: 'Reflect', exact: true }).click();
  await page.waitForTimeout(400);
  const line = await page.locator('[data-nw-older]').innerText();
  ok(line.trim() === "Older history loads when you're online" && !r.banners.includes('read') && JSON.stringify(r.older) === '["kaizen4:logs"]' && (await page.locator('body').innerText()).includes('Active day'), "older sealed history not on this device: one plain line \"Older history loads when you're online\", no error banner; Reflect shows this device's days");
  const w = await page.evaluate(async () => {
    const off = await window.storage.set('q:other', 'device edit');
    const never = await window.storage.set('q:never', 'typed offline');
    // Meanwhile another device saves q:other in the cloud (before this device's save time).
    window.__fakeDocs.set('q_other', { key: 'q:other', value: 'other device', updatedAt: new Date(Date.now() - 60000) });
    return { off, never };
  });
  ok(w.off === 'device-only' && w.never === 'device-only', 'saves while offline are device-only');
  await setOnline(page, true);
  await waitFor(page, () => window.storage.status().waiting === 0);
  const u = await page.evaluate(() => ({
    other: window.__fakeDocs.get('q_other').value, never: window.__fakeDocs.get('q_never').value,
    copies: [...window.__fakeDocs.keys()].filter(k => /__conflict_/.test(k)).map(k => [window.__fakeDocs.get(k).key, window.__fakeDocs.get(k).value]).sort(),
  }));
  ok(u.other === 'other device' && u.never === 'cloud only' && JSON.stringify(u.copies) === JSON.stringify([['q:never', 'typed offline'], ['q:other', 'device edit']]),
    "back online, a cloud copy that changed since this device's copy (even earlier than the offline save), or that this device never had, is kept; this device's version is saved beside it");
  await page.waitForTimeout(300);
  const line2 = await page.locator('[data-nw-older]').innerText();
  ok(/Back online\. Reload to see older history\./.test(line2) && await page.locator('[data-nw-older] button', { hasText: 'Reload' }).isVisible(), 'back online, the line says "Back online. Reload to see older history." with a Reload button');
  const up = await page.evaluate(async () => { const w = await window.storage.set('q:fresh', 'online'); return { w, cloud: window.__fakeDocs.get('q_fresh').value }; });
  ok(up.w === 'cloud' && up.cloud === 'online', 'back online, a new save goes to the cloud');
  await done(ctx, '12');
}

// ── 7. Storage-layer rule ─────────────────────────────────────────
function part7() {
  console.log('\n[7. Storage-layer check]');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(check(html).length === 0, 'index.html: no Firestore or localStorage writes outside the storage layer and the token cache');
  const at = 'function App() {';
  const fsWrite = check(html.replace(at, at + "\n  db.collection('appdata').doc('x').set({ value: 1 });"));
  ok(fsWrite.length === 1 && /Firestore/.test(fsWrite[0].why), 'a db.collection(...).set added in App fails the check');
  const del = check(html.replace(at, at + "\n  const r = firebase.firestore().collection('appdata'); r.doc('x').delete();"));
  ok(del.length >= 1, 'a Firestore delete through another handle fails the check');
  const ls = check(html.replace(at, at + "\n  localStorage.setItem('x', '1');"));
  ok(ls.length === 1 && /localStorage\.setItem/.test(ls[0].why), 'a localStorage.setItem added in App fails the check');
  const tok = check(html.replace('  // ══ NW-TOKEN-CACHE END ══', "  const extra = () => localStorage.setItem('gdrive_x', '1');\n  // ══ NW-TOKEN-CACHE END ══"));
  ok(tok.length === 0, 'inside the token cache it is allowed');
  const nomark = check(html.replace('NW-STORAGE-LAYER END', 'removed'));
  ok(nomark.length >= 1, 'a missing marker fails the check');
}

(async () => {
  const which = process.argv[2] || 'all';
  const run = (n) => which === 'all' || which === String(n);
  if (run(7)) part7();
  if (run(1)) await part1();
  if (run(2)) await part2();
  if (run(3)) await part3();
  if (run(4)) await part4();
  if (run(5)) await part5();
  if (run(6)) await part6();
  if (run(8)) await part8();
  if (run(9)) await part9();
  if (run(10)) await part10();
  if (run(11)) await part11();
  if (run(12)) await part12();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
