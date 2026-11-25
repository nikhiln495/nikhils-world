// Build v7 checks (Nov 25, 2026 session with Dr. Shobha): Rejuvenate (off the bed, mindful orientation, a spin of
// something to learn), Pause, Contain, Return for a cascade, and the cheer when he is up.
// Run: NODE_PATH=$(npm root -g) node scripts/v7-test.js [part]
// Every Google request is answered by scripts/google-fake.js and the AI proxy by a local fake. Nothing live is touched.
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');
const G = require('./google-fake');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const NOW = '2026-11-25T08:10:00';
const asDocs = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/[:/.#$[\]]/g, '_'), { key: k, value: typeof v === 'string' ? v : JSON.stringify(v), updatedAt: new Date(1000) }]));
const textReply = (obj) => ({ status: 200, json: { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] } });
async function open(opts) {
  const ctx = await openPage({ now: NOW, fakeFirestore: asDocs(F.base()), token: true, ...opts });
  await ctx.page.waitForTimeout(3500);
  return ctx;
}
async function finish(ctx, label) {
  const errs = ctx.errors.filter(e => !/Failed to load resource|net::ERR/.test(e));
  ok(errs.length === 0, `${label}: no console errors${errs.length ? ' → ' + errs.join(' | ') : ''}`);
  await ctx.browser.close();
}
const cloud = (page, id) => page.evaluate(i => { const d = window.__fakeDocs.get(i); return d ? JSON.parse(d.value) : null; }, id);
const click = (page, name) => page.getByRole('button', { name, exact: true }).first().click();
const P = (text) => ({ text, style: 'NORMAL_TEXT' });
const BD = { title: 'Brain Dump Nov 2026', paras: [{ text: 'Wednesday, Nov 25, 2026', style: 'HEADING_1' }, P('older note')] };
const TOPICS = ['Geography', 'Space', 'Science', 'A random story or fantasy', 'An art technique', 'Boat or canoe making', 'Indigenous ways of living', 'How things are made (an airplane, a bedsheet)'];

async function part1() {
  console.log('\n[v7 1. Rejuvenate: off the bed, orientation, spin something to learn]');
  const sent = [];
  const proxy = async (body) => { sent.push(body); return textReply({ title: 'How a birchbark canoe is sewn', text: 'Builders sew the bark panels with split spruce root.', search: 'birchbark canoe building' }); };
  const ctx = await open({ proxy });
  const { page } = ctx;
  await click(page, 'Practice');
  await page.waitForSelector('text=Rejuvenate');
  await click(page, 'Rejuvenate');
  let t = await page.locator('[data-pr-rejuv]').innerText();
  ok(t.includes('First, off the bed: the sofa, or somewhere a little less comfy.'), 'opens with one tap and asks him to move off the bed first');
  await click(page, "I'm off the bed");
  await click(page, 'Mindful orientation, 2 min');
  t = await page.locator('[data-pr-rejuv]').innerText();
  ok(t.toLowerCase().includes('step 1 of 4') && t.includes('I am on the sofa'), 'orientation starts at step 1 of 4');
  await click(page, 'Next'); await click(page, 'Next'); await click(page, 'Next');
  t = await page.locator('[data-pr-rejuv]').innerText();
  ok(t.includes('I do not have to solve the entire day right now.'), 'the last orientation step is her sentence');
  await click(page, 'Done');
  await click(page, 'Spin something to learn');
  const topic = (await page.locator('[data-pr-rejuv-topic]').innerText()).trim();
  ok(TOPICS.includes(topic), 'the spin lands on one of the topics he named → ' + topic);
  ok(sent.length === 0, 'nothing is sent to Claude before "Teach me one thing"');
  await click(page, 'Teach me one thing');
  await page.waitForSelector('text=How a birchbark canoe is sewn');
  const b = sent[0] || {};
  ok(b.output_config && b.output_config.format && b.output_config.format.type === 'json_schema' && !b.tool_choice, 'a fixed JSON shape through output_config.format, no forced tool');
  ok(JSON.stringify(b.messages || []).includes(`Topic: ${topic}`), 'Claude is told the topic that was spun');
  const href = await page.locator('[data-pr-rejuv] a', { hasText: 'Find a video' }).getAttribute('href');
  ok(href === 'https://www.youtube.com/results?search_query=birchbark%20canoe%20building', 'Find a video is a video search for the subject → ' + href);
  await click(page, 'Spin again');
  const topic2 = (await page.locator('[data-pr-rejuv-topic]').innerText()).trim();
  ok(TOPICS.includes(topic2) && topic2 !== topic, 'spin again never repeats the topic just shown');
  await click(page, 'Back');
  await click(page, 'Done, back to it');
  await wait(page, 1200);
  const lg = await cloud(page, 'practice_log_2026_11_25');
  const e = lg && lg.entries[lg.entries.length - 1];
  ok(e && e.practiceId === 'rejuvenate' && e.source === 'app-rejuvenate' && /off the bed/.test(e.note) && /mindful orientation/.test(e.note) && /learn: How a birchbark canoe is sewn/.test(e.note), 'Done logs one Rejuvenate rep: off the bed, what he did → ' + JSON.stringify(e));
  await finish(ctx, 'rejuvenate');

  console.log('\n[v7 1b. Rejuvenate offline and in bed]');
  const ctx2 = await open({ proxy, offline: true });
  const p2 = ctx2.page;
  await click(p2, 'Practice');
  await p2.waitForSelector('text=Rejuvenate');
  await p2.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); });
  await click(p2, 'Rejuvenate');
  await click(p2, 'Not yet, start here');
  t = await p2.locator('[data-pr-rejuv]').innerText();
  ok(t.includes('Start with orientation where you are.'), 'not yet off the bed: orientation where he is, no push');
  await click(p2, 'Spin something to learn');
  t = await p2.locator('[data-pr-rejuv]').innerText();
  ok(t.includes("This device is offline, so Claude can't teach one now.") && !(await p2.getByRole('button', { name: 'Teach me one thing' }).count()), 'offline: says so plainly, no Teach button');
  await finish(ctx2, 'rejuvenate offline');
}

async function part2() {
  console.log('\n[v7 2. Pause, Contain, Return]');
  const fake = G.makeGoogle({ doc: BD });
  let proxied = 0;
  const ctx = await open({ google: fake.handler, proxy: async () => { proxied++; return textReply({}); } });
  const { page } = ctx;
  await click(page, 'Practice');
  await page.waitForSelector('text=Stuck');
  await click(page, 'Stuck');
  await page.locator('[data-pr-cascade-open]').click();
  let t = await page.locator('[data-pr-cascade]').innerText();
  ok(t.includes('I am experiencing a cascade. I do not need to follow every thought.'), 'Pause: her sentence');
  await click(page, 'Next');
  await page.locator('textarea[aria-label="The cascade"]').fill('If I miss karate they will think I am rude');
  await click(page, 'Put it in the Brain Dump');
  await wait(page, 1500);
  const caps = await page.evaluate(() => JSON.stringify(window.nwBrainDump.captures()));
  ok(/Cascade: If I miss karate they will think I am rude/.test(caps), 'Contain: the cascade is captured for the Brain Dump → ' + caps.slice(0, 200));
  ok(fake.doc.paras.some(p => /Cascade: If I miss karate/.test(p.text)), 'and sent to the Brain Dump doc → ' + JSON.stringify(fake.doc.paras.slice(-2)));
  t = await page.locator('[data-pr-cascade]').innerText();
  ok(t.includes('Then 30 seconds to feel the lightness.'), 'then a gesture and 30 seconds');
  await click(page, 'Next');
  await page.locator('input[aria-label="One small action"]').fill('Go down the steps slowly');
  await click(page, 'Do it now');
  await wait(page, 1200);
  const lg = await cloud(page, 'practice_log_2026_11_25');
  const e = lg && lg.entries[lg.entries.length - 1];
  ok(e && e.practiceId === 'pause-contain-return' && /Return: Go down the steps slowly/.test(e.note) && !/karate/.test(e.note), 'logs the rep with the return step, not the cascade itself → ' + JSON.stringify(e));
  ok(proxied === 0, 'nothing is sent to Claude');
  await finish(ctx, 'cascade');
}

async function part3() {
  console.log('\n[v7 3. Stuck is one tap from any tab]');
  const ctx = await open({});
  const { page } = ctx;
  // Starts on another tab (not Practice): the bottom bar's Stuck goes straight to the Stuck screen.
  const n = await page.locator('[data-nw-quick="stuck"]').count();
  ok(n === 1, 'one Stuck button on the bottom bar → ' + n);
  await page.locator('[data-nw-quick="stuck"]').click();
  await wait(page, 600);
  const cascadeVisible = await page.locator('[data-pr-cascade-open]').isVisible();
  ok(cascadeVisible, 'one tap opens the Stuck screen, with Pause, Contain, Return on it');
  await page.locator('[data-nw-quick="stuck"]').click();
  await wait(page, 300);
  ok(await page.locator('[data-pr-cascade-open]').count() === 1, 'a second tap does not stack a second Stuck screen');
  await finish(ctx, 'stuck-one-tap');
}

(async () => {
  const which = process.argv[2] || 'all';
  const parts = { 1: part1, 2: part2, 3: part3 };
  for (const [k, fn] of Object.entries(parts)) if (which === 'all' || which === k) await fn();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
