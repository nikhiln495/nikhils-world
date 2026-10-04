// Scenario checks for the Practice tab. Run: NODE_PATH=$(npm root -g) node scripts/p1-test.js [step]
// Uses the mocked window.storage from p1-check.js; the live Firestore is never touched.
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const mem = (page, key) => page.evaluate(k => window.__mem.get(k) ?? null, key);
const memJSON = async (page, key) => { const v = await mem(page, key); return v == null ? null : JSON.parse(v); };
const setsSince = (page, i) => page.evaluate(i => window.__storageLog.slice(i).filter(x => x[0] === 'set').map(x => x[1]), i);
const logLen = (page) => page.evaluate(() => window.__storageLog.length);

async function openPractice(opts) {
  const ctx = await openPage(opts);
  await ctx.page.waitForTimeout(3500); // let other panes finish their boot reads/writes
  ctx.mark = await logLen(ctx.page);
  await ctx.page.getByRole('button', { name: 'Practice', exact: true }).click();
  await ctx.page.waitForSelector('.pr-root h1');
  await ctx.page.waitForTimeout(400);
  return ctx;
}
const pr = (page) => page.locator('.pr-root');
const visibleText = async (page) => pr(page).innerText();

async function finish(ctx, label) {
  const sets = await setsSince(ctx.page, ctx.mark);
  ok(sets.every(k => k.startsWith('practice:')), `${label}: every write after opening Practice is a practice: key (${[...new Set(sets)].join(', ') || 'none'})`);
  const reads = await ctx.page.evaluate(i => window.__storageLog.slice(i).map(x => x[1]), ctx.mark);
  ok(reads.every(k => k.startsWith('practice:')), `${label}: every read/write after opening Practice is a practice: key`);
  ok(ctx.errors.length === 0, `${label}: no console errors${ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''}`);
  await ctx.browser.close();
}

async function step2() {
  console.log('\n[Today, morning, no Daily Brief doc]');
  {
    const seed = { ...F.base(), 'practice:log:2026_10_03': JSON.stringify({ date: '2026-10-03', entries: [{ time: '09:00', practiceId: 'sc-break', source: 'app' }] }) };
    const ctx = await openPractice({ seed, now: '2026-10-04T08:00:00' });
    const { page } = ctx;
    let t = await visibleText(page);
    ok(/No plan from the Daily Brief/.test(t), 'missing today doc → says so and shows default stack');
    ok(await page.getByRole('button', { name: 'Waking up', exact: true }).isVisible(), 'before noon, not up → Waking up button at top');
    ok(t.includes('10% intercept') && t.includes('Self-compassion break'), 'default stack has 10% intercept and self-compassion break');
    ok(!t.includes('Bedtime plan'), 'no bedtime plan before 6 PM');
    ok(t.includes('First sign of bracing'), '10% intercept shows its "now" trigger instead of "when"');
    ok(t.includes('Self-forgiveness sentence each morning') && t.includes('2026-10-09'), 'homework strip with due dates');
    await page.getByRole('button', { name: 'Level 2', exact: true }).click();
    await page.waitForTimeout(300);
    let lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg && lg.date === '2026-10-04' && lg.entries.length === 1 && lg.entries[0].practiceId === 'waking-ladder' && lg.entries[0].level === 2 && lg.entries[0].time === '08:00' && lg.entries[0].source === 'app', 'Level 2 → practice:log:2026_10_04 entry {waking-ladder, level 2, time 08:00}');
    ok(await page.getByRole('button', { name: 'Waking up', exact: true }).isVisible(), 'level 2 does not hide Waking up');
    await page.fill('#pr-upat', '08:20');
    await page.locator('#pr-upat').locator('xpath=following-sibling::button').click();
    await page.waitForTimeout(300);
    lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg.entries.length === 2 && lg.entries[1].level === 4 && lg.entries[1].time === '08:20', '"Up at" 08:20 → waking-ladder level 4 at 08:20 (appended, first entry kept)');
    ok(!(await page.getByRole('button', { name: 'Waking up', exact: true }).count()), 'after up-at, Waking up button is gone');
    await page.fill('#pr-forgot', 'Water bottle on the desk');
    await page.locator('#pr-forgot').press('Enter');
    await page.waitForTimeout(300);
    lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg.entries.length === 3 && lg.entries[2].practiceId === 'forgot-log' && lg.entries[2].note === 'Water bottle on the desk', 'Forgot box → forgot-log entry with note');
    await page.getByRole('button', { name: 'Log', exact: true }).nth(1).click(); // Log on 10% intercept card
    await page.waitForTimeout(300);
    lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg.entries[3]?.practiceId === 'ten-percent-intercept', 'Log on a card → rep entry for that practice');
    const prev = await memJSON(page, 'practice:log:2026_10_03');
    ok(prev.entries.length === 1 && prev.entries[0].practiceId === 'sc-break', "yesterday's log doc untouched");
    await page.getByRole('button', { name: 'Add update' }).first().click();
    await page.getByLabel('Update for Self-forgiveness sentence each morning').fill('Said it in bed today');
    await page.getByRole('button', { name: 'Save update' }).click();
    await page.waitForTimeout(300);
    const hw = await memJSON(page, 'practice:homework');
    ok(hw.items[0].updates?.length === 1 && hw.items[0].updates[0].text === 'Said it in bed today' && hw.items[1].updates.length === 1 && hw.items.length === 2 && hw.owedByDrShobha.length === 2, 'Add update appends to that item only; nothing removed');
    await page.getByRole('button', { name: 'Start' }).first().click();
    t = await visibleText(page);
    ok(t.includes('Notice where you brace'), 'Start opens the practice (step-3 placeholder lists the steps)');
    await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/today-morning.png' : '/dev/null' }).catch(() => {});
    await finish(ctx, 'today-morning');
  }

  console.log('\n[Today, evening, no Daily Brief doc]');
  {
    const ctx = await openPractice({ seed: F.base(), now: '2026-10-04T19:00:00' });
    const t = await visibleText(ctx.page);
    ok(t.includes('Bedtime plan'), 'after 6 PM the default stack adds bedtime plan');
    ok(!(await ctx.page.getByRole('button', { name: 'Waking up', exact: true }).count()), 'no Waking up button after noon');
    await finish(ctx, 'today-evening');
  }

  console.log('\n[Today, Daily Brief doc present]');
  {
    const seed = { ...F.base(), 'practice:today:2026_10_04': JSON.stringify(F.todayDoc('2026-10-04')) };
    const ctx = await openPractice({ seed, now: '2026-10-04T10:00:00' });
    const t = await visibleText(ctx.page);
    ok(t.includes('You were harsh on yourself yesterday') && t.includes('Put a hand on your chest') && t.includes('After breakfast'), 'today card shows name, why, when, first step');
    ok(t.includes('For the drop after class'), 'second today card shown');
    ok(!t.includes('should be hidden'), 'not-working practice from the today doc is hidden');
    ok(t.includes('Lights out: 23:30'), 'sleep targets shown');
    ok(!/No plan from the Daily Brief/.test(t), 'no default-stack note when the doc exists');
    if (process.env.SHOT_DIR) await ctx.page.screenshot({ path: process.env.SHOT_DIR + '/today-brief.png', fullPage: true });
    await finish(ctx, 'today-brief');
  }

  console.log('\n[Local date east of UTC]');
  {
    const ctx = await openPractice({ seed: F.base(), now: '2026-10-04T00:30:00', timezoneId: 'Asia/Kolkata' });
    await ctx.page.getByRole('button', { name: 'Level 1', exact: true }).click();
    await ctx.page.waitForTimeout(300);
    const lg = await memJSON(ctx.page, 'practice:log:2026_10_04');
    const wrong = await mem(ctx.page, 'practice:log:2026_10_03');
    ok(lg && lg.date === '2026-10-04' && !wrong, '00:30 IST (Oct 3 in UTC) logs to practice:log:2026_10_04');
    await finish(ctx, 'local-date');
  }

  console.log('\n[Library]');
  {
    const ctx = await openPractice({ seed: F.base(), now: '2026-10-04T15:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Library' }).click();
    await page.waitForTimeout(200);
    let t = await visibleText(page);
    ok(t.includes('WAKING UP') && t.includes('SELF-COMPASSION') && t.includes('LEAVING THE HOUSE'), 'grouped by categories');
    ok(t.includes('Elbow prop') && t.includes('not-working'), 'not-working practice stays visible in the library');
    ok((t.match(/after level 4/g) || []).length === 5, 'post4 practices carry the "after level 4" tag (5 in fixtures)');
    await page.getByLabel('Search practices').fill('count');
    t = await visibleText(page);
    ok(t.includes('Countdown 5-4-3-2-1') && t.includes('Passage of time count') && !t.includes('Bedtime plan'), 'search filters');
    await page.getByLabel('Search practices').fill('');
    await page.getByRole('button', { name: 'Not past level 4' }).click();
    t = await visibleText(page);
    ok(t.includes('Waking ladder') && t.includes('Countdown') && !t.includes('Task-drop reset') && !t.includes('Passage of time count'), 'filter "not past level 4" = pre4 + any');
    await page.getByRole('button', { name: 'At level 4' }).click();
    t = await visibleText(page);
    ok(t.includes('Passage of time count') && !t.includes('Waking ladder') && !t.includes('Task-drop reset'), 'filter "at level 4" = stage4 + any');
    await page.getByRole('button', { name: 'Up', exact: true }).click();
    t = await visibleText(page);
    ok(t.includes('Task-drop reset') && !t.includes('Waking ladder'), 'filter "up" = post4 + any');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: /^10% intercept/ }).click();
    t = await visibleText(page);
    ok(t.includes('When you feel the first 10%') && t.includes('First sign of bracing') && t.includes('Notice where you brace') && t.includes('fixture') && t.includes('seeded'), 'detail shows when, now, steps, source, history');
    await page.getByRole('button', { name: 'Change status' }).click();
    await page.selectOption('#pr-status', 'paused');
    ok(await page.getByRole('button', { name: 'Save status' }).isDisabled(), 'Save status disabled without a reason');
    await page.fill('#pr-reason', '   ');
    ok(await page.getByRole('button', { name: 'Save status' }).isDisabled(), 'whitespace-only reason is not a reason');
    await page.fill('#pr-reason', 'Doing it in session instead');
    await page.getByRole('button', { name: 'Save status' }).click();
    await page.waitForTimeout(300);
    const pb = await memJSON(page, 'practice:playbook');
    const p = pb.practices.find(x => x.id === 'ten-percent-intercept');
    const h = p.history[p.history.length - 1];
    ok(p.status === 'paused' && p.history.length === 2 && h.reason === 'Doing it in session instead' && h.by === 'Nikhil (app)' && h.date === '2026-10-04' && /homework → paused/.test(h.change), 'status change appends {date, change, reason, by:"Nikhil (app)"}');
    ok(pb.practices.length === F.playbook.practices.length && pb.version === F.playbook.version && pb.course && pb.categories.length === F.playbook.categories.length, 'rest of the playbook unchanged (nothing deleted)');
    await page.getByRole('button', { name: 'Log rep' }).click();
    await page.waitForTimeout(300);
    const lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg.entries[0].practiceId === 'ten-percent-intercept' && lg.entries[0].time === '15:00', 'Log rep from detail');
    const deleteButtons = await page.getByRole('button', { name: /delete|remove/i }).count();
    ok(deleteButtons === 0, 'no delete/remove buttons in the Practice tab');
    if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/library-detail.png', fullPage: true });
    await finish(ctx, 'library');
  }

  console.log('\n[Missing / unreadable playbook]');
  {
    const seed = { ...F.base(), 'practice:playbook': '{not json' };
    const ctx = await openPractice({ seed, now: '2026-10-04T15:00:00' });
    await ctx.page.getByRole('tab', { name: 'Library' }).click();
    const t = await visibleText(ctx.page);
    ok(t.includes('unreadable'), 'unreadable playbook is reported, not crashed');
    ok((await mem(ctx.page, 'practice:playbook')) === '{not json', 'unreadable playbook not overwritten');
    await finish(ctx, 'bad-playbook');
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '2') await step2();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
