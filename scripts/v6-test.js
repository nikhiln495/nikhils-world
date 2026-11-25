// Build v6 checks (Nov 25, 2026): Today's three from the latest session transcript; the confidential: Brain Dump tag.
// Run: NODE_PATH=$(npm root -g) node scripts/v6-test.js [part]
// Every Google request is answered by scripts/google-fake.js and the AI proxy by a local fake. The live Firestore, Drive,
// the Brain Dump and Fireflies are never touched.
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');
const G = require('./google-fake');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const NOW = '2026-11-25T08:10:00';
const asDocs = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/[:/.#$[\]]/g, '_'), { key: k, value: typeof v === 'string' ? v : JSON.stringify(v), updatedAt: new Date(1000) }]));
const textReply = (obj) => ({ status: 200, json: { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] } });
const seed = () => ({ ...F.base(), 'practice:three-start': JSON.stringify({ start: '2026-11-10' }) });
async function open(opts) {
  const ctx = await openPage({ now: NOW, fakeFirestore: asDocs(seed()), token: true, ...opts });
  await ctx.page.waitForTimeout(3500);
  return ctx;
}
async function finish(ctx, label) {
  const errs = ctx.errors.filter(e => !/Failed to load resource|net::ERR/.test(e));
  ok(errs.length === 0, `${label}: no console errors${errs.length ? ' → ' + errs.join(' | ') : ''}`);
  await ctx.browser.close();
}
const cloud = (page, id) => page.evaluate(i => { const d = window.__fakeDocs.get(i); return d ? JSON.parse(d.value) : null; }, id);
const P = (text) => ({ text, style: 'NORMAL_TEXT' });
const BD = { title: 'Brain Dump Nov 2026', paras: [{ text: 'Monday, Nov 24, 2026', style: 'HEADING_1' }, P('older note')] };

async function part1() {
  console.log('\n[v6 1. Today\'s three from the latest session]');
  {
    const SESS = { id: 'FAKE_SESSION_1', title: '2026-11-24 — Session with Dr. Shobha — Fireflies Verbatim Transcript', paras: [P('[00:01] Shobha: So tomorrow, one academic thing.'), P('[00:05] Nikhil: Open the stats homework and do problem 1.')] };
    const fake = G.makeGoogle({ doc: BD, extraDocs: [SESS] });
    fake.driveFiles.find(f => f.id === SESS.id).modifiedTime = '2026-11-24T18:00:00Z';
    const sent = [];
    const proxy = async (body) => { sent.push(body); return textReply({ academic: 'Do problem 1 of the stats homework', other: 'Call the landlord', nourishment: null }); };
    const ctx = await open({ google: fake.handler, proxy });
    const { page } = ctx;
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('[data-pr-three-session]');
    await page.locator('[data-pr-three-session]').getByRole('button', { name: 'Fill from the latest session' }).click();
    await page.waitForSelector('[data-pr-three-session] >> text=Use these');
    const box = await page.locator('[data-pr-three-session]').innerText();
    ok(box.includes('Session with Dr. Shobha') && box.includes('Academic: Do problem 1 of the stats homework') && box.includes('Other: Call the landlord') && !box.includes('Self-nourishment'), 'shows the session and the slots it settled, nothing for the one it did not → ' + JSON.stringify(box));
    const b = sent[0] || {};
    ok(b.output_config && b.output_config.format && b.output_config.format.type === 'json_schema' && !b.tool_choice, 'a fixed JSON shape through output_config.format, no forced tool');
    ok(JSON.stringify(b.messages || []).includes('Open the stats homework'), 'Claude is given the transcript text');
    ok(!(await cloud(page, 'practice_three_2026_11')), 'nothing is saved before "Use these"');
    await page.locator('[data-pr-three-session]').getByRole('button', { name: 'Use these' }).click();
    await wait(page, 1200);
    const doc = await cloud(page, 'practice_three_2026_11');
    const picks = (doc && doc.entries || []).filter(e => e.kind === 'pick');
    ok(picks.length === 2 && picks.some(e => e.slot === 'academic' && e.text === 'Do problem 1 of the stats homework') && picks.some(e => e.slot === 'other' && e.text === 'Call the landlord') && picks.every(e => e.date === '2026-11-25'), 'Use these saves the picks for today, one per slot');
    ok((await page.locator('[data-pr-three-slot="academic"]').innerText()).includes('Do problem 1'), 'the slot shows the pick');
    const all = await page.evaluate(() => JSON.stringify([...window.__fakeDocs.entries()]));
    ok(!all.includes('Open the stats homework'), 'the transcript itself is not saved anywhere in the database');
    ok(fake.writes.length === 0, 'nothing is written to Google');
    await finish(ctx, 'from session');
  }
  {
    const OLD = { id: 'FAKE_SESSION_OLD', title: '2026-11-18 — Session with Sheethal — Verbatim Fireflies Transcript', paras: [P('old')] };
    const fake = G.makeGoogle({ doc: BD, extraDocs: [OLD] });
    fake.driveFiles.find(f => f.id === OLD.id).modifiedTime = '2026-11-18T18:00:00Z';
    let called = 0;
    const ctx = await open({ google: fake.handler, proxy: async () => { called++; return textReply({ academic: null, other: null, nourishment: null }); } });
    const { page } = ctx;
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('[data-pr-three-session]');
    const q = [];
    await page.locator('[data-pr-three-session]').getByRole('button', { name: 'Fill from the latest session' }).click();
    await wait(page, 1500);
    const list = fake.calls.find(c => /drive\/v3\/files\?q=/.test(c.url));
    ok(list && /modifiedTime > '2026-11-2/.test(decodeURIComponent(list.url)), 'only the last 3 days are asked for');
    q.push(list);
    await finish(ctx, 'old session');
  }
  {
    const fake = G.makeGoogle({ doc: BD });
    const ctx = await open({ google: fake.handler, proxy: async () => textReply({}) });
    const { page } = ctx;
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('[data-pr-three-session]');
    await page.locator('[data-pr-three-session]').getByRole('button', { name: 'Fill from the latest session' }).click();
    await wait(page, 1500);
    ok((await page.locator('[data-pr-three]').innerText()).includes('No session transcript from the last 3 days'), 'no transcript: says so plainly');
    await finish(ctx, 'no session');
  }
  {
    const ctx = await open({ token: false, proxy: async () => textReply({}) });
    const { page } = ctx;
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('[data-pr-three]');
    ok(await page.locator('[data-pr-three-session]').count() === 0, 'not signed in to Google: no session button');
    await finish(ctx, 'signed out');
  }
}

async function part2() {
  console.log('\n[v6 2. confidential: stays on the device and goes only to its own doc]');
  const fake = G.makeGoogle({ doc: BD });
  let proxied = 0;
  const ctx = await open({ google: fake.handler, proxy: async () => { proxied++; return textReply({}); } });
  const { page } = ctx;
  await page.locator('[data-nw-quick="dump"]').click();
  await page.waitForSelector('[data-nw-dump]');
  await wait(page, 600);
  await page.locator('textarea[aria-label="Brain Dump text"]').fill('Teacher T-104 said the mentor never came\nCheck the consent list');
  await page.locator('[data-nw-dump]').getByRole('button', { name: 'confidential:', exact: true }).click();
  ok((await page.locator('[data-nw-dump-conf]').innerText()).includes('Brain Dump Confidential Nov 2026'), 'picking the tag says where it goes and what to leave out');
  await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
  await wait(page, 1500);
  const conf = fake.docByTitle('Brain Dump Confidential Nov 2026');
  ok(conf && conf.paras.some(p => /^confidential: Teacher T-104 said the mentor never came\u000bCheck the consent list \(from Nikhil's World/.test(p.text)), 'it is written to "Brain Dump Confidential Nov 2026" → ' + JSON.stringify(conf && conf.paras));
  ok(!fake.doc.paras.some(p => /T-104|consent list|confidential/.test(p.text)), 'nothing, not even a pointer, in the main Brain Dump');
  const create = fake.writes.find(w => w.kind === 'create');
  ok(create && create.parents.includes('FAKE_BRAIN_DUMP_FOLDER'), "the doc is made in the Brain Dump's folder");
  const all = await page.evaluate(() => JSON.stringify([...window.__fakeDocs.entries()]));
  ok(!all.includes('T-104'), 'the text never reaches the database');
  const dev = await page.evaluate(() => String(window.__nwDevStore.getItem('__nw_dump_queue')));
  ok(/T-104/.test(dev) && /"status":"sent"/.test(dev), 'kept on this device, marked sent');
  ok(proxied === 0, 'nothing is sent to Claude');
  await finish(ctx, 'confidential');
}

(async () => {
  const which = process.argv[2] || 'all';
  const parts = { 1: part1, 2: part2 };
  for (const [k, fn] of Object.entries(parts)) if (which === 'all' || which === k) await fn();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
