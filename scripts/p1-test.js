// Scenario checks for the Practice tab. Run: NODE_PATH=$(npm root -g) node scripts/p1-test.js [step]
// Uses the mocked window.storage from p1-check.js; the live Firestore is never touched.
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');
const P_LEARN_FALLBACK_DAYS = 180;

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


const sysText = (call) => (Array.isArray(call?.system) && call.system[0] ? call.system[0].text : '');
const toolUse = (picks) => ({ status: 200, json: { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'choose_practices', input: { picks } }] } });
const clickName = (page, name, exact = true) => page.getByRole('button', { name, exact }).first().click();
async function stepsThrough(page) { // collect step texts in the waking flow, stopping on the last step
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const t = await visibleText(page);
    const m = t.match(/Step \d+ of \d+\n+([^\n]+)/);
    seen.push(m ? m[1] : '?');
    if (!(await page.getByRole('button', { name: 'Done, next', exact: true }).count())) break; // last step
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
      if (!(await page.getByRole('button', { name: "Didn't work, try another", exact: true }).count())) break;
      await clickName(page, "Didn't work, try another");
      const m = (await visibleText(page)).match(/Step \d+ of \d+\n+([^\n]+)/);
      if (m) alts.push(m[1]);
    }
    // No seven-minute-waking in these fixtures; countdown is already queued, so only two alternates are left.
    ok(JSON.stringify(alts) === JSON.stringify(['If you went back under: late is not skipped. Say one self-forgiveness line, then do the next step.', "Say out loud 'I stalled at ___' and fill in the blank."]), 'alternates: fixed list, missing ids and queued text skipped → ' + JSON.stringify(alts));
    ok(!alts.some(a => /Tap the side|Stand still and feel|Kneel on a mat/.test(a)), 'no grief tapping, physio or post4 steps in alternates');
    t = await visibleText(page);
    ok(t.includes('No more alternates.') && (await page.getByRole('button', { name: "I'm up and moving", exact: true }).count()) === 1 && (await page.getByRole('button', { name: 'Not yet, start over', exact: true }).count()) === 1, 'list runs out → "No more alternates." with I\'m up and moving + Not yet, start over');
    await clickName(page, 'Not yet, start over');
    await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    // Coach me
    await clickName(page, 'Coach me');
    await page.waitForTimeout(500);
    t = await visibleText(page);
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(call && call.model === 'claude-sonnet-5-5' && call.max_tokens === 16000 && call.output_config.effort === 'low' && call.tools[0].name === 'choose_practices' && call.tool_choice.type === 'auto', 'Coach me uses the Stuck layer-b call shape');
    ok(Object.keys(call).sort().join(',') === 'max_tokens,messages,model,output_config,system,tool_choice,tools', 'request has only the spec fields');
    ok(/Where: Eyes closed/.test(call.messages[0].content) && /Context: local time/.test(call.messages[0].content), 'TEXT = answers + local time');
    ok(!/task-drop-reset|grief-release|fall-practice|elbow-prop/.test(sysText(call)) && /countdown \| Countdown 5-4-3-2-1 \| stage:any/.test(sysText(call)), 'index restricted to pre4/stage4/any, no not-working');
    ok(t.includes('Count out loud and sit up on 1.') && !t.includes('post4') && !t.includes('not working'), 'picks filtered in code (post4, not-working, grief dropped)');
    await clickName(page, "I'm up and moving");
    await page.waitForTimeout(300);
    const lg = await memJSON(page, 'practice:log:2026_10_04');
    const e = lg.entries[lg.entries.length - 1];
    ok(e.practiceId === 'waking-ladder' && e.level === 4 && e.source === 'app-waking' && e.time === '07:1' + e.time.slice(-1) && /Where: Eyes closed/.test(e.note), "I'm up and moving (mid-flow) → waking-ladder level 4, source app-waking, note = answers");
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
    pb.practices.push(F.sevenMinute);
    const ctx = await openPractice({ seed: { ...F.base(), 'practice:playbook': JSON.stringify(pb) }, now: '2026-10-04T07:10:00' });
    await clickName(ctx.page, 'Waking up'); await clickName(ctx.page, 'Eyes closed'); await clickName(ctx.page, 'Next');
    let t = await visibleText(ctx.page);
    ok(t.includes('Step 1 of 1') && t.includes('Sit up and put your feet on the floor.'), 'missing passage-of-time / countdown ids are skipped');
    await clickName(ctx.page, "Didn't work, try another");
    t = await visibleText(ctx.page);
    ok(t.includes('Prop yourself up on your elbows and stay there for 30 seconds.') && t.includes('0:30'), 'seven-minute-waking (not-working) lends its single step first; a step naming 30 seconds gets a timer');
    ok(!(await ctx.page.getByRole('button', { name: 'Done, next', exact: true }).count()) && (await ctx.page.getByRole('button', { name: "I'm up and moving", exact: true }).count()) === 1, "last step: \"I'm up and moving\" replaces \"Done, next\" (one button, no duplicate)");
    ok(!(await mem(ctx.page, 'practice:log:2026_10_04')), 'nothing logged before tapping it');
    await clickName(ctx.page, "I'm up and moving");
    await ctx.page.waitForTimeout(300);
    const lg = await memJSON(ctx.page, 'practice:log:2026_10_04');
    t = await visibleText(ctx.page);
    ok(lg && lg.entries.length === 1 && lg.entries[0].practiceId === 'waking-ladder' && lg.entries[0].level === 4 && lg.entries[0].time === '07:10' && lg.entries[0].source === 'app-waking' && /Where: Eyes closed/.test(lg.entries[0].note), "tapping \"I'm up and moving\" on the last step logs up straight away");
    ok(t.includes('Up. Logged at level 4.') && !t.includes('That was the last step'), 'goes straight to the "Up" screen, no in-between screen');
    await finish(ctx, 'waking-timer');
  }

  console.log('\n[Stuck: stuck-map doc]');
  {
    let reply = toolUse([{ id: 'thought-stop', why: 'Say stop out loud and look at three things in the room.' }, { id: 'task-drop-reset', why: 'Stand still, then name the next task.' }, { id: 'elbow-prop', why: 'nw' }, { id: 'nope', why: 'x' }, { id: 'sc-break', why: 'Hand on chest, three sentences.' }, { id: 'one-word', why: 'Write one word.' }]);
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
    ok(t.includes('Countdown') && t.includes('Task-drop reset'), 'not in bed: post4 practice shown even though the last waking level is 2');
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
    const sys = sysText(call);
    ok(sys.includes('Call choose_practices with 1 to 3 ids from the library, each with a one-sentence reason in literal physical terms. Library:') && sys.includes('ten-percent-intercept | 10% intercept | stage:any | when:First sign of bracing in jaw or shoulders') && sys.includes('task-drop-reset | Task-drop reset | stage:post4 | when:Up but frozen') && !sys.includes('elbow-prop') && /vessel/.test(sys), 'SYSTEM = voice rules + instruction + INDEX (now over when, no not-working)');
    const lines = sys.split('Library:\n')[1].split('\n');
    ok(lines.every(l => /^[a-z0-9-]+ \| .+ \| stage:(pre4|stage4|post4|any|-) \| when:.{0,110}$/.test(l)), 'every INDEX line has the spec format, when ≤ 110 chars');
    ok(call.messages.length === 1 && call.messages[0].content.startsWith('I keep rereading the chat from last night\nContext: local time') && /last waking level today: 2/.test(call.messages[0].content) && /sc-break \(before 7, after 4\)/.test(call.messages[0].content), 'TEXT = his words + one context line (time, level, today\'s reps with ratings)');
    ok(t.includes('Thought stop') && t.includes('Say stop out loud and look at three things') && t.includes('Task-drop reset') && t.includes('Stand still, then name the next task.') && t.includes('Self-compassion break') && !t.includes('One-word container'), 'picks filtered in code: unknown and not-working dropped, post4 kept; max 3');
    await page.getByRole('button', { name: 'Start' }).first().click();
    await clickName(page, 'Begin'); await clickName(page, 'Next'); await clickName(page, 'Next'); await clickName(page, 'Next');
    await clickName(page, 'Save rep');
    await page.waitForTimeout(300);
    let lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(lg.entries.length === 3 && lg.entries[2].practiceId === 'thought-stop' && lg.entries[2].source === 'app-stuck' && lg.entries[2].note === 'Asked Claude: "I keep rereading the chat from last night" | Claude: Say stop out loud and look at three things in the room.', 'rep from a Claude pick saved with source "app-stuck" and note Asked Claude: "<words>" | Claude: <why>');
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
    ok(call3.tools.length === 1 && call3.tools[0].type === 'web_search_20250305' && call3.tools[0].name === 'web_search' && call3.tools[0].max_uses === 2 && /3 to 6 numbered literal steps/.test(sysText(call3)) && /vessel/.test(sysText(call3)), 'layer c: web_search tool only, asks for 3–6 numbered steps and sources');
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
    ok(labels.every(l => t.includes(l)) && t.includes('Grief about lost time'), 'all default situations; grief (minimum level) shown at any time');
    ok(t.trim().indexOf('Something else') > t.indexOf('Scared of falling'), '"Something else" is last on the list');
    await clickName(page, 'Up but frozen, the drop');
    t = await visibleText(page);
    ok(t.includes('10% intercept') && t.includes('Countdown 5-4-3-2-1') && t.includes('Task-drop reset') && t.includes('Yield, push, reach') && t.includes('C-see'), 'not in bed: post4 practices shown with no waking level logged');
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

const logDoc = (iso, entries) => JSON.stringify({ date: iso, entries });
const k = (iso) => 'practice:log:' + iso.replace(/-/g, '_');

async function step4() {
  console.log('\n[Learn]');
  {
    const seed = { ...F.base(),
      [k('2026-09-20')]: logDoc('2026-09-20', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }]),
      [k('2026-10-01')]: logDoc('2026-10-01', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }, { time: '10:00', practiceId: 'sc-break', source: 'app-stuck' }]),
      [k('2026-10-03')]: logDoc('2026-10-03', [{ time: '09:00', practiceId: 'softer-voice', source: 'app' }]),
      [k('2025-01-15')]: logDoc('2025-01-15', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }]),
      [k('2025-02-01')]: '{broken',
      'practice:log:notes': logDoc('x', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }]),
    };
    const ctx = await openPractice({ seed, now: '2026-10-04T12:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Learn' }).click();
    await page.waitForFunction(() => !document.querySelector('.pr-root').innerText.includes('Counting reps'));
    const t = await visibleText(page);
    ok(t.includes('Self-compassion course') && t.includes('Less self-criticism'), 'course name and why');
    ok(/WEEKS 1-2/i.test(t) && /WEEKS 3-4/i.test(t) && t.indexOf('Self-compassion break') < t.indexOf('Compassionate friend'), 'course path by weeks, in order');
    ok(t.includes('Reps of all time, from every daily log in the app.') && t.includes("1 day couldn't be read."), 'Learn says reps are all-time; an unreadable day is reported');
    ok(t.includes('4 reps so far · first rep 2025-01-15'), 'all-time reps + first rep date, including a log from 2025 (sc-break)');
    ok(t.includes('1 rep so far · first rep 2026-10-03'), 'reps so far + first rep date (softer-voice)');
    ok((t.match(/No reps yet/g) || []).length === 3, 'practices without reps say so');
    const lists = await page.evaluate(i => window.__storageLog.slice(i).filter(x => x[0] === 'list').map(x => x[1]), ctx.mark);
    ok(lists.length >= 1 && lists.every(x => x === 'practice:log:'), 'lists logs with the "practice:log:" prefix only');
    ok((await mem(page, k('2025-02-01'))) === '{broken', 'unreadable log doc left alone');
    await page.getByRole('button', { name: 'Start' }).first().click();
    ok((await visibleText(page)).includes('how much self-criticism'), 'Start from Learn opens the guided flow (self-criticism label)');
    await finish(ctx, 'learn');
  }

  console.log('\n[Learn: fallback when logs cannot be listed]');
  {
    const seed = { ...F.base(),
      [k('2026-04-08')]: logDoc('2026-04-08', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }]),
      [k('2026-04-07')]: logDoc('2026-04-07', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }]),
    };
    const ctx = await openPractice({ seed, now: '2026-10-04T12:00:00', noList: true });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Learn' }).click();
    await page.waitForFunction(() => !document.querySelector('.pr-root').innerText.includes('Counting reps'));
    const t = await visibleText(page);
    ok(t.includes(`Couldn't list every log, so this counts the last ${P_LEARN_FALLBACK_DAYS} days only.`), 'no listPrefix → falls back to the 180-day scan and says so');
    ok(t.includes('1 rep so far · first rep 2026-04-08'), 'fallback counts back to 2026-04-08 (180 days incl. today), not 2026-04-07');
    await finish(ctx, 'learn-fallback');
  }

  console.log('\n[Learn: real window.storage.listPrefix against a fake Firestore]');
  {
    const doc = (key, iso, entries) => ({ value: logDoc(iso, entries), key, updatedAt: '2026-01-01' });
    const fake = {
      practice_playbook: { value: F.base()['practice:playbook'], key: 'practice:playbook' },
      practice_log_2024_12_31: doc('practice:log:2024_12_31', '2024-12-31', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }]),
      practice_log_2026_10_01: { value: logDoc('2026-10-01', [{ time: '09:00', practiceId: 'sc-break', source: 'app' }]) }, // no key field
      practice_logbook: { value: logDoc('x', [{ time: '1', practiceId: 'sc-break' }]), key: 'practice:logbook' },
      practice_playbook_old: { value: '{}', key: 'practice:playbook.old' },
      'kaizen3_tasks': { value: '[]', key: 'kaizen3:tasks' },
    };
    const ctx = await openPage({ fakeFirestore: fake, now: '2026-10-04T12:00:00' });
    const { page } = ctx;
    await page.waitForTimeout(3500);
    const mark = await page.evaluate(() => window.__fakeCalls.length);
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('tab', { name: 'Learn' }).click();
    await page.waitForFunction(() => { const r = document.querySelector('.pr-root'); return r && !r.innerText.includes('Counting reps') && r.innerText.includes('so far'); });
    const t = await visibleText(page);
    ok(t.includes('Reps of all time') && t.includes('2 reps so far · first rep 2024-12-31'), 'real listPrefix: counts a 2024 log and a doc with no key field; ignores practice:logbook');
    const calls = await page.evaluate(m => window.__fakeCalls.slice(m), mark);
    const queries = calls.filter(c => c[0] === 'query');
    ok(queries.length >= 1 && queries.every(q => JSON.stringify(q[1]) === JSON.stringify([['>=', 'practice_log_'], ['<', 'practice_log_\uf8ff']])), 'Firestore query is the doc-ID range practice_log_ … practice_log_\\uf8ff');
    ok(!calls.some(c => c[0] === 'getAll'), 'no whole-collection read from the Practice tab');
    ok(calls.filter(c => c[0] === 'get' || c[0] === 'set').every(c => c[1].startsWith('practice_')), 'every single-doc read/write from the Practice tab is a practice_ doc');
    ok(ctx.errors.length === 0, 'fake-firestore: no console errors' + (ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''));
    await ctx.browser.close();
  }

  console.log('\n[Progress]');
  {
    const seed = { ...F.base(),
      [k('2026-10-04')]: logDoc('2026-10-04', [{ time: '08:00', practiceId: 'sc-break', source: 'app' }, { time: '08:05', practiceId: 'waking-ladder', level: 3, source: 'app' }]),
      [k('2026-09-30')]: logDoc('2026-09-30', [{ time: '08:00', practiceId: 'sc-break', source: 'app' }]),
      [k('2026-09-10')]: logDoc('2026-09-10', [{ time: '08:00', practiceId: 'sc-break', source: 'app' }, { time: '09:00', practiceId: 'thought-stop', source: 'app' }]),
      [k('2026-09-04')]: logDoc('2026-09-04', [{ time: '08:00', practiceId: 'sc-break', source: 'app' }]),
      [k('2026-09-15')]: '{broken',
    };
    const ctx = await openPractice({ seed, now: '2026-10-04T12:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Progress' }).click();
    await page.waitForFunction(() => !document.querySelector('.pr-root').innerText.includes('Reading the last 30 days'));
    const t = await visibleText(page);
    const card = (name) => { const i = t.indexOf(name + '\n'); return i < 0 ? '' : t.slice(i, i + 220); };
    const sc = card('Self-compassion break');
    ok(/^Self-compassion break\n2\nlast 7 days\n3\nlast 30 days\n2026-10-04\nlast done/.test(sc), 'sc-break: 2 in 7 days, 3 in 30 days (Sept 4 excluded), last done today');
    ok(sc.includes('Deep Pass (up):') && sc.includes('Steady.'), 'Deep Pass comment from practice:progress');
    ok(/^Thought stop\n0\nlast 7 days\n1\nlast 30 days\n2026-09-10/.test(card('Thought stop')), 'thought-stop: 0 / 1, last done Sept 10');
    ok(t.includes('Deep Pass note') && t.includes('Deep Pass note.'), 'Deep Pass note shown');
    ok(t.includes('3 of the last 30 days have logged reps') && t.includes("1 day couldn't be read"), 'missing days = no reps; unreadable day reported');
    const reads = await page.evaluate(i => window.__storageLog.slice(i).filter(x => x[0] === 'get' && x[1].startsWith('practice:log:')).map(x => x[1]), ctx.mark);
    const uniq = new Set(reads);
    ok(uniq.has('practice:log:2026_09_05') && !uniq.has('practice:log:2026_09_04') && uniq.size === 30, 'reads exactly the last 30 per-day log docs');
    ok((await mem(page, k('2026-09-15'))) === '{broken', 'unreadable log doc left alone');
    await finish(ctx, 'progress');
  }

  console.log('\n[Dr. Shobha]');
  {
    const hw = JSON.parse(F.base()['practice:homework']);
    hw.owedByDrShobha = ['send the grief worksheet', { item: 'Old request', status: 'done' }, { item: 'confirm the nightly call time?', status: 'open' }];
    const queue = { items: [
      { item: 'ask about the morning freeze', since: '2026-09-20', status: 'open' },
      { item: 'Old covered thing', since: '2026-09-01', status: 'covered', coveredOn: '2026-09-18' },
      { item: 'how to use sc-break when I am in public', since: '2026-09-21', status: 'open' },
      { item: 'comparing myself to friends', since: '2026-09-22', status: 'open' },
      { item: 'Sleep after 2 AM', since: '2026-09-23', status: 'open' },
      { item: 'Talk about the drop after class', since: '2026-09-24', status: 'open' },
      { item: 'Sixth open item', since: '2026-09-25', status: 'open' },
    ] };
    let reply = { status: 200, json: { content: [{ type: 'text', text: 'Hi Dr. Shobha,\n1. Please send the grief worksheet.\n2. Can we talk about sc-break in public?' }] } };
    const seed = { ...F.base(), 'practice:homework': JSON.stringify(hw), 'practice:shobha-queue': JSON.stringify(queue) };
    const ctx = await openPractice({ seed, now: '2026-10-04T12:00:00', proxy: async () => reply });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Dr. Shobha' }).click();
    let t = await visibleText(page);
    const expected = ['Hi Dr. Shobha,', '', '1. Send the grief worksheet.', '2. Confirm the nightly call time?', '3. Ask about the morning freeze.', '4. How to use Self-compassion break when I am in public.', '5. Comparing myself to friends.', '6. Sleep after 2 AM.', '7. Talk about the drop after class.'].join('\n');
    ok(t.includes(expected), 'WhatsApp message: open requests first, then top 5 open queue items, numbered with no gaps, plain sentences, no ids');
    ok(!t.includes('Sixth open item.') && !/\d\. Old/.test(t), 'only the top 5 open queue items; closed requests and covered items left out');
    await clickName(page, 'Copy WhatsApp message');
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    ok(clip === expected, 'Copy puts exactly that message on the clipboard');
    ok((await visibleText(page)).includes('Copied'), 'copy confirmed on screen');
    await clickName(page, 'Draft with Claude');
    await page.waitForTimeout(400);
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(call && !call.tools && !call.tool_choice && call.model === 'claude-sonnet-5-5' && call.max_tokens === 16000 && call.output_config.effort === 'low' && /vessel/.test(sysText(call)) && call.messages[0].content === expected, 'Draft with Claude: same proxy call, no tools, sends only the message');
    const drec = (await memJSON(page, 'practice:asks:2026_10_04'))?.entries?.slice(-1)[0];
    ok(drec && drec.kind === 'draft-shobha' && drec.words === expected && drec.prompt === expected && drec.text.startsWith('Hi Dr. Shobha') && (await visibleText(page)).includes("Saved to today's answers."), 'Draft with Claude: reply saved to practice:asks:<today> as draft-shobha; "Saved to today\'s answers." shown');
    t = await visibleText(page);
    ok(t.includes('Can we talk about Self-compassion break in public?') && !/\bsc-break\b/.test(t.split('Copy WhatsApp message')[1] || ''), "Claude's draft shown with ids swapped for names");
    await page.fill('#pr-queue-add', 'Bring up the cold mornings');
    await clickName(page, 'Add');
    await page.waitForTimeout(300);
    let q = await memJSON(page, 'practice:shobha-queue');
    ok(q.items.length === 8 && q.items[7].item === 'Bring up the cold mornings' && q.items[7].since === '2026-10-04' && q.items[7].status === 'open', 'Add appends {item, since, status:"open"}');
    await page.getByRole('button', { name: 'Mark covered' }).first().click();
    await page.getByLabel('Covered on').fill('2026-10-02');
    await clickName(page, 'Save');
    await page.waitForTimeout(300);
    q = await memJSON(page, 'practice:shobha-queue');
    ok(q.items.length === 8 && q.items[0].status === 'covered' && q.items[0].coveredOn === '2026-10-02' && q.items[2].status === 'open', 'Mark covered sets status + coveredOn on that item only; nothing removed');
    t = await visibleText(page);
    ok(t.includes('3. How to use Self-compassion break when I am in public.') && t.includes('7. Sixth open item.'), 'message renumbers with no gaps after covering');
    ok(t.includes('Send the grief worksheet') && t.includes('✓ Old request'), 'owed-by-her list shows open and done');
    ok(t.includes('Self-forgiveness sentence each morning') && t.includes('2026-10-09'), 'homework on this screen');
    ok(!(await page.getByRole('button', { name: /delete|remove/i }).count()), 'no delete/remove buttons');
    reply = { status: 503, json: {} };
    await clickName(page, 'Draft with Claude'); await page.waitForTimeout(300);
    ok((await visibleText(page)).includes('The AI proxy answered 503'), 'draft failure shown');
    await finish(ctx, 'shobha', { allowProxyFailure: true });
  }

  console.log('\n[Gaps]');
  {
    const ctx = await openPractice({ seed: F.base(), now: '2026-10-04T12:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Gaps' }).click();
    let t = await visibleText(page);
    ok(t.includes('Cold mornings') && t.includes('Owners: Brighton') && t.includes('Heater on a timer') && t.includes('since 2026-09-20'), 'gaps show theme, since, owners, options');
    await page.getByLabel('Gap theme').fill('Noise at night');
    await page.getByLabel('Gap owners').fill('Dr. Shobha, landlord');
    await page.getByLabel('Gap options').fill('Earplugs\nWhite noise');
    await clickName(page, 'Add');
    await page.waitForTimeout(300);
    const om = await memJSON(page, 'practice:outside-map');
    const it = om.items[1];
    ok(om.items.length === 2 && om.items[0].theme === 'Cold mornings' && it.theme === 'Noise at night' && it.since === '2026-10-04' && JSON.stringify(it.owners) === '["Dr. Shobha","landlord"]' && JSON.stringify(it.options) === '["Earplugs","White noise"]', 'Add appends {theme, since, owners[], options[]}');
    t = await visibleText(page);
    ok(t.includes('Noise at night') && t.includes('Owners: Dr. Shobha, landlord'), 'new gap shown');
    ok(!(await page.getByRole('button', { name: /delete|remove/i }).count()), 'no delete/remove buttons');
    await finish(ctx, 'gaps');
  }

  console.log('\n[Unreadable queue / gaps are not overwritten]');
  {
    const seed = { ...F.base(), 'practice:shobha-queue': '{x', 'practice:outside-map': '{y' };
    const ctx = await openPractice({ seed, now: '2026-10-04T12:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Dr. Shobha' }).click();
    await page.fill('#pr-queue-add', 'test');
    ok(await page.getByRole('button', { name: 'Add', exact: true }).isDisabled(), 'unreadable queue: Add disabled');
    await page.getByRole('tab', { name: 'Gaps' }).click();
    await page.getByLabel('Gap theme').fill('test');
    ok(await page.getByRole('button', { name: 'Add', exact: true }).isDisabled(), 'unreadable gaps: Add disabled');
    ok((await mem(page, 'practice:shobha-queue')) === '{x' && (await mem(page, 'practice:outside-map')) === '{y', 'both docs untouched');
    await finish(ctx, 'unreadable-4');
  }
}


// Build pass: saved answers (A), prompt caching (B), whole-database backups (C), fix pass (D).
const asksKey = (iso) => 'practice:asks:' + iso.replace(/-/g, '_');
const noNullish = (t) => !/\bnull\b|\bundefined\b/.test(t);

async function step5() {
  console.log('\n[A + B: every Claude answer is saved; system block is cached]');
  {
    const words = 'I keep rereading the chat from last night and cannot put the phone down. ' + 'x'.repeat(260);
    let reply = { status: 200, json: { model: 'claude-sonnet-5-5-20260901', usage: { input_tokens: 1200, output_tokens: 80, cache_creation_input_tokens: 900, cache_read_input_tokens: 0 }, content: [
      { type: 'text', text: 'Here are ' }, { type: 'text', text: 'three.' },
      { type: 'tool_use', id: 't1', name: 'choose_practices', input: { picks: [{ id: 'elbow-prop', why: 'not working, filtered' }, { id: 'nope', why: 'unknown, filtered' }, { id: 'thought-stop', why: 'Say stop out loud.' }] } }] } };
    const yesterdayAsks = { date: '2026-10-03', entries: [
      { time: '21:15', kind: 'coach-me', words: 'Where: Eyes closed.', prompt: 'p', text: '', tools: [{ name: 'choose_practices', input: { picks: [{ id: 'countdown', why: 'Count and move.' }] } }], sources: [], model: 'm', usage: {} },
      { kind: 'outside', words: 'An answer with no time', prompt: 'p', text: '1. Step one.', tools: [], sources: [], model: 'm', usage: {} },
    ] };
    const seed = { ...F.base(), [asksKey('2026-10-03')]: JSON.stringify(yesterdayAsks) };
    const ctx = await openPractice({ seed, now: '2026-10-04T09:00:00', proxy: async () => reply });
    const { page } = ctx;
    await clickName(page, 'Stuck');
    await page.getByLabel('Ask Claude', { exact: true }).fill(words);
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(500);
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(Array.isArray(call.system) && call.system.length === 1 && call.system[0].type === 'text' && JSON.stringify(call.system[0].cache_control) === '{"type":"ephemeral"}' && Object.keys(call.system[0]).sort().join(',') === 'cache_control,text,type' && call.system[0].text.startsWith('Voice rules:'), 'B: system = [{type:"text", text, cache_control:{type:"ephemeral"}}]');
    ok(!('cache_control' in call) && call.messages.every(m => typeof m.content === 'string') && Object.keys(call).sort().join(',') === 'max_tokens,messages,model,output_config,system,tool_choice,tools', 'B: no top-level automatic caching; the user message carries no breakpoint');
    let asks = await memJSON(page, asksKey('2026-10-04'));
    let r = asks?.entries?.[0];
    ok(asks && asks.date === '2026-10-04' && asks.entries.length === 1, 'A: reply appended to practice:asks:2026_10_04');
    ok(r && r.time === '09:00' && r.kind === 'stuck' && r.words === words && r.prompt === call.messages[0].content && r.text === 'Here are three.' && r.model === 'claude-sonnet-5-5-20260901', 'A: record has time, kind, words, prompt (full user text), text (text blocks joined), model');
    ok(r && JSON.stringify(r.usage) === JSON.stringify({ input_tokens: 1200, output_tokens: 80, cache_creation_input_tokens: 900, cache_read_input_tokens: 0 }), 'A: record has usage incl. cache token counts');
    ok(r && r.tools.length === 1 && r.tools[0].name === 'choose_practices' && r.tools[0].input.picks.length === 3 && r.tools[0].input.picks[0].id === 'elbow-prop' && r.tools[0].input.picks[1].id === 'nope', 'A: record keeps every pick, including the ones filtered out in code');
    ok(r && Array.isArray(r.sources) && r.sources.length === 0, 'A: sources empty when there are no citations');
    let t = await visibleText(page);
    ok(t.includes("Saved to today's answers.") && t.includes('Say stop out loud.') && !t.includes('not working, filtered'), 'A: "Saved to today\'s answers." under the picks; filtered picks not offered');
    await page.getByRole('button', { name: 'Start' }).first().click();
    await clickName(page, 'Begin'); await clickName(page, 'Next'); await clickName(page, 'Next'); await clickName(page, 'Next');
    await clickName(page, 'Save rep'); await page.waitForTimeout(300);
    const lg = await memJSON(page, 'practice:log:2026_10_04');
    ok(words.length > 240 && lg.entries[0].practiceId === 'thought-stop' && lg.entries[0].note === `Asked Claude: "${words.slice(0, 240)}" | Claude: Say stop out loud.`, 'A: rep from a pick logged with note Asked Claude: "<words, max 240 chars>" | Claude: <why>');
    reply = { status: 500, json: { error: 'x' } };
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    asks = await memJSON(page, asksKey('2026-10-04'));
    ok(asks.entries.length === 1 && !(await visibleText(page)).includes("Saved to today's answers."), 'A: a non-200 call saves nothing and shows no save line');
    reply = { status: 200, json: { content: [{ type: 'text', text: 'Try breathing.' }] } };
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    asks = await memJSON(page, asksKey('2026-10-04'));
    r = asks.entries[1];
    ok(asks.entries.length === 2 && r.text === 'Try breathing.' && r.tools.length === 0 && JSON.stringify(r.usage) === '{}' && r.model === 'claude-sonnet-5-5', 'A: a text-only reply is still saved (model falls back to the one requested)');
    t = await visibleText(page);
    ok(t.includes('without choosing practices') && t.includes("Saved to today's answers."), 'A: the failed check is shown, and that the reply was saved anyway');
    reply = toolUse([{ id: 'countdown', why: 'Count down and move on 1.' }]);
    await clickName(page, 'Something else');
    await page.getByLabel('Something else, in your words').fill('Stuck in the shower');
    await page.getByRole('button', { name: 'Ask Claude', exact: true }).click(); await page.waitForTimeout(400);
    asks = await memJSON(page, asksKey('2026-10-04'));
    ok(asks.entries[2]?.kind === 'stuck-else' && asks.entries[2].words === 'Stuck in the shower', 'A: Something else → kind "stuck-else"');
    reply = { status: 200, json: { content: [
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
      { type: 'text', text: '1. Turn the water colder.\n2. Step out.\n3. Reach for the towel.', citations: [{ type: 'web_search_result_location', title: 'Example Health', url: 'https://example.org/a' }, { type: 'web_search_result_location', title: 'Example Health', url: 'https://example.org/a' }] }] } };
    await clickName(page, 'Look outside the playbook'); await page.waitForTimeout(400);
    asks = await memJSON(page, asksKey('2026-10-04'));
    r = asks.entries[3];
    ok(r && r.kind === 'outside' && r.words === 'Stuck in the shower' && JSON.stringify(r.sources) === JSON.stringify([{ title: 'Example Health', url: 'https://example.org/a' }]) && r.text.startsWith('1. Turn the water colder.') && r.tools.length === 0, 'A: Look outside → kind "outside" with sources (title + url) and text');
    t = await visibleText(page);
    const outPart = t.slice(t.lastIndexOf('Look outside the playbook'));
    ok(outPart.includes('1. Turn the water colder.') && outPart.includes("Saved to today's answers."), 'A: "Saved to today\'s answers." under the Look outside answer');
    const btn = page.getByRole('button', { name: /^Show earlier answers from Claude \(\d+\)$/ });
    ok((await btn.count()) === 1 && (await btn.textContent()) === 'Show earlier answers from Claude (6)', 'A: collapsed "Show earlier answers from Claude (6)" (4 today + 2 yesterday)');
    ok(!(await visibleText(page)).includes('You: An answer with no time'), 'A: earlier answers start collapsed');
    ok(t.indexOf('Show earlier answers') > t.lastIndexOf('Look outside the playbook'), 'A: the card sits below Look outside');
    await btn.click();
    t = await visibleText(page);
    const card = t.slice(t.indexOf('Show earlier answers from Claude'), t.indexOf('If thoughts of ending'));
    const pos = ['Today 09:00 · Look outside', 'Today 09:00 · Something else', 'Today 09:00 · Ask Claude', 'Yesterday 21:15 · Coach me', 'Yesterday · Look outside'].map(x => card.indexOf(x));
    ok(pos.every((x, i) => x >= 0 && (i === 0 || x > pos[i - 1])), 'A: newest first, "Today/Yesterday HH:MM · <kind>"; an entry without a time shows no time → ' + JSON.stringify(pos));
    ok(card.includes('You: Stuck in the shower') && card.includes('Countdown 5-4-3-2-1: Count and move.') && card.includes('Thought stop: Say stop out loud.') && card.includes('Try breathing.') && card.includes('1. Step one.'), 'A: each entry shows You: <words>, each pick as <practice name>: <why>, then any text');
    ok(noNullish(card), 'A: no "null" or "undefined" in the card');
    await finish(ctx, 'saved-answers', { allowProxyFailure: true });
  }

  console.log('\n[A: the answers doc is unreadable → shown, never overwritten]');
  {
    const seed = { ...F.base(), [asksKey('2026-10-04')]: '{bad' };
    const ctx = await openPractice({ seed, now: '2026-10-04T09:00:00', proxy: async () => toolUse([{ id: 'countdown', why: 'Count down.' }]) });
    const { page } = ctx;
    await clickName(page, 'Stuck');
    await page.getByLabel('Ask Claude', { exact: true }).fill('test');
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    let t = await visibleText(page);
    ok(t.includes('Count down.') && t.includes("❌ This answer didn't save. Take a screenshot before you leave this screen."), 'A: save failed → the answer is still shown, with the screenshot warning');
    ok((await mem(page, asksKey('2026-10-04'))) === '{bad', 'A: unreadable answers doc not overwritten');
    await page.getByRole('button', { name: /^Show earlier answers from Claude/ }).click();
    t = await visibleText(page);
    ok(t.includes("Today's answers couldn't be read") && t.includes('Nothing was changed.'), 'A: earlier answers card shows the read error');
    await finish(ctx, 'asks-unreadable');
  }

  console.log('\n[A + D5 + D6: Coach me, last night\'s lights-out, an entry with no time]');
  {
    const seed = { ...F.base(),
      [k('2026-10-04')]: logDoc('2026-10-04', [{ practiceId: 'sc-break', source: 'routine' }, { time: '00:40', practiceId: 'bedtime-plan', source: 'routine' }]),
      [k('2026-10-03')]: logDoc('2026-10-03', [{ time: '22:10', practiceId: 'lights-out', source: 'routine' }, { time: '17:30', practiceId: 'bedtime-plan', source: 'routine' }, { practiceId: 'lights-out', source: 'routine' }]),
    };
    const ctx = await openPractice({ seed, now: '2026-10-04T07:00:00', proxy: async () => toolUse([{ id: 'countdown', why: 'Count down and sit up on 1.' }]) });
    const { page } = ctx;
    let t = await visibleText(page);
    ok(await page.getByRole('button', { name: 'Waking up', exact: true }).isVisible(), 'D2: 07:00, nothing logged → Waking up button');
    ok(/LOGGED TODAY \(2\)\nSelf-compassion break\n00:40 Bedtime plan/i.test(t) && noNullish(t), 'D6: an entry with no time is listed without "null"/"undefined"');
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    await clickName(page, 'Coach me'); await page.waitForTimeout(500);
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(/; last night's lights-out: 00:40\.$/.test(call.messages[0].content), "D5: Coach me uses today's 00:40 bedtime-plan entry as last night's lights-out → " + JSON.stringify(call.messages[0].content.split('\n')[1]));
    const r = (await memJSON(page, asksKey('2026-10-04'))).entries[0];
    ok(r.kind === 'coach-me' && r.words === 'Where: Eyes closed. In the way: nothing picked.' && r.prompt === call.messages[0].content, 'A: Coach me reply saved as kind "coach-me" with his answers as words');
    ok((await visibleText(page)).includes("Saved to today's answers."), 'A: "Saved to today\'s answers." under the Coach me picks');
    await page.getByRole('button', { name: 'Start', exact: true }).first().click();
    await clickName(page, 'Begin'); await clickName(page, 'Next'); await clickName(page, 'Next');
    await clickName(page, 'Save rep'); await page.waitForTimeout(300);
    const e = (await memJSON(page, k('2026-10-04'))).entries.slice(-1)[0];
    ok(e.practiceId === 'countdown' && e.source === 'app-waking' && e.note === 'Asked Claude: "Where: Eyes closed. In the way: nothing picked." | Claude: Count down and sit up on 1.', 'A: rep from a Coach me pick logged with the Asked Claude note');
    await clickName(page, '✕ Close');
    await clickName(page, 'Stuck');
    await page.getByLabel('Ask Claude', { exact: true }).fill('test');
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    const c2 = ctx.proxyCalls[ctx.proxyCalls.length - 1].messages[0].content;
    ok(noNullish(c2) && /logged today: sc-break, bedtime-plan, countdown\.$/.test(c2), 'D6: context line sent to Claude has no "null"/"undefined" with an entry missing its time → ' + JSON.stringify(c2.split('\n')[1]));
    await finish(ctx, 'coach-lights-out');
  }

  console.log('\n[D1: 15:00, no waking level logged]');
  {
    const map = { version: 3, situations: [
      { id: 'bed', label: 'In bed, not past level 4', practices: ['sf-daily-stall', 'yield-push-reach'] },
      { id: 'frozen', label: 'Up but frozen', practices: ['task-drop-reset', 'countdown'] },
      { id: 'grief', label: 'Grief about lost time', practices: ['grief-release'], minLevel: 4 },
    ] };
    const seed = { ...F.base(), 'practice:stuck-map': JSON.stringify(map) };
    const ctx = await openPractice({ seed, now: '2026-10-04T15:00:00', proxy: async () => toolUse([{ id: 'task-drop-reset', why: 'Stand still and name the next task.' }]) });
    const { page } = ctx;
    ok(!(await page.getByRole('button', { name: 'Waking up', exact: true }).count()), 'D2: no Waking up button at 15:00');
    await clickName(page, 'Stuck');
    await clickName(page, 'In bed, not past level 4');
    let t = await visibleText(page);
    ok(t.includes('Self-forgiveness for the daily stall') && !t.includes('Yield, push, reach'), 'D1b: the in-bed situation still drops its post4 practice');
    await clickName(page, 'Up but frozen');
    t = await visibleText(page);
    ok(t.includes('Task-drop reset') && t.includes('Countdown'), 'D1b: a non-bed situation keeps its post4 practice');
    await clickName(page, 'Grief about lost time');
    ok((await visibleText(page)).includes('Grief release tapping'), 'D1b: a situation with a minimum level shows at any time');
    await clickName(page, 'Grief about lost time');
    await page.getByLabel('Ask Claude', { exact: true }).fill('frozen after class');
    await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
    t = await visibleText(page);
    ok(t.includes('Stand still and name the next task.'), 'D1c: Ask Claude keeps a post4 pick');
    const sys = sysText(ctx.proxyCalls[ctx.proxyCalls.length - 1]);
    ok(sys.includes('- Physio and grief tapping never while he is still waking up in bed.') && !sys.includes('only after level 4'), 'D1d: new voice rule');
    await finish(ctx, 'd1-15h');
  }

  console.log('\n[D2: Waking up button hours and hiding]');
  for (const [label, now, entries, show] of [
    ['01:00', '2026-10-04T01:00:00', [], false],
    ['04:00', '2026-10-04T04:00:00', [], true],
    ['13:00', '2026-10-04T13:00:00', [], false],
    ['09:00 after a post4 rep', '2026-10-04T09:00:00', [{ time: '08:30', practiceId: 'task-drop-reset', source: 'app' }], false],
    ['09:00 after level "4" written outside the app', '2026-10-04T09:00:00', [{ time: '08:30', practiceId: 'waking-ladder', level: '4', source: 'routine' }], false],
  ]) {
    const seed = { ...F.base(), ...(entries.length ? { [k('2026-10-04')]: logDoc('2026-10-04', entries) } : {}) };
    const ctx = await openPractice({ seed, now, proxy: async () => toolUse([{ id: 'countdown', why: 'x' }]) });
    const { page } = ctx;
    ok((await page.getByRole('button', { name: 'Waking up', exact: true }).count()) === (show ? 1 : 0), `D2: ${label} → Waking up button ${show ? 'shown' : 'hidden'}`);
    if (entries[0]?.level === '4') {
      ok((await visibleText(page)).includes('Waking ladder · level 4'), 'D6: level "4" shown as level 4 in the log');
      await clickName(page, 'Stuck');
      await page.getByLabel('Ask Claude', { exact: true }).fill('test');
      await clickName(page, 'Pick practices for me'); await page.waitForTimeout(400);
      ok(/last waking level today: 4;/.test(ctx.proxyCalls[ctx.proxyCalls.length - 1].messages[0].content), 'D6: level "4" counts as 4 in the context line');
    }
    await finish(ctx, 'd2-' + label);
  }

  console.log('\n[D3 + D4: alternates with seven-minute-waking not-working; dizzy while standing]');
  {
    const pb = JSON.parse(F.base()['practice:playbook']);
    pb.practices.push(F.sevenMinute);
    const ctx = await openPractice({ seed: { ...F.base(), 'practice:playbook': JSON.stringify(pb) }, now: '2026-10-04T07:10:00' });
    const { page } = ctx;
    await clickName(page, 'Waking up');
    await clickName(page, 'Standing'); await clickName(page, 'Dizzy or lightheaded'); await clickName(page, 'Next');
    let t = await visibleText(page);
    ok(t.includes('Step 1 of 2') && t.includes('Sit down on the nearest surface or hold something solid. 5 slow breaths, then stand up slowly with a hand on something.'), 'D4: Standing + dizzy → sit down or hold something solid');
    await clickName(page, "I'm up and moving"); await page.waitForTimeout(300);
    await clickName(page, 'Back to Today');
    ok(!(await page.getByRole('button', { name: 'Waking up', exact: true }).count()), 'D2: hidden once up');
    // Fresh start from Stuck → in bed → Waking up (the Today button is gone now).
    await clickName(page, 'Stuck'); await clickName(page, 'In bed, not past level 4'); await clickName(page, 'Waking up, one step at a time');
    await clickName(page, 'Propped up or sitting'); await clickName(page, 'Dizzy or lightheaded'); await clickName(page, 'Next');
    ok((await visibleText(page)).includes('Stay sitting, 5 slow breaths, then stand up slowly with a hand on something.'), 'D4: propped up + dizzy keeps the current text');
    await clickName(page, "Didn't work, try another"); // replaces the dizzy step; then start over for the full walk
    await clickName(page, '✕ Close'); await clickName(page, 'Waking up, one step at a time');
    await clickName(page, 'Eyes open, lying down'); await clickName(page, 'Next');
    const alts = [];
    for (let i = 0; i < 12; i++) {
      if (!(await page.getByRole('button', { name: "Didn't work, try another", exact: true }).count())) break;
      await clickName(page, "Didn't work, try another");
      const m = (await visibleText(page)).match(/Step \d+ of \d+\n+([^\n]+)/);
      if (m) alts.push(m[1]);
      if (i === 0) ok((await visibleText(page)).includes('0:30'), 'D3: the 30-second elbows step gets a timer');
    }
    const expected = [
      'Prop yourself up on your elbows and stay there for 30 seconds.',
      'Roll onto your side, then push yourself up to sitting.',
      "Take 5 voo breaths: on each out-breath, make a long, low 'voo' sound.",
      'Move only your eyes: slowly left to right, then up and down.',
      'Turn your head slowly to the left, then to the right.',
      'If you went back under: late is not skipped. Say one self-forgiveness line, then do the next step.',
      "Say out loud 'I stalled at ___' and fill in the blank.",
    ];
    ok(JSON.stringify(alts) === JSON.stringify(expected), 'D3: fixed list in order; not-working seven-minute-waking lends single steps; countdown (already queued) skipped → ' + JSON.stringify(alts));
    t = await visibleText(page);
    ok(t.includes('No more alternates.') && !t.includes('Step 1 of'), 'D3: list runs out → "No more alternates."');
    await clickName(page, 'Not yet, start over');
    ok((await visibleText(page)).includes('Where are you?'), 'D3: "Not yet, start over" goes back to the first question');
    await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    for (let i = 0; i < 12 && (await page.getByRole('button', { name: "Didn't work, try another", exact: true }).count()); i++) await clickName(page, "Didn't work, try another");
    const before = (await memJSON(page, k('2026-10-04'))).entries.length;
    await clickName(page, "I'm up and moving"); await page.waitForTimeout(300);
    const lg = await memJSON(page, k('2026-10-04'));
    ok(lg.entries.length === before + 1 && lg.entries[before].level === 4 && lg.entries[before].source === 'app-waking', 'D3: "I\'m up and moving" on the No more alternates screen logs level 4');
    await finish(ctx, 'd3-d4');
  }

  console.log('\n[C: whole-database backup (format 3), real window.storage against a fake Firestore]');
  {
    const L = (h) => ({ brainDump: '', highlight: h, micro: '', done: [], reflection: '' });
    const fake = {
      test_extra: { value: '[1,2]', key: 'test:extra', updatedAt: '2026-10-01T10:00:00.000Z', extra: 'keep me' },
      kaizen3_logs: { value: JSON.stringify({ '2026-07-10': L('kaizen3 day') }), key: 'kaizen3:logs' },
      kaizen3_logs_archive_2026_09: { value: JSON.stringify({ '2026-08-10': L('archived day') }), key: 'kaizen3:logs', archivedAt: '2026-09-30' },
      kaizen4_logs: { value: JSON.stringify({ '2026-10-01': L('active day') }), key: 'kaizen4:logs' },
      practice_playbook: { value: F.base()['practice:playbook'], key: 'practice:playbook' },
      practice_asks_2026_10_04: { value: JSON.stringify({ date: '2026-10-04', entries: [] }), key: 'practice:asks:2026_10_04' },
      some_future_doc: { value: 'x', key: 'some-future:doc', migratedAt: '2026-01-01T00:00:00.000Z' },
      'gatekeeper-name': { value: 'Gus', key: 'gatekeeper-name' },
    };
    const ctx = await openPage({ fakeFirestore: fake, now: '2026-10-04T12:00:00' });
    const { page } = ctx;
    await page.waitForTimeout(3500);
    const g = await page.evaluate(async () => {
      const r = await window.nwGatherBackup();
      const all = {};
      for (const e of r.backup.entries) all[e.key] = (await window.storage.getAll(e.key)).value;
      return { r, all };
    });
    const b = g.r.backup;
    const keys = b.entries.map(e => e.key);
    ok(b.format === 3 && b.source === 'firestore' && b.count === b.entries.length && typeof b.timestamp === 'string' && b.zone === 'America/Anchorage' && b.label === 'AKDT' && b.offset === '-08:00', `C: format 3 (${b.count} entries) with this device's zone, label and offset`);
    ok(JSON.stringify(keys) === JSON.stringify([...keys].sort()) && new Set(keys).size === keys.length && ['test:extra', 'kaizen4:logs', 'practice:playbook', 'practice:asks:2026_10_04', 'some_future_doc', 'gatekeeper-name'].every(k => keys.includes(k)), 'C: one entry per key, sorted, including Practice docs and a doc no code knows about (its key field names another doc ID, so it is kept under its own ID) → ' + keys.join(', '));
    ok(!keys.some(k => /^kaizen3:logs$|archive|__/.test(k)), 'C: old Kaizen archives are not keys of their own');
    ok(b.entries.every(e => JSON.stringify(e.text ? e.value : e.value) !== undefined && (e.text ? g.all[e.key] === e.value : JSON.stringify(JSON.parse(g.all[e.key])) === JSON.stringify(e.value))), 'C: every value is exactly what getAll returns');
    const k4 = b.entries.find(e => e.key === 'kaizen4:logs').value;
    ok(Object.keys(k4).join(',') === '2026-07-10,2026-08-10,2026-10-01', 'C: kaizen4:logs holds its old archives merged in, as parsed JSON');
    const ex = b.entries.find(e => e.key === 'test:extra');
    ok(Array.isArray(ex.value) && ex.value[1] === 2 && ex.updatedAt === '2026-10-01T10:00:00.000Z' && Object.keys(ex).sort().join(',') === 'key,updatedAt,value', 'C: an entry is { key, value, updatedAt }, value parsed');
    const gk = b.entries.find(e => e.key === 'gatekeeper-name');
    ok(gk.value === 'Gus' && gk.text === true, 'C: a value that is not JSON is kept as text (text: true)');
    const fp2 = await page.evaluate(async () => (await window.nwGatherBackup()).fingerprint);
    ok(typeof g.r.fingerprint === 'string' && fp2 === g.r.fingerprint, 'C: same data → same fingerprint');
    const fp3 = await page.evaluate(async () => { window.__fakeDocs.get('some_future_doc').value = 'y'; const f = (await window.nwGatherBackup()).fingerprint; window.__fakeDocs.get('some_future_doc').value = 'x'; return f; });
    ok(fp3 !== g.r.fingerprint, 'C: a changed key → a different fingerprint');

    const raw = await page.evaluate(async () => window.storage.exportRawDocs()); // for the format-2 check below
    // Format 3 restore into an empty database: every key reads back exactly.
    const r3 = await page.evaluate(async ({ backup, all }) => {
      window.__confirms = [];
      window.confirm = (m) => { window.__confirms.push(m); return true; };
      window.__fakeDocs.clear();
      const res = await window.nwRestoreBackup(backup);
      const back = {};
      for (const k of Object.keys(all)) back[k] = (await window.storage.getAll(k)).value;
      return { res, confirms: window.__confirms, same: Object.keys(all).every(k => back[k] === all[k]), local: localStorage.getItem('test:extra') };
    }, { backup: b, all: g.all });
    ok(r3.res.restored === b.count && r3.res.failed.length === 0 && r3.same, `C: format 3 restores all ${b.count} keys into an empty database; every key's getAll reads back exactly`);
    ok(r3.confirms.length === 1 && r3.confirms[0].includes(`Restore ${b.count} items`) && r3.confirms[0].includes('2026'), 'C: restore asks first, with the item count and backup date');
    ok(r3.local === '[1,2]', "C: restore updates this device's copy too");

    // Format 2 (raw docs by ID, exported before the format-3 restore above) still restores.
    const v2 = { format: 2, timestamp: '2026-10-01T00:00:00.000Z', source: 'firestore', count: raw.length, docs: raw };
    const rr = await page.evaluate(async (v2) => {
      window.confirm = () => true;
      const docs = window.__fakeDocs;
      docs.clear();
      localStorage.setItem('kaizen3:logs', 'device-copy');
      const t0 = Date.now();
      const res = await window.nwRestoreBackup(v2);
      const fresh = (v) => v instanceof Date && v.getTime() >= t0 - 1000;
      const ex = docs.get('test_extra');
      return { res, ids: [...docs.keys()].sort(), exFresh: fresh(ex.updatedAt) && fresh(ex.restoredAt), extra: ex.extra, local: localStorage.getItem('kaizen3:logs') };
    }, v2);
    ok(rr.res.restored === raw.length && rr.res.failed.length === 0 && JSON.stringify(rr.ids) === JSON.stringify(raw.map(d => d.id).sort()), `C: a format-2 file still restores every doc by ID (${raw.length})`);
    ok(rr.exFresh && rr.extra === 'keep me' && rr.local === 'device-copy', "C: format 2: fields kept, updatedAt/restoredAt = now; an archive doesn't overwrite a device copy");
    const cancel = await page.evaluate(async (backup) => {
      window.confirm = () => false;
      const n = window.__fakeCalls.length;
      const res = await window.nwRestoreBackup(backup);
      return { res, sets: window.__fakeCalls.slice(n).filter(c => c[0] === 'set').length };
    }, b);
    ok(cancel.res.cancelled === true && cancel.sets === 0, 'C: cancelling the confirm writes nothing');
    const fail = await page.evaluate(async () => {
      window.confirm = () => true;
      window.__fakeFail = (op, id) => (op === 'set' && id === 'zz_fail' ? 'reject' : null);
      const res = await window.nwRestoreBackup({ format: 3, timestamp: '2026-10-01T00:00:00.000Z', entries: [{ key: 'zz:fail', value: 1 }, { key: 'zz:ok', value: 2 }, { value: 3 }] });
      window.__fakeFail = null;
      return res;
    });
    ok(fail.restored === 2 && JSON.stringify(fail.failed) === JSON.stringify(['(an entry with no key)']) && JSON.stringify(fail.deviceOnly) === JSON.stringify(['zz:fail']), 'C: a key the cloud rejects is reported as on this device only; an entry with no key fails → ' + JSON.stringify(fail));
    const old = await page.evaluate(async () => {
      const res = await window.nwRestoreBackup({ timestamp: '2026-09-01T00:00:00.000Z', data: { 'test:extra': 'old-format-value' } });
      return { res, doc: window.__fakeDocs.get('test_extra').value, local: localStorage.getItem('test:extra') };
    });
    ok(old.res.restored === 1 && old.res.failed.length === 0 && old.doc === 'old-format-value' && old.local === 'old-format-value', 'C: an old-format file (data map) restores with storage.set per key');

    // System tab: text, Download Backup.
    await page.getByRole('button', { name: 'System', exact: true }).click();
    let t = await page.locator('body').innerText();
    ok(t.includes('Backs up everything in the database, including the Practice tab and anything added later.'), 'C: System tab text');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /DOWNLOAD BACKUP/ }).click()]);
    const text = require('fs').readFileSync(await dl.path(), 'utf8');
    const file = JSON.parse(text);
    const nKeys = await page.evaluate(async () => (await window.nwGatherBackup()).backup.count);
    ok(file.format === 3 && file.count === nKeys && text.startsWith('{\n  "format": 3,\n') && dl.suggestedFilename() === 'nikhil-world-backup-2026-10-04-AKDT.json', `C: Download Backup saves the format-3 backup, pretty-printed, named by the local date and zone (${dl.suggestedFilename()})`);
    await page.waitForTimeout(200);
    t = await page.locator('body').innerText();
    ok(new RegExp(`Backup downloaded ✅ · ${nKeys} items · \\d+\\.\\d\\d MB`).test(t) && !t.includes("this device's copy"), 'C: status shows item count and MB');

    // Sync to Drive against a fake Drive API: multipart up to 4.5 MB, resumable above.
    const drive = [];
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-upload-content-type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'access-control-expose-headers': 'Location' };
    const crypto = require('crypto');
    const sent = {};
    await page.route('https://www.googleapis.com/**', async (route) => {
      const req = route.request(); const url = req.url(); const m = req.method();
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      drive.push({ m, url, len: (req.postDataBuffer() || Buffer.alloc(0)).length, body: m === 'POST' && /uploadType=resumable/.test(url) ? req.postData() : null });
      const json = (o, extra = {}) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json', ...extra }, body: JSON.stringify(o) });
      if (m === 'GET' && /mimeType/.test(decodeURIComponent(url))) return json({ files: [{ id: 'FOLDER1' }] });
      if (m === 'GET') return json({ files: [] });
      const fileOf = (content, id) => ({ id, name: sent.name, size: String(Buffer.byteLength(content)), md5Checksum: crypto.createHash('md5').update(content).digest('hex') });
      if (m === 'POST' && /uploadType=multipart/.test(url)) {
        const body = req.postData();
        const parts = body.split(/--nw_backup_boundary_\d+/);
        sent.name = JSON.parse(parts[1].split('\r\n\r\n')[1]).name;
        return json(fileOf(parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''), 'FILE_MULTI'));
      }
      if (m === 'POST' && /uploadType=resumable/.test(url)) { sent.name = JSON.parse(req.postData()).name; return json({}, { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=XYZ' }); }
      if (m === 'PUT' && /upload_id=XYZ/.test(url)) return json(fileOf(req.postDataBuffer(), 'FILE_RESUMABLE'));
      return route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    await page.evaluate(() => localStorage.setItem('gdrive_token_v1', JSON.stringify({ token: 'test-token', expiresAt: Date.now() + 3600 * 1000 })));
    await page.getByRole('button', { name: /SYNC TO GOOGLE DRIVE/ }).click();
    await page.waitForFunction(() => /Synced to Drive|failed/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    t = await page.locator('body').innerText();
    ok(/✅ Synced to Drive → .*nikhil-world-backup-2026-10-04-AKDT\.json" · \d+ items · \d+\.\d\d MB/.test(t) && drive.some(d => d.m === 'POST' && /uploadType=multipart/.test(d.url)) && !drive.some(d => /uploadType=resumable/.test(d.url)), 'C: Sync to Drive under 4.5 MB → multipart upload, confirmed; status shows the file, items and MB');
    drive.length = 0;
    await page.evaluate(() => window.__fakeDocs.set('big_doc', { key: 'big:doc', value: 'x'.repeat(5 * 1024 * 1024) }));
    await page.getByRole('button', { name: /SYNC TO GOOGLE DRIVE/ }).click();
    await page.waitForFunction(() => /Synced to Drive → .*MB/.test(document.body.innerText) && /[5-9]\.\d\d MB/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    t = await page.locator('body').innerText();
    const init = drive.find(d => d.m === 'POST' && /uploadType=resumable/.test(d.url));
    const put = drive.find(d => d.m === 'PUT');
    ok(init && JSON.parse(init.body).parents[0] === 'FOLDER1' && JSON.parse(init.body).name === 'nikhil-world-backup-2026-10-04-AKDT.json' && put && put.len > 5 * 1024 * 1024 && !drive.some(d => /uploadType=multipart/.test(d.url)) && /✅ Synced to Drive/.test(t), 'C: over 4.5 MB → resumable: POST metadata, PUT the content to the Location URL, confirmed');
    ok(ctx.errors.length === 0, 'C: no console errors' + (ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''));
    await ctx.browser.close();
  }

  console.log('\n[C: Firestore unreadable → this device only, tokens excluded]');
  {
    const ctx = await openPage({ seed: F.base(), now: '2026-10-04T12:00:00' });
    const { page } = ctx;
    await page.waitForTimeout(3000);
    const g = await page.evaluate(async () => {
      localStorage.setItem('gdrive_token_v1', JSON.stringify({ token: 'SECRET-TOKEN', expiresAt: 1 }));
      localStorage.setItem('firebase:authUser', 'fb-internal');
      localStorage.setItem('__nwInternal', 'internal');
      localStorage.setItem('someApiToken', 'SECRET-2');
      localStorage.setItem('kaizen3:tasks', '[3]');
      localStorage.setItem('practice:log:2026_10_04', '{"entries":[]}');
      return (await window.nwGatherBackup()).backup;
    });
    const keys = g.entries.map(e => e.key);
    ok(g.format === 3 && g.source === 'this-device' && g.entries.some(e => e.key === 'kaizen3:tasks' && JSON.stringify(e.value) === '[3]') && keys.includes('practice:log:2026_10_04'), 'C: fallback uses every key on this device');
    ok(!keys.some(k => /token|^firebase|^__/i.test(k)) && !JSON.stringify(g).includes('SECRET'), 'C: the Drive token, Firebase and internal keys are left out');
    await page.getByRole('button', { name: 'System', exact: true }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /DOWNLOAD BACKUP/ }).click()]);
    ok(dl.suggestedFilename() === 'nikhil-world-backup-2026-10-04-AKDT-this-device.json', 'C: a device-only download gets its own file name → ' + dl.suggestedFilename());
    await page.waitForTimeout(200);
    const t = await page.locator('body').innerText();
    ok(/Backup downloaded ✅ · \d+ items · \d+\.\d\d MB · The database couldn't be read, so only this device's copy was used\./.test(t), "C: status says only this device's copy was used");
    ok(ctx.errors.length === 0, 'C fallback: no console errors' + (ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''));
    await ctx.browser.close();
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '2') await step2();
  if (which === 'all' || which === '3') await step3();
  if (which === 'all' || which === '4') await step4();
  if (which === 'all' || which === '5') await step5();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
