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
  const o = { now: NOW, fakeFirestore: asDocs(F.base()), ...opts };
  if (o.fakeFirestore === null) delete o.fakeFirestore;
  const ctx = await openPage(o);
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
    ok(caps.length === 3 && /saved · waiting for your Mac \(Chrome\) to add it to the Brain Dump doc/.test(caps.find(t => t.includes('TEST laptop second')) || ''), "reopening the panel shows the laptop's new capture, marked as the laptop's to send → " + JSON.stringify(caps));
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

// ───────────────────────── Part 2 ─────────────────────────
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${G.SHEET_ID}/edit#gid=0`;
const sendDump = async (page, text, opts = {}) => {
  await page.locator('textarea[aria-label="Brain Dump text"]').fill(text);
  if (opts.tag) await page.locator('[data-nw-dump]').getByRole('button', { name: opts.tag, exact: true }).click();
  if (opts.words) await page.locator('[data-nw-dump-whose]').getByRole('button', { name: opts.words, exact: true }).click();
  if (opts.other) {
    await page.locator('[data-nw-dump-whose]').getByRole('button', { name: 'Someone else', exact: true }).click();
    await page.locator('input[aria-label="Whose words: name"]').fill(opts.other);
    await page.locator('[data-nw-dump-whose]').getByRole('button', { name: 'Use', exact: true }).click();
  }
  await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
  await wait(page, opts.wait || 1200);
};
async function part2() {
  console.log('\n[v5 2a. Dump: one tap; the right shape; who said it]');
  {
    const fake = newFake();
    const ctx = await open({ fakeFirestore: null, seed: F.base(), token: true, google: fake.handler });
    const { page } = ctx;
    await openDump(page);
    const whose = await page.locator('[data-nw-dump-whose]').innerText();
    ok(/Mine/.test(whose) && /Corky/.test(whose) && /AI draft/.test(whose) && /Someone else/.test(whose), 'Whose words? offers Mine, the Joy names, AI draft and Someone else');
    ok(await page.locator('[data-nw-dump]').getByRole('button', { name: 'wins:', exact: true }).count() === 1, 'there is a wins: tag');
    await sendDump(page, 'Bought the stamps\nCalled Mom\nWrote the outline', { tag: 'note:' });
    ok(!(await page.locator('[data-nw-dump-preview]').count()) && fake.writes.some(w => w.api === 'docs'), 'one tap: Send writes at once, no preview');
    let ps = fake.doc.paras;
    ok(ps[0].text === 'Sunday, Nov 15, 2026' && /^note: Bought the stamps\u000bCalled Mom\u000bWrote the outline \(from Nikhil's World, 9:1\d AM\)$/.test(ps[1].text) && ps[2].text === 'Saturday, Nov 14, 2026', 'a 3-line note: dump is one paragraph: the tag once, three lines, the stamp once → ' + JSON.stringify(ps[1].text));
    await sendDump(page, 'Email Dr. Shobha\nBook the room\nPrint the form', { tag: 'task:' });
    ps = fake.doc.paras;
    ok(ps.slice(1, 4).every(p => /^task: /.test(p.text)) && ps[1].text === 'task: Email Dr. Shobha' && ps[2].text === 'task: Book the room' && /^task: Print the form \(from Nikhil's World, 9:1\d AM\)$/.test(ps[3].text), 'a 3-line task: dump is three task: paragraphs; the stamp once, on the last (Nov 17) → ' + JSON.stringify(ps.slice(1, 4).map(p => p.text)));
    await sendDump(page, 'Finished the draft\nWalked to class', { tag: 'wins:' });
    ok(fake.doc.paras[1].text === 'wins: Finished the draft' && /^wins: Walked to class \(from Nikhil's World/.test(fake.doc.paras[2].text), 'wins: also gives one paragraph per line; the stamp once, on the last');
    await sendDump(page, 'Corky: you could just call them\nMe: I will after lunch', { other: 'Corky' });
    ps = fake.doc.paras;
    ok(/^Corky: you could just call them\u000bMe: I will after lunch \(from Nikhil's World, 9:1\d AM, words: Corky\)$/.test(ps[1].text), '"Corky:" and "Me:" stay on their own lines; the stamp says whose words → ' + JSON.stringify(ps[1].text));
    // Several tags at once (Nov 20) and several people (Nov 23); a typed name is offered next time.
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'wins:', exact: true }).click();
    await sendDump(page, 'Cooked for everyone', { tag: 'life:', words: 'Corky', other: 'Priya' });
    ps = fake.doc.paras;
    ok(/^wins: life: Cooked for everyone \(from Nikhil's World, 9:1\d AM, words: Corky, Priya\)$/.test(ps[1].text), 'two tags and two people in one capture → ' + JSON.stringify(ps[1].text));
    ok(await page.locator('[data-nw-dump-whose]').getByRole('button', { name: 'Priya', exact: true }).count() === 1, 'a name typed under Someone else is offered as a button next time');
    ok((await page.locator('[data-nw-dump] [aria-pressed="true"]').count()) === 1 && (await page.locator('[data-nw-dump-whose]').getByRole('button', { name: 'Mine', exact: true }).getAttribute('aria-pressed')) === 'true', 'after Send the tags clear and Whose words goes back to Mine');
    await page.locator('[data-nw-dump-whose]').getByRole('button', { name: 'Corky', exact: true }).click();
    await page.locator('[data-nw-dump-whose]').getByRole('button', { name: 'Mine', exact: true }).click();
    await sendDump(page, 'We planned the trip together');
    ok(/, words: Corky, Nikhil\)$/.test(fake.doc.paras[1].text), 'Mine can be picked alongside someone else → ' + JSON.stringify(fake.doc.paras[1].text));
    await sendDump(page, 'Here is a draft reply to the landlord', { words: 'AI draft' });
    ok(/^Here is a draft reply to the landlord \(from Nikhil's World, 9:1\d AM, AI draft\)$/.test(fake.doc.paras[1].text), 'AI draft shows in the stamp');
    ok(!fake.doc.paras.some(p => /claude|anthropic|sonnet|opus|gpt|gemini/i.test(p.text)), 'no AI model or company is named in the Doc');
    const cap = await page.evaluate(() => window.nwBrainDump.captures().find(c => /landlord/.test(c.text)));
    ok(cap && cap.words === 'ai', 'who said it is saved on the capture as words');
    // A 13-line dump is a paste.
    const long = Array.from({ length: 13 }, (_, i) => `Line ${i + 1} of the long paste`).join('\n');
    await sendDump(page, long, { wait: 2000 });
    const paste = fake.docByTitle('Brain Dump Pastes Nov 2026');
    ps = fake.doc.paras;
    ok(/^paste: 13 lines, \d+ characters, starts 'Line 1 of the long paste' \(from Nikhil's World, 9:1\d AM\)$/.test(ps[1].text) && !ps.some(p => p.text.includes('Line 13 of')), 'a 13-line dump puts one pointer line in the Brain Dump → ' + JSON.stringify(ps[1].text));
    ok(paste && paste.paras[0].text === 'Sunday, Nov 15, 2026' && paste.paras[0].style === 'HEADING_1' && /^paste \(from Nikhil's World/.test(paste.paras[1].text) && paste.paras.filter(p => /^Line \d+ of the long paste$/.test(p.text)).length === 13, 'and the full text goes to "Brain Dump Pastes Nov 2026" under the day heading');
    const made = fake.writes.filter(w => w.api === 'drive' && w.kind === 'create');
    ok(made.length === 1 && made[0].parents[0] === 'FAKE_BRAIN_DUMP_FOLDER', "the Pastes doc was made once, in the Brain Dump's folder");
    await sendDump(page, long.replace(/long/g, 'second'), { wait: 2000 });
    ok(fake.writes.filter(w => w.api === 'drive' && w.kind === 'create').length === 1 && fake.docByTitle('Brain Dump Pastes Nov 2026').paras.filter(p => /second paste/.test(p.text)).length === 13, 'a second paste goes to the same Pastes doc');
    // The past-Brain-Dump search still finds dump text (soft line breaks and the words stamp included).
    const past = await page.evaluate(() => pPastDumps('Called Mom outline landlord Corky'));
    ok(past.lines.some(l => /Called Mom/.test(l) && !/from Nikhil's World/.test(l)) && past.lines.some(l => /landlord/.test(l)), 'the past-Brain-Dump search finds dump text, stamps removed → ' + JSON.stringify(past.lines.slice(0, 3)));
    await finish(ctx, 'dump shapes');
  }

  console.log('\n[v5 2b. Dump offline: written once after reconnecting; captures queued before this change still write]');
  {
    const fake = newFake();
    const old = [{ id: 'd_old9', at: '2026-11-14T20:00:00Z', text: 'Old queued thought\nsecond line', tag: '', status: 'device' }];
    const ctx = await open({ offline: true, token: true, google: fake.handler, device: { __nw_dump_queue: JSON.stringify(old) } });
    const { page } = ctx;
    await openDump(page);
    await sendDump(page, 'Thought while offline', { wait: 800 });
    ok((await page.locator('[data-nw-dump] [role="status"]').innerText()).includes('Waiting: it goes to the Brain Dump when you are online.') && fake.calls.length === 0, 'offline: waiting, nothing sent');
    await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
    await waitFor(page, () => window.nwBrainDump.captures().every(c => c.status === 'sent'), null, 15000);
    const ps = fake.doc.paras.map(p => p.text);
    ok(ps.filter(t => /^Thought while offline \(from Nikhil's World/.test(t)).length === 1, 'back online: the offline dump is written once');
    ok(ps.filter(t => /^Old queued thought\u000bsecond line \(from Nikhil's World, 11:00 AM\)$/.test(t)).length === 1, 'a capture queued before this change still writes (with its own time)');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await wait(page, 1500);
    ok(fake.doc.paras.filter(p => /^Thought while offline /.test(p.text)).length === 1, 'and not again');
    await finish(ctx, 'dump offline');
  }

  console.log('\n[v5 2c. Ledger: adding a step is one tap, with Undo]');
  {
    const fake = G.makeGoogle({ sheet: { Ledger: G.ledgerValues(), Rules: G.RULES_ROWS } });
    const ctx = await open({ fakeFirestore: null, seed: F.base(), token: true, google: fake.handler, device: { __nw_ledger_link: JSON.stringify(SHEET_URL) } });
    const { page } = ctx;
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    await page.locator('input[aria-label="New step for this task"]').fill('Photograph the form');
    await page.getByRole('button', { name: 'Add step', exact: true }).first().click();
    await wait(page, 1200);
    ok(!(await page.locator('[data-pr-ledger-preview]').count()), 'no Review step and no Confirm and send');
    const n = fake.sheets.Ledger.length;
    const last = fake.sheets.Ledger[n - 1];
    ok(last[4] === 'File the tax form' && last[5] === 'Step 3' && last[6] === 'Photograph the form', 'one tap appended the step row');
    const bar = await page.locator('[data-nw-savedbar]').first().innerText();
    ok(/Saved/.test(bar) && /Undo/.test(bar), 'the Saved bar shows, with Undo');
    await page.locator('[data-nw-savedbar]').first().getByRole('button', { name: 'Undo' }).click();
    await wait(page, 1200);
    const after = fake.sheets.Ledger[n - 1];
    ok(after[4] === '' && after[5] === '' && after[6] === '', 'Undo empties the cells the app wrote in that row → ' + JSON.stringify(after.slice(0, 8)));
    await finish(ctx, 'ledger add step');
  }
}

// ───────────────────────── Part 3 ─────────────────────────
const { execSync } = require('child_process');
const MAIN_HTML = (() => { try { return execSync('git show 69a2273:index.html', { cwd: path.join(__dirname, '..'), maxBuffer: 64 * 1024 * 1024 }).toString(); } catch (_) { return null; } })();
const toolUse = (picks) => ({ status: 200, json: { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'choose_practices', input: { picks } }] } });
const COMPARE = { mine: { matches: 'Stepping outside for air is what people often do first.', problem: 'Checking the phone outside may pull you back in.' }, options: [
  { approach: 'Breathing move', first_step: 'Put one hand on your belly and breathe out slowly four times.', person: null },
  { approach: 'Tell one person', first_step: 'Text Corky one line about what happened.', person: 'Someone who asks questions out loud' },
] };
const textReply = (obj) => ({ status: 200, json: { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] } });
const ASKED = { works: 'Stepping outside is a way people often start.', question: 'What is one thing outside that usually helps you?' };
const proxyFor = async (body) => (body.output_config && body.output_config.format
  ? textReply(body.output_config.format.schema.properties.works ? ASKED : COMPARE)
  : toolUse([{ id: 'thought-stop', why: 'Say stop out loud.' }]));
// A structured-output schema that follows the rules in CLAUDE.md.
function schemaProblems(node, at = 'schema') {
  const out = [];
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'object' && node.additionalProperties !== false) out.push(`${at}: additionalProperties is not false`);
  ['minimum', 'maximum', 'minLength', 'maxLength'].forEach(k => { if (k in node) out.push(`${at}: has ${k}`); });
  if ('minItems' in node && ![0, 1].includes(node.minItems)) out.push(`${at}: minItems ${node.minItems}`);
  Object.entries(node.properties || {}).forEach(([k, v]) => { if (/reason|thinking|explain/i.test(k)) out.push(`${at}.${k}: asks for reasoning`); out.push(...schemaProblems(v, `${at}.${k}`)); });
  if (node.items) out.push(...schemaProblems(node.items, `${at}[]`));
  (node.anyOf || []).forEach((v, i) => out.push(...schemaProblems(v, `${at}|${i}`)));
  return out;
}
async function askClaudeOnce(html, myTry, o = {}) {
  const ctx = await openPage({ seed: F.base(), now: '2026-10-04T09:00:00', proxy: proxyFor, ...(html ? { html: () => html } : {}) });
  const { page } = ctx;
  await wait(page, 3500);
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.waitForSelector('.pr-root h1');
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Stuck', exact: true }).click();
  await page.getByLabel('Ask Claude', { exact: true }).fill('I keep rereading the chat from last night');
  if (o.askFirst === false) await page.locator('[data-pr-mytry] input[aria-label="Ask me first"]').first().uncheck();
  if (myTry) await page.locator('[data-pr-mytry] textarea').first().fill(myTry);
  await page.getByRole('button', { name: 'Pick practices for me' }).click();
  await wait(page, 1500);
  return ctx;
}
const norm = (b) => JSON.stringify(b).replace(/\d\d:\d\d/g, 'HH:MM');

async function part3() {
  console.log('\n[v5 3a. Went wrong: saved offline, on a second device, one Brain Dump line; work entries stay here]');
  {
    const fake = newFake();
    const ctx = await open({ offline: true, token: true, google: fake.handler });
    const { page } = ctx;
    const quick = await page.locator('[data-nw-quick]').evaluateAll(els => els.map(e => e.getAttribute('data-nw-quick')));
    ok(JSON.stringify(quick.slice(0, 5)) === JSON.stringify(['joy', 'wrong', 'predict', 'dump', 'feedback']), 'the quick row: Joy, Went wrong, Predict, Dump, Feedback → ' + JSON.stringify(quick));
    await page.locator('[data-nw-quick="wrong"]').click();
    ok(await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Save' }).isDisabled(), 'What went wrong is the only required field');
    await page.locator('input[aria-label="What went wrong"]').fill('Missed the 3:30 class');
    await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Nothing yet' }).click();
    await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Corky', exact: true }).click();
    await page.locator('input[aria-label="Which part"]').fill('Leaving the dorm');
    await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Save' }).click();
    await wait(page, 800);
    const bar = (await page.locator('[data-nw-savedbar]').first().innerText()).toLowerCase();
    ok(bar.includes('device only') && /undo/.test(bar), 'offline: the bar says on this device only, with Undo');
    ok((await page.locator('[data-nw-wrong-row]').first().innerText()).includes('Missed the 3:30 class'), 'the entry shows in the list you can read back');
    // Nobody is its own choice.
    await page.locator('input[aria-label="What went wrong"]').fill('TEST VINE consent form had the wrong date');
    await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Nobody', exact: true }).click();
    await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Save' }).click();
    await wait(page, 800);
    await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
    ok(await waitFor(page, () => window.storage.status().waiting === 0), 'back online: the upload queue empties');
    await waitFor(page, () => window.nwBrainDump.captures().filter(c => c.tag === 'wrong:').every(c => c.status === 'sent'), null, 15000);
    const doc = await cloudDoc(page, 'practice_wrong_2026_11');
    const e = doc && doc.entries.find(x => x.what === 'Missed the 3:30 class');
    ok(e && e.did === 'Nothing yet' && JSON.stringify(e.who) === '["Corky"]' && e.part === 'Leaving the dorm' && e.id && e.at && e.time && 'myTry' in e && 'compare' in e, 'practice:wrong:2026_11 holds { id, at, time, what, did, who, part, myTry, compare }');
    const all = await allFake(page);
    ok(!/VINE consent/.test(all), 'the work entry did not reach the fake Firestore');
    ok((await page.evaluate(() => JSON.stringify(window.storage.dev.getItem('__nw_wrong_work')))).includes('VINE consent'), 'it is kept on this device');
    const lines = fake.doc.paras.map(p => p.text);
    ok(lines.filter(x => /^wrong: Missed the 3:30 class · did: Nothing yet · with: Corky \(from Nikhil's World, 9:1\d AM\)$/.test(x)).length === 1, 'exactly one Brain Dump line for it, after the reconnect');
    ok(lines.filter(x => /VINE consent/.test(x)).length === 1, 'the work entry also gets its line (from this device; the Brain Dump is his own doc)');
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await wait(page, 1200);
    ok(fake.doc.paras.filter(p => /^wrong: Missed the 3:30/.test(p.text)).length === 1, 'and only one');
    await finish(ctx, 'went wrong offline');
    const ctx2 = await open({ fakeFirestore: { ...asDocs(F.base()), practice_wrong_2026_11: { key: 'practice:wrong:2026_11', value: JSON.stringify(doc), updatedAt: new Date(3000) } } });
    await ctx2.page.locator('[data-nw-quick="wrong"]').click();
    await wait(ctx2.page, 800);
    const rows2 = await ctx2.page.locator('[data-nw-wrong-row]').allInnerTexts();
    ok(rows2.some(r => r.includes('Missed the 3:30 class')) && !rows2.some(r => /VINE/.test(r)), 'a second device shows the entry (not the work one) → ' + JSON.stringify(rows2));
    await ctx2.page.getByRole('button', { name: 'Practice', exact: true }).click();
    await ctx2.page.waitForSelector('.pr-root h1');
    const hist = await ctx2.page.evaluate(async () => (await pDayItems('2026-11-15', null)).items.map(i => i.kind + ': ' + i.title));
    ok(hist.includes('Went wrong: Missed the 3:30 class'), 'Day history shows it next to Joys → ' + JSON.stringify(hist));
    await finish(ctx2, 'went wrong second device');
  }

  console.log('\n[v5 3b. Joy, prediction and outcome: one Brain Dump line each; edit and Undo]');
  {
    const fake = newFake();
    const ctx = await open({ offline: true, token: true, google: fake.handler });
    const { page } = ctx;
    await page.locator('[data-nw-quick="joy"]').click();
    await page.locator('[data-nw-joy] textarea[aria-label="What happened"]').fill('Corky laughed at my joke');
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Corky', exact: true }).click();
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Save joy' }).click();
    await wait(page, 600);
    await page.locator('[data-nw-quick="predict"]').click();
    await page.locator('textarea[aria-label="Prediction"]').fill('The meeting will run long');
    await page.locator('[data-nw-predict]').getByRole('radio', { name: '6', exact: true }).click();
    await page.locator('[data-nw-predict]').getByRole('button', { name: 'Save prediction' }).click();
    await wait(page, 600);
    // Undo of a second joy takes its line back before it is sent.
    await page.locator('[data-nw-quick="joy"]').click();
    await page.locator('[data-nw-joy] textarea[aria-label="What happened"]').fill('TEST joy to undo');
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Save joy' }).click();
    await wait(page, 600);
    await page.locator('[data-nw-savedbar]').first().getByRole('button', { name: 'Undo' }).click();
    await wait(page, 800);
    await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
    await waitFor(page, () => window.nwBrainDump.captures().every(c => c.status === 'sent'), null, 15000);
    let lines = fake.doc.paras.map(p => p.text);
    ok(lines.filter(x => /^joy: Corky laughed at my joke · with Corky \(from Nikhil's World, 9:1\d AM\)$/.test(x)).length === 1, 'one joy: line, written after the reconnect');
    ok(lines.filter(x => /^predict: The meeting will run long \(from Nikhil's World/.test(x)).length === 1, 'one predict: line');
    ok(!lines.some(x => /TEST joy to undo/.test(x)), 'Undo before sending: no line for that joy');
    // The outcome, online.
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('.pr-root h1');
    await page.getByRole('tab', { name: 'Predictions', exact: true }).click();
    await page.locator('[data-pr-pred-waiting]').filter({ hasText: 'The meeting will run long' }).getByRole('button', { name: 'Add what happened' }).click();
    await page.locator('[data-pr-pred-outcome] textarea[aria-label="What happened"]').fill('It ran 20 minutes over');
    await page.locator('[data-pr-pred-outcome]').getByRole('button', { name: 'Came true', exact: true }).click();
    await page.getByRole('button', { name: 'Save what happened' }).click();
    await wait(page, 1500);
    lines = fake.doc.paras.map(p => p.text);
    ok(lines.filter(x => /^predict outcome: It ran 20 minutes over \(came true\) \(from Nikhil's World/.test(x)).length === 1, 'one predict outcome: line, with came true / partly / didn\'t');
    // Edit the joy after its line was sent: an edit: line, the first line stays.
    await page.getByRole('tab', { name: 'Joys', exact: true }).click();
    await page.locator('[data-pr-joy]').filter({ hasText: 'Corky laughed' }).getByRole('button', { name: 'Edit' }).click();
    await page.locator('textarea[aria-label="Edit joy"]').fill('Corky laughed so hard at my joke');
    await page.getByRole('button', { name: 'Save edit' }).click();
    await wait(page, 1500);
    lines = fake.doc.paras.map(p => p.text);
    ok(lines.some(x => /^edit: joy: Corky laughed so hard at my joke · with Corky \(from Nikhil's World/.test(x)) && lines.some(x => /^joy: Corky laughed at my joke/.test(x)), 'an edit after sending adds an edit: line; the earlier line is not rewritten');
    const joyDoc = await cloudDoc(page, 'practice_joy_2026_11');
    const j = joyDoc.entries.find(x => /Corky laughed so hard/.test(x.what || ''));
    ok(j && j.edits && j.edits[0].from.what === 'Corky laughed at my joke', 'the joy keeps what it said before');
    await page.locator('[data-pr-joy]').filter({ hasText: 'Corky laughed so hard' }).getByRole('button', { name: 'Remove' }).click();
    await wait(page, 800);
    ok(!(await page.locator('[data-pr-joy]').filter({ hasText: 'Corky laughed so hard' }).count()), 'Remove takes it off the list');
    await page.locator('[data-nw-savedbar]').first().getByRole('button', { name: 'Undo' }).click();
    await wait(page, 1200);
    ok(await page.locator('[data-pr-joy]').filter({ hasText: 'Corky laughed so hard' }).count() === 1, 'Undo brings it back');
    await finish(ctx, 'joy predict lines');
  }

  console.log('\n[v5 3c. "Left to myself, I\'d ___": empty changes nothing; Ask me first (default); Show me ways; off]');
  {
    if (!MAIN_HTML) ok(false, 'main index.html (69a2273) could be read for the snapshot');
    const before = await askClaudeOnce(MAIN_HTML, null);
    const now = await askClaudeOnce(null, null);
    ok(before.proxyCalls.length === 1 && now.proxyCalls.length === 1 && norm(before.proxyCalls[0]) === norm(now.proxyCalls[0]), 'an empty box sends exactly the request main sends (snapshot) → ' + now.proxyCalls.length + ' call(s)');
    await before.browser.close(); await now.browser.close();
    // Ask me first is on by default: one line on what works, one question, and it stops.
    const ctx = await askClaudeOnce(null, 'Go outside for air and check my phone');
    const { page } = ctx;
    ok(await page.locator('input[aria-label="Ask me first"]').first().isChecked(), '"Ask me first" sits beside the box and is on by default');
    const askCall = ctx.proxyCalls.find(b => b.output_config && b.output_config.format);
    ok(ctx.proxyCalls.length === 2 && askCall && JSON.stringify(Object.keys(askCall.output_config.format.schema.properties)) === '["works","question"]' && !askCall.tool_choice && !askCall.tools, 'on: one extra structured call that asks only for what works and one question');
    ok(schemaProblems(askCall.output_config.format.schema).length === 0, 'its schema follows the structured-output rules');
    ok(/one question that helps him find the next idea himself/.test(askCall.system[0].text) && /Give no options, no steps and no advice\. Stop after the question\./.test(askCall.system[0].text) && /No praise words/.test(askCall.system[0].text), 'the rule: what works, one question, nothing more, no praise');
    const askView = await page.locator('[data-pr-compare-ask]').innerText();
    ok(askView.includes('Stepping outside is a way people often start.') && askView.includes('What is one thing outside that usually helps you?') && await page.locator('[data-pr-compare-option]').count() === 0, 'the reply says what works, asks one question, and stops (no approaches yet)');
    await page.locator('[data-pr-compare-ways]').click();
    await wait(page, 1200);
    const ways = ctx.proxyCalls.filter(b => b.output_config && b.output_config.format);
    ok(ways.length === 2 && JSON.stringify(Object.keys(ways[1].output_config.format.schema.properties)) === '["mine","options"]', '"Show me ways" asks for the approaches');
    ok(await page.locator('[data-pr-compare-option]').count() === 2 && (await page.locator('[data-pr-compare]').innerText()).includes('Who helps: Someone who asks questions out loud'), 'and shows 2 or 3 of them, with who helps');
    const asks = await page.evaluate(() => JSON.parse(window.__mem.get('practice:asks:2026_10_04')).entries.map(e => ({ kind: e.kind, mode: e.mode, myTry: e.myTry })));
    ok(asks.filter(a => a.kind === 'compare' && a.myTry === 'Go outside for air and check my phone').map(a => a.mode).join() === 'ask,ways', 'both asks are saved with myTry (ask, then ways)');
    await finish(ctx, 'ask me first');
    // Off: the answer comes as specified, at once.
    const off = await askClaudeOnce(null, 'Go outside for air and check my phone', { askFirst: false });
    const cmp = off.proxyCalls.find(b => b.output_config && b.output_config.format);
    ok(off.proxyCalls.length === 2 && cmp && JSON.stringify(Object.keys(cmp.output_config.format.schema.properties)) === '["mine","options"]', 'off: one structured call for what matches and the approaches');
    ok(schemaProblems(cmp.output_config.format.schema).length === 0, 'its schema follows the structured-output rules');
    ok(/Left to myself, I'd: Go outside for air and check my phone/.test(cmp.messages[0].content) && /No praise words/.test(cmp.system[0].text) && /someone who asks questions out loud/.test(cmp.system[0].text), 'it sends his try, the no-praise rule and the kind-of-person rule');
    const view = await off.page.locator('[data-pr-compare]').innerText();
    ok(view.includes('Stepping outside for air is what people often do first.') && view.includes('Checking the phone outside') && view.includes('Breathing move') && view.includes('Who helps: Someone who asks questions out loud') && await off.page.locator('[data-pr-compare-ways]').count() === 0, 'off: mine first, then the options, with no question step');
    await finish(off, 'ask me first off');
    // Work text is sent now (Nov 15); the saved ask leaves it out.
    const w = await askClaudeOnce(null, 'Email the ASMP lead', { askFirst: false });
    ok(w.proxyCalls.length === 2 && w.proxyCalls.some(c => c.output_config && c.output_config.format && /ASMP/.test(c.messages[0].content)), 'a try with work text is sent to Claude');
    const saved = await w.page.evaluate(() => JSON.parse(window.__mem.get('practice:asks:2026_10_04')).entries.filter(e => e.kind === 'compare'));
    ok(saved.length === 1 && !/ASMP/.test(JSON.stringify(saved)), 'the saved ask has no work text → ' + JSON.stringify(saved[0] && { words: saved[0].words, prompt: saved[0].prompt }));
    await w.browser.close();
  }

  console.log('\n[v5 3d. Work rows go to What now?; nothing from them is saved to appdata]');
  {
    const plan = { patterns: ['The consent form and the tax folder both wait'], options: [{ title: 'Start with the call', steps: [
      { text: 'Phone Maria Lopez about the consent form', ledger_row: 8, minutes: 5, est: false, start: '09:15', kind: 'other' },
      { text: 'Put the tax folder on the desk', ledger_row: 2, minutes: 2, est: false, start: '09:20', kind: 'academic' },
    ] }], parked: [], new_tasks: [], question: null };
    const fake = G.makeGoogle({ sheet: { Ledger: G.ledgerValues(), Rules: G.RULES_ROWS } });
    const ctx = await open({ fakeFirestore: null, seed: F.base(), token: true, google: fake.handler, device: { __nw_ledger_link: JSON.stringify(SHEET_URL) }, proxy: async () => textReply(plan) });
    const { page } = ctx;
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('[data-pr-ledger-open]');
    ok(!(await page.locator('[data-pr-ledger]').innerText()).includes('Maria Lopez'), 'work rows are still not listed on the strip');
    await page.locator('textarea[aria-label="What is in your head"]').fill('The consent form call and the tax folder are both on my mind');
    await page.getByRole('button', { name: 'What now?', exact: true }).click();
    await page.waitForSelector('[data-pr-now-patterns]');
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(/Phone Maria Lopez about the consent form/.test(call.messages[0].content) && /Email the ASMP report/.test(call.messages[0].content) && /Open the STARR deck/.test(call.messages[0].content), 'What now? sends the work rows with the other open rows');
    ok((await page.locator('[data-pr-whatnow]').innerText()).includes('Phone Maria Lopez'), 'the answer shows the work step on screen');
    await wait(page, 800);
    const db = await page.evaluate(() => JSON.stringify([...window.__mem.entries()].filter(([k]) => !/^drafts:|^practice:drafts$/.test(k))));
    const leak = (db.match(/.{0,60}(Maria Lopez|VINE|ASMP|STARR|Phone Maria).{0,60}/gi) || []);
    ok(!leak.length, 'nothing from a work row is saved to appdata (the What now? record says "work, kept on this device") → ' + JSON.stringify(leak));
    ok(/\(work, kept on this device\)/.test(db) && /Put the tax folder on the desk/.test(db), 'the saved record keeps the other steps');
    await finish(ctx, 'work rows');
  }

}

// ───────────────────────── Part 4 ─────────────────────────
async function part4() {
  console.log('\n[v5 4a. Wake up on the first screen; ?start=waking; Overwhelm]');
  {
    const ctx = await open({ offline: true });
    const { page } = ctx;
    ok(await page.locator('[data-nw-wakeup]').count() === 1 && await page.locator('[data-nw-wakeup]').isVisible(), 'the first screen has one Wake up button at the top');
    ok(await page.evaluate(() => { const b = document.querySelector('[data-nw-wakeup]'); return b.parentElement.firstElementChild === b; }), 'it is the first thing on that screen');
    await page.locator('[data-nw-wakeup]').click();
    await page.waitForSelector('text=Where are you?', { timeout: 10000 });
    ok(true, 'offline: Wake up opens Waking up ("Where are you?")');
    await page.getByRole('button', { name: 'Eyes closed', exact: true }).click();
    await wait(page, 300);
    if (!(await page.locator('.pr-root').innerText()).includes("What's in the way?")) await page.locator('.pr-root').getByRole('button', { name: 'Next', exact: true }).click();
    ok(await page.getByRole('button', { name: 'Overwhelm', exact: true }).count() === 1, '"What\'s in the way?" offers Overwhelm');
    await page.getByRole('button', { name: 'Overwhelm', exact: true }).click();
    await wait(page, 1500); // the waking draft saves about 1 s after a change
    // Leave and come back by the button: the draft in progress resumes where it was.
    await page.getByRole('button', { name: '✕ Close' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.locator('[data-nw-wakeup]').click();
    await wait(page, 600);
    ok((await page.locator('.pr-root').innerText()).includes("What's in the way?") && await page.getByRole('button', { name: /Overwhelm$/ }).getAttribute('aria-pressed') === 'true', 'a waking draft in progress resumes (Overwhelm still picked)');
    await page.locator('.pr-root').getByRole('button', { name: 'Next', exact: true }).click();
    await wait(page, 300);
    ok((await page.locator('.pr-root').innerText()).includes('Breathe out slowly 3 times'), 'Overwhelm adds a breath-out step that can be done in place');
    await page.getByRole('button', { name: "I'm up and moving" }).click();
    await wait(page, 800);
    const log = await page.evaluate(() => JSON.parse(window.storage.dev.getItem('practice:log:2026_11_15')).entries);
    const rec = log.find(e => e.source === 'app-waking');
    ok(rec && /In the way: Overwhelm/.test(rec.note) && rec.wake, 'Overwhelm is saved in the waking record → ' + (rec && rec.note));
    await finish(ctx, 'wake up');
  }
  {
    const ctx = await open({ fakeFirestore: null, seed: F.base() });
    const { page } = ctx;
    const { ORIGIN } = require('./p1-check');
    await page.goto(ORIGIN + '/?start=waking');
    await page.waitForFunction(() => document.querySelector('nav button'), null, { timeout: 60000 });
    await page.waitForSelector('text=Where are you?', { timeout: 15000 });
    ok(true, '?start=waking opens straight into Waking up');
    await finish(ctx, 'start=waking');
  }

  console.log('\n[v5 4b. Other tabs unchanged; the morning briefing copy]');
  {
    const seed = { ...F.base(), 'practice:three:2026_11': JSON.stringify({ month: '2026_11', entries: [{ id: 't3_a', at: '2026-11-15T17:00:00.000Z', date: '2026-11-15', kind: 'pick', slot: 'academic', text: 'Read chapter 4' }] }) };
    const ctx = await open({ fakeFirestore: null, seed });
    const { page } = ctx;
    for (const tab of ['Kaizen', 'Practice', 'System']) {
      await page.getByRole('button', { name: tab, exact: true }).click(); await wait(page, 300);
      ok(!(await page.locator('[data-nw-wakeup]').isVisible()), `${tab}: no Wake up button`);
    }
    await page.getByRole('button', { name: 'Practice', exact: true }).click(); await wait(page, 1500); // Today's three loads
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await wait(page, 300);
    await page.locator('[title="Copy morning briefing prompt"]:visible').first().click();
    await wait(page, 400);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    ok(!/kaizen/i.test(text), 'the copied briefing has no Kaizen line');
    ok(/1\. Today's three .*Academic: Read chapter 4; Other: not picked; Self-nourishment: not picked/.test(text), "it starts with today's three → " + text.split('\n')[2]);
    const i3 = text.indexOf("Today's three"), iMust = text.indexOf('What must happen today'), iRead = text.indexOf('Then read');
    ok(i3 > 0 && iMust > i3 && iRead > iMust && /Universal Spark Ledger.*Brain Dump.*voice transcripts.*Fireflies.*Apple Health for the last 3 to 7 days/.test(text), 'then what must happen today, then the sources to read, in that order');
    await finish(ctx, 'briefing');
    const c2 = await open({ fakeFirestore: null, seed: F.base() });
    await c2.page.locator('[title="Copy morning briefing prompt"]:visible').first().click(); await wait(c2.page, 300);
    ok(/none chosen yet\. Suggest three\./.test(await c2.page.evaluate(() => navigator.clipboard.readText())), 'with none chosen it asks to suggest three');
    await finish(c2, 'briefing none');
  }
}

// ───────────────────────── Part 5 ─────────────────────────
const docsOf = (page) => page.evaluate(() => Object.fromEntries([...window.__fakeDocs.entries()].map(([k, v]) => [k, { ...v, updatedAt: new Date(1000) }])));
const card = async (page) => ((await page.locator('[data-nw-return-text]').count()) ? page.locator('[data-nw-return-text]').innerText() : null);
async function part5() {
  console.log('\n[v5 5a. Return card: a guided flow left at step 3; Open goes back; a second device shows it]');
  {
    const ctx = await open();
    const { page } = ctx;
    ok(await page.locator('[data-nw-return]').count() === 0, 'off by default: no card');
    await page.getByRole('button', { name: 'System', exact: true }).click();
    await page.locator('input[aria-label="Show the return card"]').check();
    await wait(page, 600);
    ok(/Saved\./.test(await page.locator('[data-nw-return-switch]').innerText()), 'the switch is saved');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nw-return-open', { detail: { type: 'flow', practiceId: 'ten-percent-intercept' } })));
    await page.waitForSelector('text=Begin');
    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    ok((await page.locator('.pr-root').innerText()).includes('Step 3 of 3'), 'the flow is at step 3');
    await wait(page, 1500);
    await page.getByRole('button', { name: '✕ Close' }).click();
    await wait(page, 800);
    ok(/^Back to: 10% intercept, step 3 of 3\. Left \d{1,2}:\d\d (AM|PM)\.$/.test(await card(page) || ''), 'leaving at step 3 fills the card → ' + await card(page));
    const docs = await docsOf(page);
    ok(docs.nw_return && JSON.parse(docs.nw_return.value).card.target.practiceId === 'ten-percent-intercept', 'the card is stored through window.storage at nw:return');
    await finish(ctx, 'return flow');
    // Reopened (here: a second device on the same database): the card shows; Open goes back to step 3.
    const ctx2 = await open({ fakeFirestore: docs });
    const p2 = ctx2.page;
    ok(/^Back to: 10% intercept, step 3 of 3/.test(await card(p2) || ''), 'reopening (another device) shows the card');
    await p2.locator('[data-nw-return]').getByRole('button', { name: 'Open' }).click();
    await wait(p2, 1500);
    ok((await p2.locator('.pr-root').innerText()).includes('Step 3 of 3'), 'Open returns to step 3');
    await p2.getByRole('button', { name: 'System', exact: true }).click();
    ok(/Open was tapped 1 time\./.test(await p2.locator('[data-nw-return-switch]').innerText()), 'the System tab shows how often Open was tapped on this device');
    await finish(ctx2, 'return second device');
  }

  console.log('\n[v5 5b. Return card offline: a kept Dump line; the newer replaces the older; Hide]');
  {
    // Offline from the start: the switch is in this device's copy (as after an earlier online open).
    const ctx = await open({ offline: true, device: { 'nw:return': JSON.stringify({ on: true, card: null }) } });
    const { page } = ctx;
    await openDump(page);
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Reply to the drafted paragraph');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await wait(page, 600);
    await page.locator('[data-nw-keep-way-back]').click();
    await wait(page, 600);
    ok(/^Back to: Reply to the drafted paragraph\. Left /.test(await card(page) || ''), 'keep as my way back makes the Dump line the card');
    await page.reload(); await page.waitForFunction(() => document.querySelector('nav button')); await wait(page, 2500);
    ok(/^Back to: Reply to the drafted paragraph/.test(await card(page) || ''), 'offline, after reopening, the kept line still shows');
    await openDump(page);
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Call the bank');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await wait(page, 600);
    await page.locator('[data-nw-keep-way-back]').click();
    await wait(page, 600);
    ok(await page.locator('[data-nw-return]').count() === 1 && /^Back to: Call the bank\./.test(await card(page) || ''), 'of two kept lines only the newer shows');
    await page.locator('[data-nw-return]').getByRole('button', { name: 'Hide' }).click();
    await wait(page, 600);
    ok(await page.locator('[data-nw-return]').count() === 0, 'Hide removes it');
    await page.reload(); await page.waitForFunction(() => document.querySelector('nav button')); await wait(page, 2500);
    const after = await page.locator('[data-nw-return]').count();
    ok(after === 0, 'after Hide and reopening, nothing shows → ' + after + ' card(s) ' + (await card(page) || ''));
    ok(!/\bhidden\b/i.test(await page.evaluate(() => document.body.innerText)), 'no count or badge for what was hidden');
    // Went wrong with "Nothing yet" offers it too.
    await page.locator('[data-nw-quick="wrong"]').click();
    await page.locator('input[aria-label="What went wrong"]').fill('Forgot the form at home');
    await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Nothing yet' }).click();
    await page.locator('[data-nw-wrong]').getByRole('button', { name: 'Save' }).click();
    await wait(page, 600);
    await page.locator('[data-nw-wrong] [data-nw-keep-way-back]').click();
    await wait(page, 500);
    ok(/^Back to: Forgot the form at home\./.test(await card(page) || ''), 'a Went wrong entry saved with "Nothing yet" can be kept as the way back');
    await finish(ctx, 'return offline');
  }

  console.log('\n[v5 5c. Switch off: the app is as before]');
  {
    const fake = newFake();
    const ctx = await open({ token: true, google: fake.handler });
    const { page } = ctx;
    await openDump(page);
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Switch-off dump');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await wait(page, 1200);
    ok(fake.doc.paras.some(p => /^Switch-off dump /.test(p.text)) && await page.locator('[data-nw-keep-way-back]').count() === 0, 'Dump sends as before, with no keep button');
    await page.locator('[data-nw-quick="joy"]').click();
    await page.locator('[data-nw-joy] textarea[aria-label="What happened"]').fill('Sun on the snow');
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Save joy' }).click(); await wait(page, 600);
    await page.locator('[data-nw-quick="predict"]').click();
    await page.locator('textarea[aria-label="Prediction"]').fill('Quiet evening');
    await page.locator('[data-nw-predict]').getByRole('radio', { name: '3', exact: true }).click();
    await page.locator('[data-nw-predict]').getByRole('button', { name: 'Save prediction' }).click(); await wait(page, 600);
    await page.locator('[data-nw-quick="feedback"]').click();
    await page.locator('textarea[aria-label="Feedback for the app"]').fill('TEST feedback with the switch off');
    await page.locator('[data-nw-feedback], [data-nw-quick-panel]').getByRole('button', { name: /^Send|^Save/ }).first().click().catch(() => {});
    await wait(page, 600);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.locator('[data-nw-wakeup]').click();
    await page.waitForSelector('text=Where are you?');
    await page.getByRole('button', { name: '✕ Close' }).click();
    ok(await page.locator('[data-nw-return]').count() === 0 && !(await page.evaluate(() => window.__fakeDocs.has('nw_return'))), 'with the switch off: no card, and nw:return is never written (Dump, Joy, Predict, Feedback, Wake up)');
    await finish(ctx, 'switch off');
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  const parts = { 1: part1, 2: part2, 3: part3, 4: part4, 5: part5 };
  for (const [k, fn] of Object.entries(parts)) if (which === 'all' || which === k) await fn();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
