// Build v4-A checks (Nov 2026): What now? works again (structured output), the Ledger on any device, calendar
// givens, Today's three. Run: NODE_PATH=$(npm root -g) node scripts/v4a-test.js [part]
// Every Google request is answered by a fake (scripts/google-fake.js plus the calendar handler here); the AI proxy
// is a mock. The live Firestore, Drive, the Calendar, the Ledger and the Brain Dump are never touched.
const fs = require('fs');
const path = require('path');
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');
const G = require('./google-fake');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const mem = (page, key) => page.evaluate(k => window.__mem.get(k) ?? null, key);
const memJSON = async (page, key) => { const v = await mem(page, key); return v == null ? null : JSON.parse(v); };
const clickName = (page, name, exact = true) => page.getByRole('button', { name, exact }).first().click();
const pr = (page) => page.locator('.pr-root');
const visibleText = (page) => pr(page).innerText();
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const baseSeed = (extra = {}) => ({ ...F.base(), ...extra });
async function openPractice(opts) {
  const ctx = await openPage(opts);
  await ctx.page.waitForTimeout(3500);
  await ctx.page.getByRole('button', { name: 'Practice', exact: true }).click();
  await ctx.page.waitForSelector('.pr-root h1');
  await wait(ctx.page, 500);
  return ctx;
}
async function finish(ctx, label) {
  ok(ctx.errors.length === 0, `${label}: no console errors${ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''}`);
  await ctx.browser.close();
}

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${G.SHEET_ID}/edit#gid=0`;
const dev = (extra = {}) => ({ __nw_ledger_link: JSON.stringify(SHEET_URL), ...extra });
const newFake = (over = {}) => G.makeGoogle({ sheet: { Ledger: G.ledgerValues(), Rules: G.RULES_ROWS }, doc: { title: 'Brain Dump Nov 2026', paras: [
  { text: 'Monday, Nov 2, 2026', style: 'HEADING_1' }, { text: 'older note', style: 'NORMAL_TEXT' }] }, ...over });
async function openLedger(fake, opts = {}) {
  return openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', token: true, google: fake.handler, device: dev(), ...opts });
}

const NOW_PLAN = (over = {}) => ({
  patterns: ['Three things wait on the dentist page'],
  options: [
    { title: 'Short start', steps: [
      { text: 'Put the tax folder on the desk', ledger_row: 2, minutes: 5, est: false, start: '08:15', kind: 'academic' },
      { text: 'Walk to the mailbox', ledger_row: null, minutes: 10, est: false, start: '08:20', kind: 'nourishment' },
    ] },
    { title: 'Dentist first', steps: [{ text: 'Open the dentist page on the phone', ledger_row: 5, minutes: 3, est: false, start: '08:15', kind: 'other' }] },
  ],
  parked: ['I worry about the lease'], new_tasks: [], question: null, ...over,
});
const textReply = (obj) => ({ status: 200, json: { model: 'claude-sonnet-5-5', usage: { input_tokens: 900, output_tokens: 300 }, stop_reason: 'end_turn', content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } });
const nowProxy = (plan = NOW_PLAN()) => async () => textReply(plan);
const WORDS = 'The dentist page, the tax folder and the lease are all in my head and I do not know where to start.';
const stripText = (page) => page.locator('[data-pr-ledger]').innerText();

// A schema check that follows the structured-output rules.
function schemaProblems(node, at = 'schema') {
  const out = [];
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n, i) => out.push(...schemaProblems(n, `${at}[${i}]`))); return out; }
  if (node.type === 'object' && node.additionalProperties !== false) out.push(`${at}: additionalProperties must be false`);
  ['minimum', 'maximum', 'minLength', 'maxLength', 'exclusiveMinimum', 'exclusiveMaximum'].forEach(k => { if (k in node) out.push(`${at}: ${k} not allowed`); });
  if ('minItems' in node && ![0, 1].includes(node.minItems)) out.push(`${at}: minItems only 0 or 1`);
  if (node.properties && ('reasoning' in node.properties || 'thinking' in node.properties || 'rationale' in node.properties)) out.push(`${at}: no reasoning property`);
  if (Array.isArray(node.type) && node.type.includes('null')) out.push(`${at}: nullable must be anyOf with null`);
  Object.entries(node).forEach(([k, v]) => out.push(...schemaProblems(v, `${at}.${k}`)));
  return out;
}

// ───────────────────────── Part 1 ─────────────────────────
async function part1() {
  console.log('\n[1.1 What now?: structured output, no forced tool]');
  {
    const ctx = await openLedger(newFake(), { proxy: nowProxy() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-patterns]');
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    const fmt = call.output_config && call.output_config.format;
    ok(call.output_config.effort === 'low' && fmt && fmt.type === 'json_schema' && fmt.schema && fmt.schema.type === 'object', 'output_config keeps effort low and adds a json_schema format');
    ok(!('tools' in call) && !('tool_choice' in call), 'no tools and no tool_choice are sent');
    const probs = schemaProblems(fmt.schema);
    ok(probs.length === 0, 'the schema follows the structured-output rules' + (probs.length ? ' → ' + probs.join('; ') : ''));
    ok(fmt.schema.properties.options.items.properties.steps.items.properties.ledger_row.anyOf.some(x => x.type === 'null'), 'nullable fields are anyOf with null');
    const t = await visibleText(page);
    ok(t.includes('Three things wait on the dentist page') && t.includes('Short start') && t.includes('Dentist first'), 'the JSON in the text block is parsed and shown');
    ok(t.includes('Self-nourishment') && !/· nourishment/.test(t), 'kind nourishment shows as Self-nourishment');
    ok(!/vessel/i.test(JSON.stringify(fmt)), 'the schema never says vessel');
    await finish(ctx, 'structured output');
  }

  console.log('\n[1.2 the proxy says why]');
  {
    const msg = 'tool_choice: type "tool" and "any" are not supported for this model.';
    const ctx = await openLedger(newFake(), { proxy: async () => ({ status: 400, json: { type: 'invalid_request_error', message: msg } }) });
    const { page } = ctx;
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-retry]');
    const t = await visibleText(page);
    ok(t.includes('The AI proxy answered 400: tool_choice: type "tool" and "any" are not supported for this model.'), 'a 400 shows the API message');
    ok(ctx.errors.every(e => /Failed to load resource.*(400|529)/.test(e)), '400: only the browser\'s own network line is logged');
    await ctx.browser.close();
    const long = 'x'.repeat(500);
    const c2 = await openLedger(newFake(), { proxy: async () => ({ status: 529, json: { error: { type: 'overloaded_error', message: long } } }) });
    await c2.page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(c2.page, 'What now?');
    await c2.page.waitForSelector('[data-pr-now-retry]');
    const t2 = await visibleText(c2.page);
    ok(t2.includes('The AI proxy answered 529: ' + 'x'.repeat(200)) && !t2.includes('x'.repeat(201)), 'error.message is cut at 200 characters');
    await c2.browser.close();
  }

  console.log('\n[1.3 the forced-tool check]');
  {
    const bad = /(tool_choice|toolChoice)\s*:\s*\{\s*type\s*:\s*['"](tool|any)['"]/;
    ok(!bad.test(HTML), 'index.html sends no tool_choice of type tool or any');
    ok(bad.test("x = { tool_choice: { type: 'tool', name: 'a' } }") && bad.test('toolChoice: { type: "any" }') && !bad.test("toolChoice: { type: 'auto' }"), 'the check catches tool and any, and lets auto through');
    const h = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
    ok(/tool_choice/.test(h) && /'any'|\|any/.test(h), 'harness.js has the same check');
  }

  console.log('\n[1.4 a refusal or bad JSON: one plain line, words stay, Try again]');
  {
    let n = 0;
    const proxy = async () => {
      n++;
      if (n === 1) return { status: 200, json: { model: 'm', stop_reason: 'refusal', content: [] } };
      if (n === 2) return textReply('this is {not json');
      return textReply(NOW_PLAN());
    };
    const ctx = await openLedger(newFake(), { proxy });
    const { page } = ctx;
    const box = page.locator('textarea[aria-label="What is in your head"]');
    await box.fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-retry]');
    let t = await visibleText(page);
    ok(/Claude did not answer that one\. Your words are still in the box\./.test(t) && await box.inputValue() === WORDS, 'refusal: one plain line, words stay in the box');
    await clickName(page, 'Try again');
    await page.waitForFunction(() => /could not be read/.test(document.body.innerText));
    t = await visibleText(page);
    ok(/Claude's answer could not be read\. Your words are still in the box\./.test(t) && await box.inputValue() === WORDS, 'JSON that does not parse: one plain line, words stay');
    await clickName(page, 'Try again');
    await page.waitForSelector('[data-pr-now-patterns]');
    ok(n === 3 && await page.locator('[data-pr-now-retry]').count() === 0, 'Try again asks again and the result shows');
    await finish(ctx, 'refusal');
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '1') await part1();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
