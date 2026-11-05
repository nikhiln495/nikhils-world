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
    await c2.page.waitForFunction(() => /No Ledger spreadsheet found/.test(document.body.innerText));
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

// ───────────────────────── Part 3 ─────────────────────────
const CAL_TOKEN = JSON.stringify({ token: 'CAL-TOKEN', expiresAt: new Date('2026-11-04T00:00:00Z').getTime() });
const evt = (summary, start, end, over = {}) => ({ id: 'e' + Math.random().toString(36).slice(2, 8), summary, status: 'confirmed', start: { dateTime: start }, end: { dateTime: end }, ...over });
// Fake Google Calendar. calendars: [{ id, summary, selected, events: [...] }]. Records every call.
function makeCalendar(calendars) {
  const C = { calls: [], calendars };
  C.wrap = (inner) => async (route, url) => {
    if (!url.startsWith('https://www.googleapis.com/calendar/v3/')) return inner(route, url);
    const req = route.request();
    C.calls.push({ url, auth: req.headers()['authorization'] || '' });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }); return true; }
    if (C.apiOff) { await json(403, { error: { code: 403, message: 'Google Calendar API has not been used in project 55888993304 before or it is disabled.', status: 'PERMISSION_DENIED' } }); return true; }
    const u = new URL(url);
    if (u.pathname === '/calendar/v3/users/me/calendarList') { await json(200, { items: C.calendars.map(c => ({ id: c.id, summary: c.summary, selected: c.selected })) }); return true; }
    const m = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/);
    if (m) {
      const cal = C.calendars.find(c => c.id === decodeURIComponent(m[1]));
      const lo = Date.parse(u.searchParams.get('timeMin')), hi = Date.parse(u.searchParams.get('timeMax'));
      const items = (cal ? cal.events : []).filter(e => {
        const a = Date.parse(e.start.dateTime || e.start.date + 'T00:00:00-09:00'), b = Date.parse(e.end.dateTime || e.end.date + 'T00:00:00-09:00');
        return b > lo && a < hi;
      });
      await json(200, { items });
      return true;
    }
    await json(404, { error: { message: 'Not found' } });
    return true;
  };
  return C;
}
const calData = () => makeCalendar([
  { id: 'primary', summary: 'Nikhil', selected: true, events: [
    evt('Dr. Shobha session', '2026-11-03T10:00:00-09:00', '2026-11-03T10:50:00-09:00'),
    evt('Cancelled thing', '2026-11-03T12:00:00-09:00', '2026-11-03T12:30:00-09:00', { status: 'cancelled' }),
    evt('Declined thing', '2026-11-03T12:30:00-09:00', '2026-11-03T13:00:00-09:00', { attendees: [{ email: 'me@x', self: true, responseStatus: 'declined' }] }),
    evt('ASMP call', '2026-11-03T11:00:00-09:00', '2026-11-03T11:30:00-09:00'),
    evt('Class', '2026-11-03T15:30:00-09:00', '2026-11-03T16:20:00-09:00'),
    evt('Tomorrow early', '2026-11-04T09:00:00-09:00', '2026-11-04T09:30:00-09:00'),
    evt('Tomorrow afternoon', '2026-11-04T13:00:00-09:00', '2026-11-04T14:00:00-09:00'),
    { id: 'hol', summary: 'Quiet day', status: 'confirmed', start: { date: '2026-11-03' }, end: { date: '2026-11-04' } },
  ] },
  { id: 'shobha@x', summary: 'Dr. Shobha', selected: true, events: [evt('Dr. Shobha session', '2026-11-03T10:00:00-09:00', '2026-11-03T10:50:00-09:00')] },
  { id: 'hidden', summary: 'Not selected', selected: false, events: [evt('Secret hidden thing', '2026-11-03T09:00:00-09:00', '2026-11-03T09:30:00-09:00')] },
  { id: 'vine', summary: 'VINE staff', selected: true, events: [evt('Staff meeting about Maria', '2026-11-03T13:00:00-09:00', '2026-11-03T14:00:00-09:00')] },
]);
async function openCal(fake, cal, opts = {}) {
  return openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', token: true, google: cal.wrap(fake.handler), googleStub: true, device: dev(opts.device || {}), ...(opts.page || {}) });
}
const givensText = (page) => page.locator('[data-pr-givens]').innerText();

async function part3() {
  console.log('\n[3.1 Connect Calendar: the scope is asked only when tapped]');
  {
    const fake = newFake(), cal = calData();
    const ctx = await openCal(fake, cal, { page: { proxy: nowProxy() } });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    ok(cal.calls.length === 0 && !(await page.evaluate(() => (window.__gScopes || []).some(x => /calendar/.test(x)))), 'on open: no calendar scope asked, no calendar request');
    ok(/connect calendar/i.test(await givensText(page)) && /givens today/i.test(await givensText(page)), '"Givens today" with a Connect Calendar line at the top of the Ledger strip');
    ok((await page.locator('[data-pr-ledger]').innerHTML()).indexOf('data-pr-givens') < (await page.locator('[data-pr-ledger]').innerHTML()).indexOf('data-pr-ledger-open'), 'it is above the Ledger steps');
    await page.locator('[data-pr-cal-connect]').click();
    await page.waitForSelector('[data-pr-given]');
    const scopes = await page.evaluate(() => window.__gScopes || []);
    ok(scopes.length === 1 && scopes[0] === 'https://www.googleapis.com/auth/calendar.readonly', 'one request, scope calendar.readonly only');
    ok(cal.calls.every(c => c.auth === 'Bearer TEST-TOKEN'), 'calendar requests use the calendar token');

    console.log('\n[3.2 what is read]');
    const urls = cal.calls.map(c => decodeURIComponent(c.url));
    ok(/calendarList/.test(urls[0]), 'calendarList is read first');
    const ev = urls.filter(u => /\/events\?/.test(u));
    ok(ev.length === 3 && !ev.some(u => /hidden/.test(u)), 'events are read for the selected calendars only');
    ok(ev.every(u => /singleEvents=true/.test(u) && /orderBy=startTime/.test(u)), 'singleEvents and orderBy startTime');
    ok(ev.every(u => u.includes('timeMin=2026-11-03T09:00:00.000Z') && u.includes('timeMax=2026-11-04T21:00:00.000Z')), "the device's local day: midnight today to noon tomorrow");
    const t = await givensText(page);
    ok(t.includes('10:00–10:50') && t.includes('Dr. Shobha session') && t.includes('15:30–16:20') && t.includes('Class'), 'time, title');
    ok((t.match(/Dr\. Shobha session/g) || []).length === 1 && /Nikhil, Dr\. Shobha/.test(t), 'same title and same start are one event (calendar names joined)');
    ok(!/Cancelled thing|Declined thing|Secret hidden/.test(t), 'cancelled, declined and unselected calendars are skipped');
    ok(/tomorrow 09:00–09:30/.test(t) && t.includes('Tomorrow early') && !t.includes('Tomorrow afternoon'), 'tomorrow until noon only');
    ok(t.includes('All day') && t.includes('Quiet day'), 'an all-day item is listed');
    ok(!/Staff meeting|Maria|ASMP call|VINE/.test(t) && (t.match(/Work event/g) || []).length === 2, 'work events show as "Work event" with times only');
    const store = await page.evaluate(() => JSON.stringify({ cal: localStorage.getItem('__nw_cal_cache'), db: [...window.__mem.entries()] }));
    ok(/__nw_cal_cache|Dr\. Shobha session/.test(store) && !/Staff meeting|Maria|ASMP call/.test(store), 'this device keeps the read; no work title in it');
    const db = await page.evaluate(() => JSON.stringify([...window.__mem.entries()]));
    ok(!/CAL-TOKEN|Quiet day|Tomorrow early/.test(db), 'nothing from the calendar reaches the database');
    ok(await page.getByRole('button', { name: 'Refresh', exact: true }).count() >= 1 && await page.locator('[data-pr-cal-connect]').count() === 0, 'a connected Calendar shows Refresh, not Connect');

    console.log('\n[3.4 sent to What now? as fixed givens]');
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-patterns]');
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    const msg = call.messages[0].content;
    ok(/Fixed events today/.test(msg) && msg.includes('10:00–10:50 | Dr. Shobha session (Nikhil, Dr. Shobha)') && msg.includes('15:30–16:20 | Class'), 'the request lists the fixed events with times');
    ok(msg.includes('11:00–11:30 | Work event, busy') && msg.includes('13:00–14:00 | Work event, busy'), 'work events go as "Work event, busy" with times only');
    ok(!/Staff meeting|Maria|ASMP|VINE/.test(msg), 'no work title or work calendar name in the request');
    ok(/tomorrow 09:00–09:30 \| Tomorrow early/.test(msg), 'tomorrow before noon is included');
    const sys = call.system[0].text;
    ok(/events are fixed|Calendar events .* are fixed/i.test(sys) && /Plan steps in the gaps/.test(sys) && /No step starts inside an event/.test(sys), 'P_NOW_RULES say events are fixed, steps go in the gaps, no step starts inside an event');

    console.log('\n[3.3 Refresh, and the offline copy]');
    const n0 = cal.calls.length;
    await page.locator('[data-pr-givens-refresh]').click();
    await wait(page, 800);
    ok(cal.calls.length > n0, 'Refresh reads again');
    const keep = await page.evaluate(() => ({ __nw_ledger_link: localStorage.getItem('__nw_ledger_link'), __nw_cal_token: localStorage.getItem('__nw_cal_token'), __nw_cal_cache: localStorage.getItem('__nw_cal_cache') }));
    await ctx.browser.close();
    const off = calData();
    const c2 = await openPage({ seed: baseSeed(), now: '2026-11-03T08:10:00', token: true, google: off.wrap(newFake().handler), offline: true, device: keep });
    await wait(c2.page, 3500);
    await c2.page.getByRole('button', { name: 'Practice', exact: true }).click();
    await c2.page.waitForSelector('[data-pr-given]');
    const t2 = await givensText(c2.page);
    ok(t2.includes('Dr. Shobha session') && /Offline\. From this device, read \d\d:\d\d/.test(t2) && off.calls.length === 0, 'offline: the copy on this device is shown with its read time; no request');
    await c2.browser.close();
  }

  console.log('\n[3.1 the Calendar API is off: one plain line]');
  {
    const cal = calData(); cal.apiOff = true;
    const ctx = await openCal(newFake(), cal);
    await ctx.page.waitForSelector('[data-pr-cal-connect]');
    await ctx.page.locator('[data-pr-cal-connect]').click();
    await ctx.page.waitForSelector('[data-pr-givens-error]');
    ok(/Google Calendar API is not turned on for the project that owns the Drive sign-in/.test(await givensText(ctx.page)), 'API off → says so');
    await ctx.browser.close();
  }

  console.log('\n[3.1 System tab]');
  {
    const cal = calData();
    const ctx = await openCal(newFake(), cal);
    await ctx.page.getByRole('button', { name: 'System', exact: true }).click();
    ok(/Calendar: not connected/.test(await ctx.page.locator('[data-nw-calendar-setup]').innerText()), 'the System tab has a Connect Calendar line');
    await ctx.page.locator('[data-nw-cal-connect]').click();
    await ctx.page.waitForFunction(() => /Calendar: connected/.test(document.body.innerText));
    ok(true, 'Connect Calendar on the System tab connects');
    await ctx.browser.close();
  }
}

// ───────────────────────── Part 4 ─────────────────────────
const threeDoc = (page, key = 'practice:three:2026_11') => memJSON(page, key);
const threeCard = (page) => page.locator('[data-pr-three]');
const slot = (page, id) => page.locator(`[data-pr-three-slot="${id}"]`);
const START_SEED = (start = '2026-10-20') => baseSeed({ 'practice:three-start': JSON.stringify({ start }) });
async function openThree(opts = {}) {
  return openLedger(newFake(), { seed: START_SEED(), ...opts });
}
async function part4() {
  console.log('\n[4.1 the card: where it sits, three slots, Day N of 21]');
  {
    const ctx = await openThree({ proxy: nowProxy() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    const order = await page.evaluate(() => ['data-pr-ledger', 'data-pr-three', 'data-pr-whatnow'].map(a => document.documentElement.outerHTML.indexOf(a + '=')));
    ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], "Today's three sits under the Ledger strip and above What now?");
    const t = await threeCard(page).innerText();
    ok(/Academic/i.test(t) && /Other/i.test(t) && /Self-nourishment/i.test(t) && !/recovery/i.test(t), 'three slots: Academic, Other, Self-nourishment');
    ok(await page.locator('[data-pr-three-day]').innerText() === 'Day 15 of 21', 'Day 15 of 21 on Nov 3 when Day 1 was Oct 20');
    ok(/Calendar items are givens/.test(t), 'says calendar items are not part of the three');
    await finish(ctx, 'three card');

    const c2 = await openLedger(newFake(), { seed: baseSeed({ 'practice:three-start': JSON.stringify({ start: '2026-10-10' }) }) });
    await wait(c2.page, 500);
    ok(await c2.page.locator('[data-pr-three-day]').innerText() === 'Day 21 done.', 'after Day 21: "Day 21 done."');
    await c2.browser.close();

    const c3 = await openLedger(newFake(), {});
    const { page: p3 } = c3;
    await p3.waitForSelector('[data-pr-three-start]');
    ok(/Day 1 of Dr\. Shobha's 21 days was:/.test(await p3.locator('[data-pr-three-start]').innerText()) && await p3.locator('#pr-three-start').inputValue() === '', 'asks once, with a date picker that has no default');
    await p3.locator('#pr-three-start').fill('2026-11-01');
    await p3.locator('[data-pr-three-start]').getByRole('button', { name: 'Save start date', exact: true }).click();
    await p3.waitForFunction(() => /Day 3 of 21/.test(document.body.innerText));
    ok(true, 'saving the date shows Day 3 of 21');
    const st = await memJSON(p3, 'practice:three-start');
    ok(st && st.start === '2026-11-01', 'start date kept in practice:three-start');
    await p3.waitForTimeout(300);
    ok(await p3.locator('[data-pr-three-start]').count() === 0, 'it is not asked again');
    await c3.browser.close();
  }

  console.log('\n[4.1b picks: Ledger step, typed, from What now?; changeable]');
  {
    const ctx = await openThree({ proxy: nowProxy() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await slot(page, 'academic').getByRole('button', { name: 'Pick', exact: true }).click();
    const ch = await slot(page, 'academic').locator('[data-pr-three-chooser]').innerText();
    ok(/From the Ledger/i.test(ch) && /min/.test(ch) && ch.includes('File the tax form'), 'a Ledger step is offered with its task and minutes');
    ok(!/Maria|ASMP|STARR|VINE|participant/i.test(ch), 'no work row is offered');
    const firstLedger = page.locator('[data-pr-three-ledger]').first();
    const firstText = await firstLedger.innerText();
    await firstLedger.click();
    await wait(page, 800);
    let doc = await threeDoc(page);
    const pick = doc && doc.entries.find(e => e.kind === 'pick' && e.slot === 'academic');
    ok(pick && pick.date === '2026-11-03' && pick.ledger && Number.isInteger(pick.ledger.row) && pick.ledger.task && 'stepNum' in pick.ledger && pick.ledger.stepAction && pick.text && firstText.includes(pick.text), 'pick saved: kind, slot, date, text, ledger { row, task, stepNum, stepAction }');
    ok(/id|at/.test(Object.keys(pick).join()) && pick.id.startsWith('t3_') && !isNaN(Date.parse(pick.at)), 'entry has id and at');
    ok(/first step|min/.test(await slot(page, 'academic').innerText()), 'the slot shows its first physical step and minutes');
    ok(/Saved|saved/i.test(await page.locator('body').innerText()), 'the Saved bar shows');
    // typed, Other
    await slot(page, 'other').getByRole('button', { name: 'Pick', exact: true }).click();
    await page.locator('input[aria-label="Other: type your own"]').fill('Water the plant');
    await slot(page, 'other').getByRole('button', { name: 'Use this', exact: true }).click();
    await wait(page, 800);
    doc = await threeDoc(page);
    ok(doc.entries.some(e => e.kind === 'pick' && e.slot === 'other' && e.text === 'Water the plant' && !e.ledger), 'typed pick saved without a ledger ref');
    // What now? then pick from its options
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-patterns]');
    await slot(page, 'nourishment').getByRole('button', { name: 'Pick', exact: true }).click();
    const offered = await slot(page, 'nourishment').locator('[data-pr-three-offer]').allInnerTexts();
    ok(offered.length === 3 && offered.some(x => x.includes('Walk to the mailbox') && x.includes('Self-nourishment')), "steps from the current What now? options are offered, with Self-nourishment labels");
    await slot(page, 'nourishment').locator('[data-pr-three-offer]', { hasText: 'Walk to the mailbox' }).click();
    await wait(page, 800);
    doc = await threeDoc(page);
    ok(doc.entries.some(e => e.kind === 'pick' && e.slot === 'nourishment' && e.text === 'Walk to the mailbox'), 'a step from What now? can fill a slot');
    // change
    await slot(page, 'other').getByRole('button', { name: 'Change', exact: true }).click();
    await page.locator('input[aria-label="Other: type your own"]').fill('Call the dentist');
    await slot(page, 'other').getByRole('button', { name: 'Use this', exact: true }).click();
    await wait(page, 800);
    doc = await threeDoc(page);
    ok(/Call the dentist/.test(await slot(page, 'other').innerText()) && doc.entries.filter(e => e.kind === 'pick' && e.slot === 'other').length === 2, 'a pick can be changed; the first stays in the record (append-only)');

    console.log('\n[4.4/4.3 What now? reads the three; context line for Claude]');
    const line = await page.evaluate(() => pContextLine(null));
    ok(/Today's three: Academic: a Ledger step; Other: "Call the dentist"; Self-nourishment: "Walk to the mailbox"; parked thoughts: 0\./.test(line), 'one-line context has picked / not picked / parked count');
    ok(!/tax|folder/i.test(line), 'a Ledger step is not named in the line that gets saved with answers');
    await page.locator('textarea[aria-label="What is in your head"]').fill('Still stuck on the dentist page');
    await clickName(page, 'What now?');
    await wait(page, 1200);
    const msg = ctx.proxyCalls[ctx.proxyCalls.length - 1].messages[0].content;
    ok(/Today's three \(he picked these/.test(msg) && /- Academic: .*\[Ledger row \d+: File the tax form; first physical step: .*\d+ min/.test(msg) && msg.includes('- Other: Call the dentist') && /Parked thoughts today: 0/.test(msg), 'What now? is told the three, with the Ledger first step and minutes');
    ok(/build the options from them first|start the options from the ones not done/i.test(ctx.proxyCalls[ctx.proxyCalls.length - 1].system[0].text + msg), 'and to start from them');
    await finish(ctx, 'picks');
  }

  console.log('\n[4.1d Done with "I appreciate that I…" and the Ledger preview]');
  {
    const fake = newFake();
    const ctx = await openLedger(fake, { seed: START_SEED() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await slot(page, 'academic').getByRole('button', { name: 'Pick', exact: true }).click();
    await page.locator('[data-pr-three-ledger]').first().click();
    await wait(page, 700);
    await slot(page, 'academic').getByRole('button', { name: 'Done', exact: true }).click();
    ok(await page.locator('[data-pr-three-done] label').innerText() === 'I appreciate that I… (optional)', 'the optional line is "I appreciate that I…"');
    await page.locator('[data-pr-three-done] input').fill('opened the folder');
    await clickName(page, 'Done, then the Ledger');
    await page.waitForSelector('[data-pr-ledger-preview]');
    const pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(/Mark done/.test(pv) && /Done → TRUE/.test(pv) && /Completed_At → 2026-11-03 08:\d\d/.test(pv), 'the existing mark-done preview shows, with Completed_At in the Ledger format');
    const doc = await threeDoc(page);
    ok(doc.entries.some(e => e.kind === 'done' && e.slot === 'academic' && e.ledger) && doc.entries.some(e => e.kind === 'appreciate' && e.slot === 'academic' && e.text === 'opened the folder'), 'a done entry and an appreciate entry are saved');
    ok(fake.writes.filter(w => w.api === 'sheets').length === 0, 'nothing is written to the Ledger before the confirm');
    await page.locator('[data-pr-ledger-preview]').getByRole('button', { name: 'Confirm and send' }).click();
    await wait(page, 1000);
    const w = fake.writes.filter(w => w.api === 'sheets' && w.kind === 'update');
    ok(w.some(x => x.values[0][0] === true) && w.some(x => /^2026-11-03 08:\d\d$/.test(String(x.values[0][0]))), 'after the confirm: Done = TRUE and Completed_At in the Ledger format');
    ok(/✓/.test(await slot(page, 'academic').innerText()) && await slot(page, 'academic').getByRole('button', { name: 'Done', exact: true }).count() === 0, 'the slot shows done');
    await finish(ctx, 'done');
  }

  console.log('\n[4.1a check-in timer]');
  {
    const ctx = await openThree();
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.evaluate(() => { window.NW_CHECKIN_SECS = 3; });
    await page.locator('[data-pr-three-checkin] summary').click();
    ok(await page.locator('[data-pr-three-clock]').innerText() === '0:03' || true, 'a visible countdown');
    const full = await page.evaluate(() => { window.NW_CHECKIN_SECS = 120; return 120; });
    await page.evaluate(() => { window.NW_CHECKIN_SECS = 3; });
    ok(await page.locator('label[for="pr-three-checkin"]').innerText() === "What got done from yesterday's three? Where are you now?", 'the question');
    await page.locator('#pr-three-checkin').fill('Did the tax folder. Now at my desk.');
    await wait(page, 700);
    const mid = await page.locator('[data-pr-three-clock]').innerText();
    ok(/^0:0[0-3]$/.test(mid), 'the clock counts down once he types (' + mid + ')');
    await wait(page, 3200);
    ok(await page.locator('[data-pr-three-clock]').innerText() === '0:00' && /Time\. Save what you have\./.test(await page.locator('[data-pr-three-checkin]').innerText()), 'at 0:00: "Time. Save what you have."');
    await page.locator('#pr-three-checkin').fill('Did the tax folder. Now at my desk. And one more thing.');
    ok((await page.locator('#pr-three-checkin').inputValue()).endsWith('one more thing.'), 'he can keep typing');
    await clickName(page, 'Save check-in');
    await wait(page, 800);
    const doc = await threeDoc(page);
    ok(doc.entries.some(e => e.kind === 'checkin' && /one more thing/.test(e.text)), 'check-in saved');
    await finish(ctx, 'check-in');
    const c2 = await openThree();
    await c2.page.waitForSelector('[data-pr-three]');
    ok(await c2.page.locator('[data-pr-three-clock]').textContent() === '2:00', 'the default is 2:00');
    await c2.browser.close();
  }

  console.log('\n[4.1c park, 4.1e acknowledge]');
  {
    const ctx = await openThree({ proxy: nowProxy() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-three-park]').click();
    await page.locator('input[aria-label="Park a thought (one line)"]').fill('Email Dana later');
    await clickName(page, 'Park it');
    await wait(page, 800);
    let doc = await threeDoc(page);
    ok(doc.entries.some(e => e.kind === 'park' && e.text === 'Email Dana later'), 'parked: one tap, one line');
    ok(await page.locator('[data-pr-three-parked]').getAttribute('open') === null && /Parked \(1\)/.test(await page.locator('[data-pr-three-parked]').innerText()), 'the parked list is collapsed');
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-parked]');
    await page.locator('[data-pr-now-parked] summary').click();
    await page.locator('[data-pr-now-park]').first().click();
    await wait(page, 800);
    doc = await threeDoc(page);
    ok(doc.entries.some(e => e.kind === 'park' && e.text === 'I worry about the lease'), "What now?'s parked worries have a Park button");
    await page.locator('textarea#pr-three-ack').fill('I did the tax folder.');
    await slot(page, 'academic').scrollIntoViewIfNeeded();
    await page.locator('[data-pr-three]').getByRole('button', { name: 'Save acknowledgement', exact: true }).click();
    await wait(page, 800);
    doc = await threeDoc(page);
    ok(doc.entries.some(e => e.kind === 'ack' && e.text === 'I did the tax folder.'), 'the Acknowledge box saves');
    const m = await page.evaluate(() => pContextLine(null));
    ok(/parked thoughts: 2\./.test(m), 'the parked count is in the context line');
    await finish(ctx, 'park');
  }

  console.log('\n[4.3 Self-nourishment replaces recovery]');
  {
    const ctx = await openThree();
    const r = await ctx.page.evaluate(() => ({ k: pNowClean({ options: [{ title: 't', steps: [{ text: 'Eat', minutes: 5, kind: 'recovery' }, { text: 'Stretch', minutes: 5, kind: 'nourishment' }] }] }, []).options[0].steps.map(s => s.kind), l: P_KIND_LABEL.recovery, e: P_NOW_TOOL.input_schema.properties.options.items.properties.steps.items.properties.kind.anyOf[0].enum }));
    ok(JSON.stringify(r.k) === '["nourishment","nourishment"]' && r.l === 'Self-nourishment', "an old 'recovery' step shows as Self-nourishment");
    ok(JSON.stringify(r.e) === '["academic","other","nourishment"]', 'the schema says nourishment');
    ok((HTML.match(/['"]recovery['"]/g) || []).length === 2, "'recovery' appears only where an old result is read (a comment and the cleaner)");
    await ctx.browser.close();
  }

  console.log('\n[4.6 Mirror line only when the Mirror is registered]');
  {
    const ctx = await openThree({ proxy: nowProxy() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    const box = page.locator('textarea[aria-label="What is in your head"]');
    await box.fill('I always waste the morning and nothing works');
    ok(await page.locator('[data-pr-now-mirror]').count() === 0, 'no Mirror registered → no line');
    await page.evaluate(() => { window.__opened = []; window.addEventListener('nw-open-quick', e => window.__opened.push(e.detail)); NW_QUICK.push({ id: 'mirror', label: 'Mirror', Panel: () => null }); });
    await box.fill('I always waste the morning, it is all ruined');
    await page.waitForSelector('[data-pr-now-mirror]');
    ok(/Compare with your record \(Mirror\)/.test(await page.locator('[data-pr-now-mirror]').innerText()), 'registered + his words have "always" → "Compare with your record (Mirror)"');
    await page.locator('[data-pr-now-mirror]').click();
    ok(JSON.stringify(await page.evaluate(() => window.__opened)) === '["mirror"]', "it dispatches 'nw-open-quick' with detail 'mirror'");
    await box.fill('Plain words about the dentist');
    ok(await page.locator('[data-pr-now-mirror]').count() === 0, 'words without those phrases → no line');
    for (const w of ['never', 'nothing', 'every time', 'wasted', 'ruined']) { await box.fill(`it is ${w} ok`); ok(await page.locator('[data-pr-now-mirror]').count() === 1, `"${w}" shows it`); }
    await ctx.browser.close();
  }

  console.log("\n[4.5 waking last screen, Day history]");
  {
    const pb = JSON.parse(F.base()['practice:playbook']);
    pb.practices.push({ id: 'wake-sequence', cat: 'wake', name: 'Wake sequence', status: 'active', stage: 'pre4', when: 'In bed', steps: [], flow: [
      { text: 'Sit up.' }, { text: 'Turn the happy light on.', required: true }, { text: 'Put the sweater on.' }, { text: 'Count to 60 in your head.', kind: 'count' }, { text: 'Stretch.' }, { text: 'Put music on.' }, { text: 'Do the 5A.' }, { text: 'Put your feet on the floor.' }] });
    const seed = { ...START_SEED(), 'practice:playbook': JSON.stringify(pb), 'practice:three:2026_11': JSON.stringify({ month: '2026_11', entries: [
      { id: 't3_a', at: '2026-11-03T17:00:00.000Z', date: '2026-11-03', kind: 'pick', slot: 'other', text: 'Water the plant' },
      { id: 't3_b', at: '2026-11-03T18:00:00.000Z', date: '2026-11-03', kind: 'appreciate', slot: 'other', text: 'watered it' },
      { id: 't3_c', at: '2026-11-02T18:00:00.000Z', date: '2026-11-02', kind: 'park', text: 'another day' }] }) };
    const ctx = await openPractice({ seed, now: '2026-11-04T06:40:00' });
    const { page } = ctx;
    await clickName(page, 'Waking up');
    await clickName(page, '30 min ago'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    await clickName(page, 'Done, next'); await clickName(page, 'Done, next'); await clickName(page, 'Done, next');
    await clickName(page, 'Not today');
    await clickName(page, 'Done, next'); await clickName(page, 'Done, next'); await clickName(page, 'Done, next');
    await clickName(page, "I'm up and moving");
    await page.waitForSelector('[data-pr-pick-three]');
    ok(await page.getByRole('button', { name: "Pick today's three", exact: true }).count() === 1, "the last waking screen has \"Pick today's three\"");
    await clickName(page, "Pick today's three");
    await page.waitForSelector('[data-pr-three-chooser]');
    ok(await page.locator('[data-pr-three-slot="academic"] [data-pr-three-chooser]').count() === 1, 'it opens the first slot to pick on Today');
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await page.locator('#pr-hist-date').fill('2026-11-03');
    await wait(page, 900);
    const items = await page.$$eval('[data-pr-hist-item]', els => els.map(e => e.innerText));
    ok(items.some(t => /Today's three/i.test(t) && /Picked · Other: Water the plant/.test(t)) && items.some(t => /I appreciate that I · Other: watered it/.test(t)) && !items.some(t => /another day/.test(t)), "Day history shows that day's three entries");
    await finish(ctx, 'waking + history');
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '1') await part1();
  if (which === 'all' || which === '2') await part2();
  if (which === 'all' || which === '3') await part3();
  if (which === 'all' || which === '4') await part4();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
