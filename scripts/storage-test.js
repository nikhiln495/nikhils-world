// Checks for the storage layer (window.storage in index.html): honest saves, the upload queue, seal and
// continue, split values, the size table, backups with parts, and the storage-layer rule.
// Runs the page's REAL window.storage against the in-memory fake Firestore from p1-check.js; the live
// Firestore is never touched. Run: NODE_PATH=$(npm root -g) node scripts/storage-test.js [1-7|all]
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
  console.log('\n[3. Seal and continue at 800,000 bytes]');
  const ctx = await open({});
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
  console.log('\n[6. The size table; backups and restore include every part and piece]');
  const fake = { kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify({ '2026-07-10': { highlight: 'old' } }) } };
  const ctx = await open(fake);
  const { page } = ctx;
  const setup = await page.evaluate(async () => {
    const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    window.__grow = JSON.stringify(Object.fromEntries(Array.from({ length: 400 }, (_, i) => [day(i), { t: 'g'.repeat(2100) }])));
    window.__blob = JSON.stringify({ note: 'z'.repeat(1300000) });
    const a = await window.storage.set('size:grow', window.__grow);
    const b = await window.storage.set('size:blob', window.__blob);
    return { a, b, n: window.__fakeDocs.size };
  });
  ok(setup.a === 'cloud' && setup.b === 'cloud', 'set up a sealed doc and a split doc');
  await nav(page, 'System');
  await page.waitForSelector('[data-nw-sizes] tbody tr');
  const rows = await page.$$eval('[data-nw-sizes] tbody tr', trs => trs.map(tr => { const td = tr.querySelectorAll('td'); return { id: td[0].firstChild.textContent, kind: td[0].innerText, pct: parseFloat(td[2].innerText) }; }));
  const ids = await page.evaluate(() => [...window.__fakeDocs.keys()].sort());
  ok(rows.length === ids.length && JSON.stringify(rows.map(r => r.id).sort()) === JSON.stringify(ids), `the size table lists every doc and part (${rows.length})`);
  ok(rows.every((r, i) => i === 0 || rows[i - 1].pct >= r.pct) && rows[0].pct > 50 && rows[0].pct < 86, 'largest first, as % of the 1,048,576-byte limit → ' + rows.slice(0, 3).map(r => `${r.id} ${r.pct}%`).join(', '));
  ok(rows.some(r => r.id === 'size_grow__part_1' && /sealed part/.test(r.kind)) && rows.some(r => /^size_blob__split_/.test(r.id) && /piece of a split value/.test(r.kind)) && rows.some(r => r.id === 'kaizen3_logs' && /old Kaizen archive/.test(r.kind)), 'parts, pieces and old archives are labelled');
  ok(await page.evaluate(() => document.querySelector('[data-nw-sizes]').getBoundingClientRect().right <= 390 && document.documentElement.scrollWidth <= 390), 'the table fits a 390-px screen (no sideways scroll)');
  const rr = await page.evaluate(async () => {
    const { backup } = await window.nwGatherBackup();
    const ids = backup.docs.map(d => d.id);
    const all = [...window.__fakeDocs.keys()].sort();
    window.__fakeDocs.clear(); // everything lost
    window.confirm = () => true;
    const m = window.__fakeOrder.length;
    const res = await window.nwRestoreBackup(JSON.parse(JSON.stringify(backup)));
    const order = window.__fakeOrder.slice(m).map(o => o.replace(/^set /, ''));
    const firstMain = order.indexOf('size_blob'), lastPiece = Math.max(...order.map((id, i) => (/__split_/.test(id) ? i : -1)));
    const firstGrow = order.indexOf('size_grow'), part = order.indexOf('size_grow__part_1');
    return { inBackup: JSON.stringify(ids) === JSON.stringify(all), count: ids.length, res,
      piecesFirst: lastPiece < firstMain, partFirst: part < firstGrow,
      grow: (await window.storage.getAll('size:grow')).value === window.__grow, blob: (await window.storage.get('size:blob')).value === window.__blob,
      restoredIds: JSON.stringify([...window.__fakeDocs.keys()].sort()) === JSON.stringify(all) };
  });
  ok(rr.inBackup, `the backup holds every doc, part and piece (${rr.count})`);
  ok(rr.res.restored === rr.count && rr.res.failed.length === 0 && rr.restoredIds, 'restore writes every one back by ID');
  ok(rr.piecesFirst && rr.partFirst, 'restore writes pieces and sealed parts before the docs that point at them');
  ok(rr.grow && rr.blob, 'after restore, getAll and get return the original values exactly');
  await done(ctx, '6');
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
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
