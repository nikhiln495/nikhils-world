// Build v5 checks (Nov 15, 2026): who said what, his own answer first, everyday wrongs.
// Run: NODE_PATH=$(npm root -g) node scripts/v5-test.js [part]
// Part 1: nothing lost, every device sees the same captures (Brain Dump captures in window.storage, Today's three merged by id,
// the System tab's order and room message).
// Every Google request is answered by scripts/google-fake.js; Firestore is the fake in scripts/p1-check.js. The live Firestore,
// Drive and the Brain Dump are never touched.
const fs = require('fs');
const path = require('path');
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');
const G = require('./google-fake');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NOW = '2026-11-15T09:10:00';
const MK = '2026_11';
const CAP_ID = `dump_captures_${MK}`;

// Firestore docs from a plain { key: value } map (values are JSON-stringified).
const asDocs = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/[:/.#$[\]]/g, '_'), { key: k, value: typeof v === 'string' ? v : JSON.stringify(v), updatedAt: new Date(1000) }]));
const newFake = (over = {}) => G.makeGoogle({ doc: { title: 'Brain Dump Nov 2026', paras: [{ text: 'Saturday, Nov 14, 2026', style: 'HEADING_1' }, { text: 'older note', style: 'NORMAL_TEXT' }] }, ...over });
async function open(opts = {}) {
  const ctx = await openPage({ now: NOW, fakeFirestore: asDocs(F.base()), ...opts });
  await ctx.page.waitForTimeout(3500);
  return ctx;
}
async function finish(ctx, label) {
  const errs = ctx.errors.filter(e => !/Failed to load resource|net::ERR/.test(e));
  ok(errs.length === 0, `${label}: no console errors${errs.length ? ' → ' + errs.join(' | ') : ''}`);
  await ctx.browser.close();
}
const cloudDoc = (page, id) => page.evaluate(i => { const d = window.__fakeDocs.get(i); return d ? JSON.parse(d.value) : null; }, id);
const allFake = (page) => page.evaluate(() => JSON.stringify([...window.__fakeDocs.entries()]));
const waitFor = async (page, fn, arg, ms = 15000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (_) { return false; } };
const openDump = async (page) => { await page.locator('[data-nw-quick="dump"]').click(); await page.waitForSelector('[data-nw-dump]'); await wait(page, 600); };

// ───────────────────────── Part 1 ─────────────────────────
async function part1() {
  console.log('\n[v5 1a. Captures are in window.storage: two devices see the same captures]');
  {
    const laptop = { id: 'd_lap1', at: '2026-11-15T07:00:00.000Z', u: 1, text: 'TEST laptop capture', tag: 'note:', status: 'sent', sentAt: '2026-11-15T07:00:05.000Z', dev: 'Mac Chrome lap1' };
    const seed = { ...asDocs(F.base()), ...asDocs({ [`dump:captures:${MK}`]: { month: MK, entries: [laptop] } }) };
    const ctx = await open({ fakeFirestore: seed });
    const { page } = ctx;
    await openDump(page);
    let caps = await page.locator('[data-nw-capture]').allInnerTexts();
    ok(caps.some(t => /sent/.test(t) && t.includes('TEST laptop capture')), "the phone shows the laptop's capture → " + JSON.stringify(caps));
    const where = await page.evaluate(async () => { const c = window.nwBrainDump.add('TEST phone capture', 'task:'); return c.saved; });
    ok(where === 'cloud', 'a capture saved online returns "cloud"');
    const doc = await cloudDoc(page, CAP_ID);
    const mine = doc.entries.find(e => e.text === 'TEST phone capture');
    ok(doc.entries.length === 2 && doc.entries.some(e => e.id === 'd_lap1') && mine && mine.status === 'device' && mine.u && mine.dev && !('saved' in mine) && !('onlyHere' in mine), 'the cloud doc holds both captures; the new one has a device, a time stamp and status "waiting" → ' + JSON.stringify(mine));
    ok(!(await page.evaluate(() => Object.keys(window.__fakeDocs ? Object.fromEntries(window.__fakeDocs) : {}))).some(id => /__conflict_/.test(id)), 'no conflict copy');
    // The laptop sends its capture meanwhile; the phone's waiting one is not touched by it.
    await page.evaluate(() => {
      const d = window.__fakeDocs.get('dump_captures_2026_11'); const v = JSON.parse(d.value);
      v.entries.push({ id: 'd_lap2', at: '2026-11-15T09:05:00.000Z', u: Date.now() + 5, text: 'TEST laptop second', tag: '', status: 'device', dev: 'Mac Chrome lap1' });
      window.__fakeDocs.set('dump_captures_2026_11', { ...d, value: JSON.stringify(v), updatedAt: new Date(Date.now() + 1000) });
    });
    await page.locator('[data-nw-quick="dump"]').click(); await wait(page, 300);
    await openDump(page);
    caps = await page.locator('[data-nw-capture]').allInnerTexts();
    ok(caps.length === 3 && /waiting for Mac Chrome lap1 to send it/.test(caps.find(t => t.includes('TEST laptop second')) || ''), "reopening the panel shows the laptop's new capture, marked as the laptop's to send → " + JSON.stringify(caps));
    ok(caps[0].includes('TEST phone capture') || caps[0].includes('TEST laptop second'), 'newest first');
    await finish(ctx, 'two devices');

    // A second device opened on the same database sees the phone's capture.
    const seed2 = { ...asDocs(F.base()), [CAP_ID]: { key: `dump:captures:${MK}`, value: JSON.stringify(doc), updatedAt: new Date(2000) } };
    const ctx2 = await open({ fakeFirestore: seed2 });
    await openDump(ctx2.page);
    const caps2 = await ctx2.page.locator('[data-nw-capture]').allInnerTexts();
    ok(caps2.some(t => t.includes('TEST phone capture')) && caps2.some(t => t.includes('TEST laptop capture')), 'a second device shows the same captures → ' + JSON.stringify(caps2));
    await finish(ctx2, 'second device');
  }

  console.log('\n[v5 1b. 60 captures made offline: all kept, each sent once; clearing caches loses nothing waiting]');
  {
    const fake = newFake();
    const ctx = await open({ offline: true, token: true, google: fake.handler });
    const { page } = ctx;
    const r = await page.evaluate(async () => { const out = []; for (let i = 0; i < 60; i++) out.push(window.nwBrainDump.add('TEST offline ' + i, '').saved); return Promise.all(out); });
    ok(r.length === 60 && r.every(w => w === 'device-only'), 'offline, every capture is saved on this device ("device-only") → ' + JSON.stringify([...new Set(r)]));
    const local = await page.evaluate(() => JSON.parse(window.storage.dev.getItem('dump:captures:2026_11')).entries.length);
    ok(local === 60, "this device's copy holds all 60 (none dropped) → " + local);
    ok(fake.calls.length === 0, 'nothing went to Google offline');
    const cleared = await page.evaluate(() => { const r = window.storage.clearCaches(); return { removed: r.removed, n: JSON.parse(window.storage.dev.getItem('dump:captures:2026_11')).entries.length, waiting: window.storage.status().waiting }; });
    ok(cleared.n === 60 && !cleared.removed.some(k => /dump:captures|__nw_dump_queue|__nw_upload_queue/.test(k)) && cleared.waiting >= 1, 'Clear caches keeps every waiting capture and the upload queue → ' + JSON.stringify(cleared));
    await openDump(page);
    ok(await page.locator('[data-nw-capture]').count() === 20, 'the panel shows 20 at a time');
    await page.locator('[data-nw-capture-more]').click();
    ok(await page.locator('[data-nw-capture]').count() === 40, 'Show more shows 20 more');
    await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
    const sentAll = await waitFor(page, () => { const v = window.storage.dev.getItem('dump:captures:2026_11'); return v && JSON.parse(v).entries.filter(e => e.status === 'sent').length === 60; }, null, 60000);
    ok(sentAll, 'back online: all 60 are sent');
    const texts = fake.doc.paras.map(p => p.text);
    const counts = Array.from({ length: 60 }, (_, i) => texts.filter(t => t.startsWith(`TEST offline ${i} (from Nikhil's World`)).length);
    ok(counts.every(n => n === 1), 'each capture is in the Brain Dump exactly once → ' + JSON.stringify(counts.filter(n => n !== 1)));
    ok(texts[0] === 'Sunday, Nov 15, 2026' && texts[1].startsWith('TEST offline 59 '), 'the newest is on top under today');
    ok(await waitFor(page, () => window.storage.status().waiting === 0), 'the upload queue empties');
    const cloud = await cloudDoc(page, CAP_ID);
    ok(cloud && cloud.entries.length === 60 && cloud.entries.every(e => e.status === 'sent'), 'the cloud has all 60, marked sent');
    // Online again: nothing is sent a second time.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await wait(page, 1500);
    ok(fake.doc.paras.filter(p => /^TEST offline /.test(p.text)).length === 60, 'another "online" sends nothing again');
    await finish(ctx, 'offline 60');
  }

  console.log('\n[v5 1c. Work captures stay on this device; captures from before this change move over]');
  {
    const old = [
      { id: 'd_old1', at: '2026-11-10T10:00:00Z', text: 'TEST old sent', tag: '', status: 'sent', sentAt: '2026-11-10T10:00:03Z' },
      { id: 'd_old2', at: '2026-11-12T10:00:00Z', text: 'TEST old waiting', tag: 'task:', status: 'device' },
      { id: 'd_old3', at: '2026-11-13T10:00:00Z', text: 'TEST VINE survey wording', tag: '', status: 'device' },
      { id: 'd_old4', at: '2026-10-30T10:00:00Z', text: 'TEST october waiting', tag: '', status: 'device' },
    ];
    const ctx = await open({ device: { __nw_dump_queue: JSON.stringify(old) } });
    const { page } = ctx;
    await openDump(page);
    await wait(page, 800);
    const nov = await cloudDoc(page, CAP_ID), oct = await cloudDoc(page, 'dump_captures_2026_10');
    ok(nov && nov.entries.length === 2 && nov.entries.find(e => e.id === 'd_old1').status === 'sent' && nov.entries.find(e => e.id === 'd_old2').status === 'device', 'November captures moved to the store with their status kept');
    ok(oct && oct.entries.length === 1 && oct.entries[0].id === 'd_old4', 'an October capture went to the October doc');
    const left = await page.evaluate(() => JSON.parse(window.storage.dev.getItem('__nw_dump_queue')));
    ok(left.length === 1 && left[0].id === 'd_old3', 'only the work capture is left on this device');
    const w1 = await page.evaluate(() => window.nwBrainDump.add('TEST work thing', 'work:').saved);
    const w2 = await page.evaluate(() => window.nwBrainDump.add('TEST asmp follow-up', '').saved);
    ok(w1 === 'device-only' && w2 === 'device-only', 'a work: capture and one naming ASMP are saved on this device only');
    await wait(page, 600);
    const all = await allFake(page);
    ok(!/VINE survey|TEST work thing|asmp follow-up/i.test(all), 'no work capture reached the fake Firestore');
    await page.locator('[data-nw-quick="dump"]').click(); await wait(page, 200);
    await openDump(page);
    const caps = await page.locator('[data-nw-capture]').allInnerTexts();
    ok(caps.some(t => /on this device only/.test(t) && t.includes('TEST work thing')), 'the panel shows work captures as on this device only');
    // Opening again does not move or double anything.
    await page.evaluate(() => window.nwBrainDump.ready(true));
    ok((await cloudDoc(page, CAP_ID)).entries.length === 2, 'loading again adds nothing');
    await finish(ctx, 'work and old captures');
  }

  console.log("\n[v5 1d. Today's three from two devices: joined by id, no conflict copy]");
  {
    const lap = { id: 't3_lap1', at: '2026-11-15T07:00:00.000Z', date: '2026-11-15', kind: 'pick', slot: 'academic', text: 'TEST laptop pick', u: 1 };
    const seed = { ...asDocs(F.base()), ...asDocs({ [`practice:three:${MK}`]: { month: MK, entries: [lap] } }) };
    const ctx = await open({ fakeFirestore: seed });
    const { page } = ctx;
    await page.evaluate(() => {
      window.__fakeBeforeCommit = (attempt) => {
        if (attempt !== 1) return;
        const d = window.__fakeDocs.get('practice_three_2026_11'); const v = JSON.parse(d.value);
        v.entries.push({ id: 't3_lap2', at: '2026-11-15T09:00:00.000Z', date: '2026-11-15', kind: 'pick', slot: 'other', text: 'TEST laptop pick 2', u: Date.now() });
        window.__fakeDocs.set('practice_three_2026_11', { ...d, value: JSON.stringify(v), updatedAt: new Date(Date.now() + 1000) });
      };
    });
    await page.evaluate(() => nwThreeAppend([{ kind: 'pick', slot: 'nourishment', text: 'TEST phone pick' }]));
    await page.evaluate(() => { window.__fakeBeforeCommit = null; });
    const doc = await cloudDoc(page, 'practice_three_2026_11');
    const texts = doc.entries.map(e => e.text).sort();
    ok(JSON.stringify(texts) === JSON.stringify(['TEST laptop pick', 'TEST laptop pick 2', 'TEST phone pick']), 'the phone and both laptop picks are all kept → ' + JSON.stringify(texts));
    ok(!(await page.evaluate(() => [...window.__fakeDocs.keys()])).some(id => /__conflict_/.test(id)), 'no conflict copy');
    // Undo of the phone's pick stays undone even when the laptop saves an old copy.
    const mine = doc.entries.find(e => e.text === 'TEST phone pick');
    await page.evaluate(id => pUpdate('practice:three:2026_11', null, (x) => { x.entries = x.entries.filter(e => e.id !== id); return x; }), mine.id);
    await page.evaluate(e => window.storage.set('practice:three:2026_11', JSON.stringify({ month: '2026_11', entries: [e] })), mine);
    const after = await cloudDoc(page, 'practice_three_2026_11');
    ok(after.entries.find(e => e.id === mine.id).deleted === true && after.entries.filter(e => !e.deleted).length === 2, 'a removed pick stays removed; the laptop picks stay');
    await finish(ctx, 'three two devices');
  }

  console.log('\n[v5 1e. System tab: Feedback below Google Drive and the backup; what stays only on this device]');
  {
    const ctx = await open();
    const { page } = ctx;
    await page.getByRole('button', { name: 'System', exact: true }).click();
    await wait(page, 600);
    const order = await page.evaluate(() => {
      const pos = (el) => (el ? [...document.querySelectorAll('*')].indexOf(el) : -1);
      const btn = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t));
      return { drive: pos(btn('SYNC TO GOOGLE DRIVE')), backup: pos(btn('DOWNLOAD BACKUP')), feedback: pos(document.querySelector('textarea[aria-label="Feedback for the app (System tab)"]')) };
    });
    ok(order.feedback > order.drive && order.feedback > order.backup && order.drive > 0, 'the Feedback box is below Google Drive and the downloadable backup → ' + JSON.stringify(order));
    const only = await page.locator('[data-nw-only-here]').innerText();
    ok(/Only on this device: work captures/.test(only) && /Everything else is in the cloud once Waiting to upload reads 0/.test(only), 'one plain sentence says what exists only on this device');
    await finish(ctx, 'system tab');
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  const parts = { 1: part1 };
  for (const [k, fn] of Object.entries(parts)) if (which === 'all' || which === k) await fn();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
