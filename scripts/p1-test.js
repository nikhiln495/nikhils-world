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

// allowProxyFailure: the scenario deliberately made the AI proxy fail (500 / unreachable),
// so the browser's own network log line for that request is expected.
async function finish(ctx, label, { allowProxyFailure = false } = {}) {
  if (allowProxyFailure) ctx.errors = ctx.errors.filter(e => !/Failed to load resource.*cloudfunctions\.net\/anthropic/.test(e));
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
    ok(t.includes('Before') && t.includes('how much brace'), 'Start opens the guided flow for that practice');
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


const toolUse = (picks) => ({ status: 200, json: { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'choose_practices', input: { picks } }] } });
const clickName = (page, name, exact = true) => page.getByRole('button', { name, exact }).first().click();
async function stepsThrough(page) { // collect step texts in the waking flow until the end screen
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const t = await visibleText(page);
    if (t.includes('That was the last step')) break;
    const m = t.match(/Step \d+ of \d+\n+([^\n]+)/);
    seen.push(m ? m[1] : '?');
    await clickName(page, 'Done, next');
  }
  return seen;
}

async function step3() {
  console.log('\n[Guided flow]');
  {
    const ctx = await openPractice({ seed: F.base(), now: '2026-10-04T15:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Library' }).click();
    await page.getByRole('button', { name: /^10% intercept/ }).click();
    await clickName(page, 'Start');
    let t = await visibleText(page);
    ok(t.includes('how much brace') && t.includes('Before'), 'ten-percent-intercept rating label is "brace"');
    await page.getByRole('radio', { name: '6' }).click();
    await clickName(page, 'Begin');
    t = await visibleText(page);
    ok(t.includes('Step 1 of 3') && t.includes('Notice where you brace'), 'one step per screen');
    await clickName(page, 'Next'); await clickName(page, 'Back');
    ok((await visibleText(page)).includes('Step 1 of 3'), 'Back goes to the previous step');
    await clickName(page, 'Next'); await clickName(page, 'Next'); await clickName(page, 'Next');
    t = await visibleText(page);
    ok(t.includes('After') && t.includes('how much brace'), 'after rating screen');
    await page.getByRole('radio', { name: '3' }).click();
    await clickName(page, 'Save rep');
    await page.waitForTimeout(300);
    let lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg && lg.entries[0].practiceId === 'ten-percent-intercept' && lg.entries[0].before === 6 && lg.entries[0].after === 3 && lg.entries[0].source === 'app', 'Save → log entry with before/after and source "app"');

    const openFlow = async (name) => {
      await page.getByRole('tab', { name: 'Library' }).click();
      await page.getByLabel('Search practices').fill(name);
      await page.getByRole('button', { name: new RegExp('^' + name) }).first().click();
      await clickName(page, 'Start');
    };
    const label = async (name) => { await openFlow(name); const t = await visibleText(page); await clickName(page, '✕ Close'); return (t.match(/how much (.+?)\?/) || [])[1]; };
    ok(await label('Cats sit') === 'on edge', 'cats sit → "on edge"');
    ok(await label('Look, name, return') === 'on edge', 'body category → "on edge"');
    ok(await label('Fall practice') === 'fear', 'fall-practice → "fear"');
    ok(await label('Learn self-compassion') === 'self-criticism', 'learn → "self-criticism"');

    await openFlow('Thought stop'); await clickName(page, 'Begin'); await clickName(page, 'Next');
    t = await visibleText(page);
    ok(t.includes('1:00') && t.includes('Start timer'), 'thought-stop: 60 s timer on the step that names it');
    await clickName(page, 'Start timer'); await page.waitForTimeout(2300);
    t = await visibleText(page);
    ok(/0:5[78]/.test(t), 'timer counts down');
    await clickName(page, '✕ Close');
    await openFlow('Power nap'); await clickName(page, 'Begin');
    ok((await visibleText(page)).includes('15:00'), 'power-nap: 15 min timer');
    await clickName(page, '✕ Close');
    await openFlow('Soothing breath'); await clickName(page, 'Begin');
    ok((await visibleText(page)).includes('3:00'), 'soothing-breath: 3 min timer');
    await clickName(page, '✕ Close');

    await openFlow('Passage of time'); await clickName(page, 'Begin');
    await clickName(page, 'Start counting to 60');
    t = await visibleText(page);
    ok(t.includes('The clock is hidden') && !/\d+:\d\d/.test(t.split('Step 1 of')[1] || ''), 'passage-of-time: clock hidden while counting');
    await page.waitForTimeout(2200);
    await clickName(page, 'Done');
    t = await visibleText(page);
    ok(/Real time: 2 seconds/.test(t), 'Done shows the real elapsed seconds');
    await clickName(page, '✕ Close');

    await openFlow('Grief release'); await clickName(page, 'Begin');
    for (let i = 0; i < 11; i++) await page.getByRole('button', { name: /Tap count/ }).click();
    ok((await visibleText(page)).includes('11 ✓'), 'grief-release: tap counter reaches 11');
    await clickName(page, 'Next');
    ok(!(await page.getByRole('button', { name: /Tap count/ }).count()), 'no counter on a step without 11');
    await clickName(page, '✕ Close');
    await finish(ctx, 'guided-flow');
  }

  console.log('\n[Waking up]');
  {
    const seed = { ...F.base(), 'practice:today:2026_10_04': JSON.stringify(F.todayDoc('2026-10-04')) };
    const ctx = await openPractice({ seed, now: '2026-10-04T07:10:00', proxy: async () => toolUse([
      { id: 'countdown', why: 'Count out loud and sit up on 1.' }, { id: 'task-drop-reset', why: 'post4' }, { id: 'elbow-prop', why: 'not working' }, { id: 'bedtime-plan', why: 'stage missing? no, any' }, { id: 'grief-release', why: 'no' } ]) });
    const { page } = ctx;
    await clickName(page, 'Waking up');
    let t = await visibleText(page);
    ok(t.includes('Where are you?') && t.includes('Eyes closed') && t.includes('Standing'), 'Q1 with four big options');
    ok(await page.getByRole('button', { name: 'Stuck', exact: true }).isVisible(), 'Stuck button visible on Waking up');
    await clickName(page, 'Eyes open, lying down');
    t = await visibleText(page);
    ok(t.includes("What's in the way?") && t.includes('Dizzy or lightheaded') && t.includes('Something else'), 'Q2 options');
    await clickName(page, 'Cold'); await clickName(page, 'Phone or video in hand');
    await clickName(page, 'Next');
    const seen = await stepsThrough(page);
    ok(JSON.stringify(seen) === JSON.stringify(['Pull the sweater or blanket around you first.', 'Put the phone face down out of reach.', 'Count to 60 in your head. The clock stays hidden.', 'Count down out loud: 5, 4, 3, 2, 1. Move on 1.', 'Sit up and put your feet on the floor.']), 'cold + phone + lying: fixed order of steps → ' + JSON.stringify(seen));
    await clickName(page, 'Not yet, start over');
    await clickName(page, 'Eyes closed'); await clickName(page, 'Dizzy or lightheaded'); await clickName(page, 'Dread about the day'); await clickName(page, 'Next');
    const seen2 = await stepsThrough(page);
    ok(seen2[0].startsWith('One-word container') && seen2[1] === 'Name only the first step of the day.' && seen2[seen2.length - 1].startsWith('Stay sitting, 5 slow breaths') && seen2[seen2.length - 2] === 'Sit up and put your feet on the floor.', 'dread → one-word then first step; dizzy after sitting up → ' + JSON.stringify(seen2));
    ok(!seen.concat(seen2).some(x => /\b(food|eat|snack|breakfast)\b/i.test(x)), 'no food suggested');
    await clickName(page, 'Not yet, start over');
    await clickName(page, 'Propped up or sitting'); await clickName(page, 'Next');
    const seen3 = await stepsThrough(page);
    ok(JSON.stringify(seen3) === JSON.stringify(['Count to 60 in your head. The clock stays hidden.', 'Sit up and put your feet on the floor.']), 'propped → count, then feet on the floor');
    await clickName(page, 'Not yet, start over');
    await clickName(page, 'Standing'); await clickName(page, 'Next');
    t = await visibleText(page);
    ok(t.includes("First thing on today's plan: Self-compassion break"), "standing → first item of today's plan");
    await clickName(page, '✕ Close');
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    const alts = [];
    for (let i = 0; i < 14; i++) {
      await clickName(page, "Didn't work, try another");
      const m = (await visibleText(page)).match(/Step \d+ of \d+\n+([^\n]+)/);
      if (m) alts.push(m[1]);
    }
    ok(alts.some(a => a === 'Stay propped on your elbows for 30 seconds') && !alts.includes('Then sit up'), "not-working practice lends one single step, never the whole practice");
    ok(!alts.some(a => /Tap the side|Stand still and feel|Kneel on a mat/.test(a)), 'no grief tapping, physio or post4 steps in alternates');
    // Coach me
    await clickName(page, 'Coach me');
    await page.waitForTimeout(500);
    t = await visibleText(page);
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(call && call.model === 'claude-sonnet-5-5' && call.max_tokens === 16000 && call.output_config.effort === 'low' && call.tools[0].name === 'choose_practices' && call.tool_choice.type === 'auto', 'Coach me uses the Stuck layer-b call shape');
    ok(Object.keys(call).sort().join(',') === 'max_tokens,messages,model,output_config,system,tool_choice,tools', 'request has only the spec fields');
    ok(/Where: Eyes closed/.test(call.messages[0].content) && /Context: local time/.test(call.messages[0].content), 'TEXT = answers + local time');
    ok(!/task-drop-reset|grief-release|fall-practice|elbow-prop/.test(call.system) && /countdown \| Countdown 5-4-3-2-1 \| stage:any/.test(call.system), 'index restricted to pre4/stage4/any, no not-working');
    ok(t.includes('Count out loud and sit up on 1.') && !t.includes('post4') && !t.includes('not working'), 'picks filtered in code (post4, not-working, grief dropped)');
    await clickName(page, "I'm up");
    await page.waitForTimeout(300);
    const lg = await memJSON(page, 'practice:log:2026_10_04');
    const e = lg.entries[lg.entries.length - 1];
    ok(e.practiceId === 'waking-ladder' && e.level === 4 && e.source === 'app-waking' && e.time === '07:1' + e.time.slice(-1) && /Where: Eyes closed/.test(e.note), "I'm up → waking-ladder level 4, source app-waking, note = answers");
    t = await visibleText(page);
    ok(/first thing on today's plan/i.test(t) && t.includes('Self-compassion break') && t.includes('Put a hand on your chest'), "after I'm up: first item of today's plan");
    await clickName(page, 'Back to Today');
    ok(!(await page.getByRole('button', { name: 'Waking up', exact: true }).count()), 'Waking up button gone after I\'m up');
    await finish(ctx, 'waking');
  }

  console.log('\n[Waking up: timer on a step naming a duration]');
  {
    const pb = JSON.parse(F.base()['practice:playbook']);
    pb.practices = pb.practices.filter(p => !['passage-of-time', 'countdown'].includes(p.id));
    pb.practices.find(p => p.id === 'waking-ladder').steps = ['Stay on your side for 30 seconds'];
    const ctx = await openPractice({ seed: { ...F.base(), 'practice:playbook': JSON.stringify(pb) }, now: '2026-10-04T07:10:00' });
    await clickName(ctx.page, 'Waking up'); await clickName(ctx.page, 'Eyes closed'); await clickName(ctx.page, 'Next');
    let t = await visibleText(ctx.page);
    ok(t.includes('Step 1 of 1') && t.includes('Sit up and put your feet on the floor.'), 'missing passage-of-time / countdown ids are skipped');
    await clickName(ctx.page, "Didn't work, try another");
    t = await visibleText(ctx.page);
    ok(t.includes('Stay on your side for 30 seconds') && t.includes('0:30'), 'step naming 30 seconds gets a timer');
    await finish(ctx, 'waking-timer');
  }

  console.log('\n[Stuck: stuck-map doc]');
  {
    let reply = toolUse([{ id: 'task-drop-reset', why: 'post4 before level 4' }, { id: 'elbow-prop', why: 'nw' }, { id: 'nope', why: 'x' }, { id: 'thought-stop', why: 'Say stop out loud and look at three things in the room.' }, { id: 'sc-break', why: 'Hand on chest, three sentences.' }, { id: 'one-word', why: 'Write one word.' }]);
    const seed = { ...F.base(), 'practice:log:2026_10_04': JSON.stringify({ date: '2026-10-04', entries: [{ time: '08:00', practiceId: 'waking-ladder', level: 2, source: 'app' }, { time: '08:30', practiceId: 'sc-break', before: 7, after: 4, source: 'app' }] }) };
    const ctx = await openPractice({ seed, now: '2026-10-04T09:00:00', proxy: async () => reply });
    const { page } = ctx;
    ok(!(await visibleText(page)).includes('988'), 'crisis footer not on Today');
    await page.getByRole('tab', { name: 'Library' }).click();
    ok(await page.getByRole('button', { name: 'Stuck', exact: true }).isVisible(), 'Stuck button on Library');
    await clickName(page, 'Stuck');
    let t = await visibleText(page);
    ok(t.includes('Where are you right now?') && t.includes('In bed, not past level 4') && t.includes('Up but frozen') && !t.includes('Looping'), 'situations come from practice:stuck-map');
    ok(!t.includes('built-in list'), 'no fallback note when the doc is readable');
    ok(t.includes('call or text 988 (US) or Tele-MANAS 14416 (India), and tell Dr. Shobha'), 'crisis footer on the stuck screen');
    await clickName(page, 'In bed, not past level 4');
    t = await visibleText(page);
    const i1 = t.indexOf('Self-forgiveness for the daily stall'), i2 = t.indexOf('Waking ladder');
    ok(i1 > 0 && i2 > i1 && !t.includes('Elbow prop'), 'stored order kept; missing id and not-working skipped');
    await clickName(page, 'Up but frozen');
    t = await visibleText(page);
    ok(t.includes('Countdown') && !t.includes('Task-drop reset'), 'post4 practice hidden while last waking level < 4');
    await clickName(page, 'In bed, not past level 4');
    await clickName(page, 'Waking up, one step at a time');
    ok((await visibleText(page)).includes('Where are you?'), 'Stuck → in bed → Waking up');
    await clickName(page, '✕ Close');
    await clickName(page, 'In bed, not past level 4'); // collapse, so the only Start buttons are Claude's picks
    await page.getByLabel('Ask Claude', { exact: true }).fill('I keep rereading the chat from last night');
    await clickName(page, 'Pick practices for me');
    await page.waitForTimeout(500);
    t = await visibleText(page);
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(call.model === 'claude-sonnet-5-5' && call.max_tokens === 16000 && call.output_config.effort === 'low' && call.tool_choice.type === 'auto' && call.tools.length === 1 && call.tools[0].name === 'choose_practices' && call.tools[0].description === 'Choose 1 to 3 practices from the library.', 'Ask Claude request matches the spec');
    ok(Object.keys(call).sort().join(',') === 'max_tokens,messages,model,output_config,system,tool_choice,tools', 'request has only the spec fields');
    ok(call.system.includes('Call choose_practices with 1 to 3 ids from the library, each with a one-sentence reason in literal physical terms. Library:') && call.system.includes('ten-percent-intercept | 10% intercept | stage:any | when:First sign of bracing in jaw or shoulders') && call.system.includes('task-drop-reset | Task-drop reset | stage:post4 | when:Up but frozen') && !call.system.includes('elbow-prop') && /vessel/.test(call.system), 'SYSTEM = voice rules + instruction + INDEX (now over when, no not-working)');
    const lines = call.system.split('Library:\n')[1].split('\n');
    ok(lines.every(l => /^[a-z0-9-]+ \| .+ \| stage:(pre4|stage4|post4|any|-) \| when:.{0,110}$/.test(l)), 'every INDEX line has the spec format, when ≤ 110 chars');
    ok(call.messages.length === 1 && call.messages[0].content.startsWith('I keep rereading the chat from last night\nContext: local time') && /last waking level today: 2/.test(call.messages[0].content) && /sc-break \(before 7, after 4\)/.test(call.messages[0].content), 'TEXT = his words + one context line (time, level, today\'s reps with ratings)');
    ok(t.includes('Thought stop') && t.includes('Say stop out loud and look at three things') && t.includes('Self-compassion break') && t.includes('One-word container') && !t.includes('post4 before level 4'), 'picks filtered in code: unknown, not-working, post4 dropped; max 3');
    await page.getByRole('button', { name: 'Start' }).first().click();
    await clickName(page, 'Begin'); await clickName(page, 'Next'); await clickName(page, 'Next'); await clickName(page, 'Next');
    await clickName(page, 'Save rep');
    await page.waitForTimeout(300);
    let lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg.entries.length === 3 && lg.entries[2].practiceId === 'thought-stop' && lg.entries[2].source === 'app-stuck', 'rep from a Claude pick saved with source "app-stuck"');
    ok((await visibleText(page)).includes('Where are you right now?'), 'after saving, back on the stuck screen');
    // failures
    reply = { status: 500, json: { error: 'boom' } };
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    t = await visibleText(page);
    ok(t.includes('The AI proxy answered 500') && t.includes('Pick from the list above instead'), 'status not 200 → shows what failed, points to layer a');
    reply = { status: 200, json: { content: [{ type: 'text', text: 'Try breathing.' }] } };
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    ok((await visibleText(page)).includes('without choosing practices'), 'no tool_use block → shows what failed');
    // Something else → layer b
    reply = toolUse([{ id: 'countdown', why: 'Count down and move on 1.' }]);
    await clickName(page, 'Something else');
    await page.getByLabel('Something else, in your words').fill('Stuck in the shower, can not get out');
    await page.getByRole('button', { name: 'Ask Claude', exact: true }).click(); await page.waitForTimeout(400);
    ok(ctx.proxyCalls[ctx.proxyCalls.length - 1].messages[0].content.startsWith('Stuck in the shower, can not get out\n'), 'Something else sends his words to layer b');
    ok((await visibleText(page)).includes('Count down and move on 1.'), 'Something else → pick cards');
    // layer c
    reply = { status: 200, json: { content: [
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
      { type: 'text', text: '1. Turn the water colder for 10 seconds.\n2. Put one foot on the mat.\n3. Reach for the towel.\n', citations: [{ type: 'web_search_result_location', title: 'Example Health', url: 'https://example.org' }] },
      { type: 'text', text: 'Sources: Example Health' } ] } };
    const pbBefore = await mem(page, 'practice:playbook');
    await clickName(page, 'Look outside the playbook'); await page.waitForTimeout(400);
    const call3 = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(call3.tools.length === 1 && call3.tools[0].type === 'web_search_20250305' && call3.tools[0].name === 'web_search' && call3.tools[0].max_uses === 2 && /3 to 6 numbered literal steps/.test(call3.system) && /vessel/.test(call3.system), 'layer c: web_search tool only, asks for 3–6 numbered steps and sources');
    await clickName(page, 'Save as proposal'); await page.waitForTimeout(300);
    const om = await memJSON(page, 'practice:outside-map');
    const it = om.items[om.items.length - 1];
    ok(om.items.length === 2 && it.theme === 'Stuck in the shower, can not get out' && it.since === '2026-10-04' && Array.isArray(it.owners) && it.owners.length === 0 && it.options.length === 4 && it.options[3] === 'Source: Example Health' && it.options[0].startsWith('1. Turn the water'), 'Save as proposal appends {theme, since, owners:[], options:[steps + sources]} to practice:outside-map');
    ok((await mem(page, 'practice:playbook')) === pbBefore, 'web results never written into the playbook');
    await finish(ctx, 'stuck-doc', { allowProxyFailure: true });
  }

  console.log('\n[Stuck: built-in fallback]');
  {
    const seed = F.base(); delete seed['practice:stuck-map'];
    const ctx = await openPractice({ seed, now: '2026-10-04T09:00:00' });
    const { page } = ctx;
    await clickName(page, 'Stuck');
    let t = await visibleText(page);
    ok(t.includes('Using the built-in list: the stuck map is missing.'), 'missing doc → built-in default, says so in small text');
    const labels = ['In bed, not past level 4', 'At level 4, eyes open', 'Up but frozen, the drop', 'On edge around someone or a sound', 'Looping, overthinking', 'Harsh on myself', 'Comparing myself', 'After a conflict', "Can't get myself to bed", 'About to leave the house', 'Scared of falling or getting hurt'];
    ok(labels.every(l => t.includes(l)) && !t.includes('Grief about lost time'), 'all default situations; grief hidden before level 4');
    ok(t.trim().indexOf('Something else') > t.indexOf('Scared of falling'), '"Something else" is last on the list');
    await clickName(page, 'Up but frozen, the drop');
    t = await visibleText(page);
    ok(t.includes('10% intercept') && t.includes('Countdown 5-4-3-2-1') && !t.includes('Task-drop reset') && !t.includes('Yield, push, reach') && !t.includes('C-see'), 'post4 practices skipped before level 4');
    await clickName(page, '✕ Close');
    await clickName(page, 'Level 4');
    await page.waitForTimeout(300);
    await clickName(page, 'Stuck');
    await clickName(page, 'Up but frozen, the drop');
    t = await visibleText(page);
    ok(t.includes('Task-drop reset') && t.includes('Yield, push, reach') && t.includes('Grief about lost time'), 'after level 4: post4 practices and grief situation appear');
    await page.getByLabel('Ask Claude', { exact: true }).fill('test');
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    ok((await visibleText(page)).includes("Couldn't reach the AI proxy"), 'proxy unreachable → shows what failed');
    await finish(ctx, 'stuck-fallback', { allowProxyFailure: true });
  }

  console.log('\n[Stuck: unreadable map, offline]');
  {
    const seed = { ...F.base(), 'practice:stuck-map': '{oops' };
    const ctx = await openPractice({ seed, now: '2026-10-04T09:00:00', offline: true });
    const { page } = ctx;
    await clickName(page, 'Stuck');
    const t = await visibleText(page);
    ok(t.includes('the stuck map is unreadable') && t.includes('Looping, overthinking'), 'unreadable doc → built-in default, says so');
    await page.getByLabel('Ask Claude', { exact: true }).fill('test');
    ok(await page.getByRole('button', { name: 'Pick practices for me' }).isDisabled() && t.includes('Ask Claude needs the internet'), 'offline → Ask Claude disabled with a note');
    await clickName(page, 'Looping, overthinking');
    await page.getByRole('button', { name: 'Start' }).first().click();
    await clickName(page, 'Begin');
    ok((await visibleText(page)).includes('Step 1 of'), 'practices still work offline');
    ok((await mem(page, 'practice:stuck-map')) === '{oops', 'unreadable stuck map not overwritten');
    ok(ctx.proxyCalls.length === 0, 'no proxy call while offline');
    await finish(ctx, 'stuck-offline');
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '2') await step2();
  if (which === 'all' || which === '3') await step3();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
