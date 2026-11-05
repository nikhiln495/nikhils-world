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

// ───────────────────────── Part 2 ─────────────────────────
const LEDGER_NAME = '⚡ Universal Spark Ledger — Work, Academic & Personal';
const driveCalls = (fake) => fake.calls.filter(c => /\/drive\/v3\/files/.test(c.url));
async function openNoLink(fake) {
  const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', google: fake.handler, googleStub: true });
  await wait(ctx.page, 600);
  return ctx;
}
async function part2() {
  console.log('\n[2.1 Connect Google finds the Ledger by its exact name]');
  {
    const fake = newFake({ driveFiles: [
      { id: G.SHEET_ID, name: LEDGER_NAME, modifiedTime: '2026-11-03T10:00:00Z' },
      { id: 'OTHER_SHEET_ID_00000001', name: 'Budget 2026', modifiedTime: '2026-11-04T10:00:00Z' },
    ] });
    const ctx = await openNoLink(fake);
    const { page } = ctx;
    ok((await stripText(page)).includes('No Ledger link yet'), 'a device with no link says so');
    await page.locator('[data-pr-ledger] [data-pr-connect]').click().catch(async () => { await page.locator('[data-pr-ledger] [data-pr-connect]').click(); });
    await page.waitForSelector('[data-pr-ledger-open]');
    ok((await stripText(page)).includes('File the tax form') && /Found .*Universal Spark Ledger.* linked it on this device/.test(await stripText(page)), 'one match: used at once, and the Ledger reads');
    const q = decodeURIComponent(driveCalls(fake)[0].url);
    ok(q.includes("name='" + LEDGER_NAME + "'") && q.includes("'me' in owners") && q.includes('trashed=false') && q.includes('application/vnd.google-apps.spreadsheet') && q.includes('orderBy=modifiedTime desc'), 'the search asks for the exact name, owned by him, not trashed, newest first');
    const stored = await page.evaluate(() => localStorage.getItem('__nw_ledger_link'));
    const inDb = await page.evaluate(() => JSON.stringify([...window.__mem.entries()]));
    ok(stored && stored.includes(G.SHEET_ID) && !inDb.includes(G.SHEET_ID), 'the link is kept in the device-only key, not in the database');
    ok(!HTML.includes(G.SHEET_ID) && !/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{25,}/.test(HTML), 'no sheet link or id is in index.html');
    await page.getByRole('button', { name: 'System', exact: true }).click();
    const how = await page.locator('[data-nw-ledger-how]').innerText();
    ok(how.includes(LEDGER_NAME) && /found in your Drive by its exact name/.test(how), 'the System tab names the sheet and how it was found');
    ok((await page.locator('[data-nw-ledger-setup]').innerText()).includes('Use a different sheet'), 'the paste box is "Use a different sheet"');
    await finish(ctx, 'found by name');
  }

  console.log('\n[2.1 several matches: a one-tap list]');
  {
    const fake = newFake({ driveFiles: [
      { id: 'OLDER_LEDGER_ID_0000001', name: LEDGER_NAME, modifiedTime: '2026-09-10T10:00:00Z' },
      { id: G.SHEET_ID, name: LEDGER_NAME, modifiedTime: '2026-11-03T10:00:00Z' },
    ] });
    const ctx = await openNoLink(fake);
    const { page } = ctx;
    await page.locator('[data-pr-ledger] [data-pr-connect]').click();
    await page.waitForSelector('[data-pr-ledger-pick]');
    const items = await page.locator('[data-pr-ledger] [data-pr-ledger-pick]').allInnerTexts();
    ok(items.length === 2 && items.every(t => t.includes(LEDGER_NAME)) && /Nov 3, 2026/.test(items[0]) && /Sep 10, 2026/.test(items[1]), 'names and modified dates, newest first');
    ok(await page.evaluate(() => localStorage.getItem('__nw_ledger_link')) === null, 'nothing is chosen for him');
    await page.locator('[data-pr-ledger] [data-pr-ledger-pick]').first().click();
    await page.waitForSelector('[data-pr-ledger-open]');
    ok((await page.evaluate(() => localStorage.getItem('__nw_ledger_link'))).includes(G.SHEET_ID), 'one tap uses that sheet');
    await page.getByRole('button', { name: 'System', exact: true }).click();
    ok(/picked by you from a list/.test(await page.locator('[data-nw-ledger-how]').innerText()), 'the System tab says it was picked from a list');
    await finish(ctx, 'picker');
  }

  console.log('\n[2.1 fallback by part of the name; none found → the paste box]');
  {
    const fake = newFake({ driveFiles: [{ id: G.SHEET_ID, name: 'Universal Spark Ledger (new)', modifiedTime: '2026-11-03T10:00:00Z' }] });
    const ctx = await openNoLink(fake);
    await ctx.page.locator('[data-pr-ledger] [data-pr-connect]').click();
    await ctx.page.waitForSelector('[data-pr-ledger-open]');
    const urls = driveCalls(fake).map(c => decodeURIComponent(c.url));
    ok(urls.length === 2 && /name contains 'Universal Spark Ledger'/.test(urls[1]), 'no exact match → the second search looks for part of the name');
    await ctx.page.getByRole('button', { name: 'System', exact: true }).click();
    ok(/by part of its name/.test(await ctx.page.locator('[data-nw-ledger-how]').innerText()), 'the System tab says it was found by part of its name');
    await ctx.browser.close();

    const none = newFake({ driveFiles: [{ id: 'X_SHEET_ID_000000000001', name: 'Budget', modifiedTime: '2026-11-03T10:00:00Z' }] });
    const c2 = await openNoLink(none);
    await c2.page.locator('[data-pr-ledger] [data-pr-connect]').click();
    await c2.page.waitForSelector('[data-pr-ledger-find]');
    ok(/No Ledger spreadsheet found in your Drive\. Paste its link on the System tab\./.test(await stripText(c2.page)) && await c2.page.evaluate(() => localStorage.getItem('__nw_ledger_link')) === null, 'none found: says so and sets no link');
    await c2.page.getByRole('button', { name: 'System', exact: true }).click();
    await c2.page.locator('input[aria-label="Ledger link"]').fill(SHEET_URL);
    await clickName(c2.page, 'Save link');
    await wait(c2.page, 600);
    ok(/a link you pasted/.test(await c2.page.locator('[data-nw-ledger-how]').innerText()), 'paste still works and the System tab says "a link you pasted"');
    await c2.browser.close();

    const had = newFake({ driveFiles: [{ id: G.SHEET_ID, name: LEDGER_NAME, modifiedTime: '2026-11-03T10:00:00Z' }] });
    const c3 = await openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', google: had.handler, googleStub: true, device: dev() });
    await wait(c3.page, 600);
    await c3.page.locator('[data-pr-ledger] [data-pr-connect]').click();
    await wait(c3.page, 800);
    ok(driveCalls(had).length === 0, 'a device that already has a link is not searched');
    await c3.browser.close();
  }

  console.log('\n[Completed_At: the Ledger\'s own format]');
  {
    const ctx = await openLedger(newFake(), {});
    const r = await ctx.page.evaluate(() => ({ s: nwLedgerStamp(new Date(2026, 9, 31, 16, 18)), a: nwParseCompleted('2026-10-31 16:18').getHours(), b: nwParseCompleted('2026-10-31T20:18:00.000Z').getTime(), c: nwParseCompleted('nonsense') }));
    ok(r.s === '2026-10-31 16:18', 'written as YYYY-MM-DD HH:mm in local time');
    ok(r.a === 16 && r.b === Date.UTC(2026, 9, 31, 20, 18) && r.c === null, 'both forms are accepted when reading');
    await ctx.browser.close();
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '1') await part1();
  if (which === 'all' || which === '2') await part2();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
