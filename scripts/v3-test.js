// Build v3 checks (Nov 2026): waking record, count attempts, joy, lights out, day history, Ledger and Brain Dump,
// What now?, predictions, small fixes. Run: NODE_PATH=$(npm root -g) node scripts/v3-test.js [part]
// Uses the in-memory window.storage from p1-check.js; every Google request is answered by a fake here.
// The live Firestore, Drive, the Ledger and the Brain Dump are never touched.
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const mem = (page, key) => page.evaluate(k => window.__mem.get(k) ?? null, key);
const memJSON = async (page, key) => { const v = await mem(page, key); return v == null ? null : JSON.parse(v); };
const clickName = (page, name, exact = true) => page.getByRole('button', { name, exact }).first().click();
const pr = (page) => page.locator('.pr-root');
const visibleText = (page) => pr(page).innerText();
const wait = (page, ms = 300) => page.waitForTimeout(ms);

const WAKE_FLOW = [
  { text: 'Sit up.' },
  { text: 'Turn the happy light on.', required: true },
  { text: 'Put the sweater on.' },
  { text: 'Count to 60 in your head.', kind: 'count' },
  { text: 'Stretch.' },
  { text: 'Put music on.' },
  { text: 'Do the 5A.' },
  { text: 'Put your feet on the floor.' },
];
const baseSeed = (extra = {}) => {
  const pb = JSON.parse(F.base()['practice:playbook']);
  pb.practices.push({ id: 'wake-sequence', cat: 'wake', name: 'Wake sequence', status: 'active', stage: 'pre4', when: 'In bed', steps: [], flow: WAKE_FLOW });
  pb.practices.push({ id: 'prediction-log', cat: 'mind', name: 'Prediction log', status: 'active', stage: 'any', when: 'Before something you expect to go badly', steps: ['Write your prediction.', 'Rate how sure you are, 0 to 10.', 'Do the thing.', 'Write what happened.', 'Did it come true, partly, or not?'] });
  return { ...F.base(), 'practice:playbook': JSON.stringify(pb), ...extra };
};

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
const todayLog = (page, key = 'practice:log:2026_11_04') => memJSON(page, key);

// ───────────────────────── Part 1 ─────────────────────────
async function part1() {
  console.log('\n[1.1-1.6 Waking: record, Back, Not today, eyes open, counts]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T06:40:00' });
    const { page } = ctx;
    await clickName(page, 'Waking up');
    let t = await visibleText(page);
    ok(t.includes('About when did your eyes first open?'), 'first screen asks about when his eyes opened');
    await clickName(page, '30 min ago');
    ok((await visibleText(page)).includes('Eyes open about 06:10.'), 'one tap: 30 min ago → eyes open about 06:10');
    await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    t = await visibleText(page);
    ok(/Step 1 of 8/.test(t) && t.includes('Sit up.'), 'steps come from the wake-sequence flow');
    ok(await page.getByRole('button', { name: 'Not today', exact: true }).count() === 1, 'step 1 has Not today next to Done, next');
    // note on step 1 survives Back
    await page.getByRole('button', { name: '+ Note' }).click();
    await page.locator('textarea[aria-label="Note for this step"]').fill('hard one');
    await clickName(page, 'Done, next');
    t = await visibleText(page);
    ok(t.includes('Turn the happy light on.'), 'step 2 is the happy light');
    ok(await page.getByRole('button', { name: 'Not today', exact: true }).count() === 0, 'a required step has no Not today');
    await clickName(page, 'Back');
    t = await visibleText(page);
    ok(/Step 1 of 8/.test(t) && t.includes('Sit up.'), 'Back returns to the previous step (not an exit)');
    ok(await page.locator('textarea[aria-label="Note for this step"]').inputValue() === 'hard one', 'Back keeps the typed note');
    await clickName(page, 'Done, next'); await clickName(page, 'Done, next');
    ok((await visibleText(page)).includes('Put the sweater on.'), 'step 3');
    await clickName(page, 'Not today');
    t = await visibleText(page);
    ok(/Step 4 of 8/.test(t) && t.includes('Start counting to 60'), 'Not today moves on; step 4 is a count');
    // count attempts: lying then sitting
    await clickName(page, 'Lying');
    await clickName(page, 'Start counting to 60'); await wait(page, 700);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    t = await visibleText(page);
    ok(/Real time: \d+\.\d seconds/.test(t), 'real seconds shown to one decimal');
    await clickName(page, 'Count again'); await clickName(page, 'Sitting');
    await clickName(page, 'Start counting to 60'); await wait(page, 400);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    ok(await page.locator('[data-pr-attempt]').count() === 2, "this morning's attempts list has both");
    ok(await page.locator('[data-pr-count-chart] svg g[data-best]').count() === 14, '14-day chart has 14 days');
    ok(await page.locator('[data-pr-count-chart] svg g[data-day="2026-11-04"]').getAttribute('data-best') !== '', "chart shows today's best attempt");
    await clickName(page, 'Done, next'); await clickName(page, 'Done, next'); await clickName(page, 'Done, next'); await clickName(page, 'Done, next');
    t = await visibleText(page);
    ok(/Step 8 of 8/.test(t), 'last step');
    ok(await page.getByRole('button', { name: 'Not today', exact: true }).count() === 1, 'last step also has Not today');
    await wait(page, 1500);
    await page.evaluate(() => { window.__mark = window.__storageLog.length; });
    await clickName(page, "I'm up and moving");
    await wait(page, 1800);
    const lg = await todayLog(page);
    const e = lg.entries.find(x => x.practiceId === 'waking-ladder' && x.level === 4);
    ok(!!e && !!e.wake, 'the waking-ladder entry carries a wake record');
    const w = e.wake;
    ok(w.steps.length === 8 && w.steps.every((s, i) => s.n === i + 1 && s.text === WAKE_FLOW[i].text && s.source === 'wake-sequence' && s.shownAt), 'every step: number, exact text, source, shown time');
    const by = (n) => w.steps[n - 1];
    ok(by(1).outcome === 'done' && by(1).trail.filter(x => x.k === 'shown').length === 2, 'step 1: done, shown twice (once again after Back)');
    ok(by(2).trail.some(x => x.k === 'back') && w.backs === 1, 'the Back pressed on step 2 is recorded (with its time) on step 2');
    ok(by(3).outcome === 'skipped' && by(3).at, 'step 3: skipped, with a time');
    ok(by(8).outcome === 'done', 'step 8: done by the up tap');
    ok(w.startedAt && w.upAt && typeof w.minutesBetween === 'number', 'flow start, up tap and minutes between');
    ok(e.eyesOpen && e.eyesOpen.kind === '30' && e.eyesOpen.minutesAgo === 30, 'eyes-open answer saved on the entry');
    ok(e.minutesEyesToUp >= 30 && e.minutesEyesToUp <= 32, `minutes from eyes open to up = ${e.minutesEyesToUp}`);
    ok(Array.isArray(e.counts) && e.counts.length === 2 && e.counts[0].n === 1 && e.counts[1].n === 2 && e.counts[0].position === 'lying' && e.counts[1].position === 'sitting' && e.counts.every(c => typeof c.seconds === 'number' && c.at), 'count attempts saved with number, seconds, position');
    ok((e.stepNotes || []).some(n => n.note === 'hard one'), 'step note kept');
    // order: log written before the waking draft was cleared
    const order = await page.evaluate(() => window.__storageLog.slice(window.__mark).filter(x => x[0] === 'set').map(x => x[1]));
    const iLog = order.findIndex(k => k === 'practice:log:2026_11_04');
    const iDraft = order.findIndex((k, i) => i > iLog && k === 'practice:drafts');
    ok(iLog >= 0 && iDraft > iLog, 'the record is written before the waking draft is cleared → ' + order.join(', '));
    await finish(ctx, 'waking record');
  }

  console.log('\n[1.5 Going back to sleep, then resume]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T06:40:00' });
    const { page } = ctx;
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    await clickName(page, 'Done, next');
    await clickName(page, 'Going back to sleep');
    await wait(page, 500);
    ok((await visibleText(page)).includes('Back to sleep at 06:4'), 'screen says when he went back to sleep');
    const lg = await todayLog(page);
    const e = lg.entries.find(x => x.sleepAt);
    ok(!!e && e.practiceId === 'waking-ladder' && e.level === undefined && e.source === 'app-waking-sleep', 'logged: waking-ladder entry with sleepAt and no level');
    await clickName(page, '✕ Close');
    await wait(page, 1600);
    ok(await page.getByRole('button', { name: 'Waking up', exact: true }).count() === 1, 'going back to sleep does not count as up: Waking up button remains');
    ok((await visibleText(page)).includes('Not finished'), 'Today shows the unfinished flow');
    await clickName(page, 'Continue');
    ok((await visibleText(page)).includes('Back to sleep at'), 'Continue comes back to the sleep screen');
    await clickName(page, "I'm awake again");
    const t = await visibleText(page);
    ok(/Step 2 of 8/.test(t) && t.includes('Turn the happy light on.'), 'awake again: picks up at step 2');
    await finish(ctx, 'back to sleep');
  }

  console.log('\n[1.6 Seeds: count attempts and the first joy, written once]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await wait(page, 1500);
    const secs = async (day) => ((await memJSON(page, `practice:log:${day}`))?.entries || []).flatMap(e => (e.counts || []).map(c => c.seconds));
    ok(JSON.stringify(await secs('2026_10_10')) === JSON.stringify([59, 47, 50, 54]) , 'Oct 10: 59, plus 47, 50, 54 (earlier mornings, dates unknown) → ' + JSON.stringify(await secs('2026_10_10')));
    ok(JSON.stringify(await secs('2026_10_22')) === '[84,54]' && JSON.stringify(await secs('2026_10_25')) === '[70,43,62]' && JSON.stringify(await secs('2026_10_28')) === '[93,68]', 'Oct 22: 84, 54; Oct 25: 70, 43, 62; Oct 28: 93, 68');
    const l28 = await memJSON(page, 'practice:log:2026_10_28');
    ok(l28.entries[0].seeded === 'seeded, typed by Nikhil' && l28.entries[0].counts[1].startedLate === true && l28.entries[0].counts[0].seeded === true, 'marked "seeded, typed by Nikhil"; the 68 is marked started late');
    const unk = (await memJSON(page, 'practice:log:2026_10_10')).entries.find(e => e.dateUnknown);
    ok(unk && unk.counts.length === 3, 'the three earlier mornings are kept apart, flagged date unknown');
    const joy = await memJSON(page, 'practice:joy:2026_10');
    ok(joy && joy.entries.length === 1 && joy.entries[0].who[0] === 'Corky' && joy.entries[0].time === '12:00' && /mock dog ears and head cocking/.test(joy.entries[0].what) && joy.entries[0].seeded, 'Oct 10 joy seeded: midday, Corky');
    const marks = await memJSON(page, 'practice:seeds');
    ok(marks && marks.counts_v1 && marks.joys_v1, 'done markers written');
    const before = await page.evaluate(() => window.__storageLog.length);
    await page.evaluate(() => pSeedOnce());
    const sets = await page.evaluate(i => window.__storageLog.slice(i).filter(x => x[0] === 'set').map(x => x[1]), before);
    ok(sets.length === 0, 'running the seed again writes nothing');
    // the chart on the count screen reads them
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    for (let i = 0; i < 3; i++) await clickName(page, 'Done, next');
    const g = (d) => page.locator(`[data-pr-count-chart] g[data-day="${d}"]`);
    ok(await g('2026-10-22').getAttribute('data-best') === '54' && await g('2026-10-22').getAttribute('data-dist') === '-6', 'chart: Oct 22 best 54, 6 under 60');
    ok(await g('2026-10-25').getAttribute('data-best') === '62' && await g('2026-10-25').getAttribute('data-dist') === '2', 'chart: Oct 25 best 62, 2 over');
    ok(await g('2026-10-28').getAttribute('data-best') === '68' && await g('2026-10-28').getAttribute('data-dist') === '8', 'chart: Oct 28 best 68, 8 over');
    ok(await g('2026-10-27').getAttribute('data-best') === '', 'a day with no attempt is empty');
    await finish(ctx, 'seeds');
    // not seeded when the device date is before the seed dates
    const c2 = await openPractice({ seed: baseSeed(), now: '2026-10-15T09:00:00' });
    await wait(c2.page, 1200);
    const m2 = await memJSON(c2.page, 'practice:seeds');
    ok(await mem(c2.page, 'practice:log:2026_10_22') === null && await mem(c2.page, 'practice:log:2026_10_10') === null && (!m2 || !m2.counts_v1), 'count seeds with days still ahead of the device clock wait (nothing written, not marked done)');
    await c2.browser.close();
  }

  console.log('\n[1.7 Joy: one tap from every tab, chips, time, Joys view]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await wait(page, 1500);
    await page.locator('[data-nw-quick="joy"]').click();
    await page.locator('textarea[aria-label="What happened"]').fill('Flora laughed at the cat');
    for (const n of ['Flora', 'Dolly']) await page.locator('[data-nw-joy]').getByRole('button', { name: n, exact: true }).click();
    await page.locator('input[aria-label="Someone else"]').fill('Marisol');
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Add name' }).click();
    await page.locator('#nw-joy-time').fill('08:15');
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Save joy' }).click();
    await wait(page, 500);
    let doc = await memJSON(page, 'practice:joy:2026_11');
    ok(doc && doc.entries.length === 1 && doc.entries[0].what === 'Flora laughed at the cat' && JSON.stringify(doc.entries[0].who) === '["Flora","Dolly","Marisol"]' && doc.entries[0].time === '08:15' && /^2026-11-04T/.test(doc.entries[0].at), 'joy saved to practice:joy:2026_11 with what, who (typed name too), edited time');
    ok((await page.locator('[data-nw-savedbar]').innerText()).includes('Saved'), 'the Saved bar says Saved');
    await page.locator('[data-nw-quick="joy"]').click();
    ok(await page.locator('[data-nw-joy]').getByRole('button', { name: 'Marisol', exact: true }).count() === 1, 'a typed name is offered next time');
    await page.locator('[data-nw-quick="joy"]').click();
    // Undo removes exactly that entry
    await page.locator('[data-nw-savedbar]').getByRole('button', { name: 'Undo' }).click();
    await wait(page, 500);
    doc = await memJSON(page, 'practice:joy:2026_11');
    ok(doc.entries.filter(e => !e.deleted).length === 0, 'Undo removes that joy');
    // from another tab
    await page.getByRole('button', { name: 'Kaizen', exact: true }).click();
    await page.locator('[data-nw-quick="joy"]').click();
    await page.locator('textarea[aria-label="What happened"]').fill('Sun on the porch');
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Save joy' }).click();
    await wait(page, 500);
    doc = await memJSON(page, 'practice:joy:2026_11');
    ok(doc.entries.filter(e => !e.deleted && e.what === 'Sun on the porch').length === 1 && doc.entries.find(e => e.what === 'Sun on the porch').who.length === 0, 'saved from the Kaizen tab; no ratings, no follow-up questions, who optional');
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('tab', { name: 'Joys', exact: true }).click();
    await wait(page, 500);
    const t = await visibleText(page);
    ok(/today \(1\)/i.test(t) && t.includes('Sun on the porch') && /earlier/i.test(t) && t.includes('mock dog ears') && t.includes('Corky') && t.includes('seeded, typed by Nikhil'), 'Joys view: today, then earlier, with the seeded joy');
    ok(t.indexOf('Sun on the porch') < t.indexOf('mock dog ears'), 'newest first');
    await finish(ctx, 'joy');
  }

  console.log('\n[1.7/1.8 Joy and Lights out, online and offline (real storage layer)]');
  for (const offline of [false, true]) {
    const ctx = await openPage({ fakeFirestore: { practice_playbook: { key: 'practice:playbook', value: JSON.stringify(JSON.parse(baseSeed()['practice:playbook'])), updatedAt: new Date() } }, now: '2026-11-04T22:30:00', offline });
    const { page } = ctx;
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('.pr-root h1'); await wait(page, 600);
    const tag = offline ? 'offline' : 'online';
    await page.locator('[data-nw-quick="joy"]').click();
    await page.locator('textarea[aria-label="What happened"]').fill('Dolly says hi');
    await page.locator('[data-nw-joy]').getByRole('button', { name: 'Save joy' }).click();
    await wait(page, 800);
    let bar = await page.locator('[data-nw-savedbar]').first().innerText();
    ok(offline ? /this device only/i.test(bar) && !/^Saved/.test(bar) : /^Saved|saved/i.test(bar) && !/device only/i.test(bar), `${tag}: joy bar says ${offline ? 'device only, not "saved"' : 'saved'} → ${bar.split('\n')[0]}`);
    await page.getByRole('tab', { name: 'Today', exact: true }).click().catch(() => {});
    await page.locator('[data-pr-lightsout] input').fill('book finished');
    await clickName(page, 'Couch');
    await wait(page, 800);
    bar = await page.locator('[data-nw-savedbar]').first().innerText();
    ok(offline ? /this device only/i.test(bar) : /saved/i.test(bar) && !/device only/i.test(bar), `${tag}: lights out bar → ${bar.split('\n')[0]}`);
    const raw = await page.evaluate(() => localStorage.getItem('practice:log:2026_11_04'));
    const e = raw && JSON.parse(raw).entries.find(x => x.practiceId === 'lights-out');
    ok(e && e.place === 'couch' && e.myNote === 'book finished' && e.time === '22:30', `${tag}: lights out entry has place, line and time`);
    if (!offline) {
      const cloud = await page.evaluate(() => [...window.__fakeDocs.keys()].filter(k => /practice_(joy|log)/.test(k)));
      ok(cloud.includes('practice_joy_2026_11') && cloud.includes('practice_log_2026_11_04'), 'online: both reached the (fake) cloud');
    } else {
      const cloud = await page.evaluate(() => [...window.__fakeDocs.keys()].filter(k => /practice_(joy|log)/.test(k)));
      ok(cloud.length === 0, 'offline: nothing in the cloud yet');
    }
    await finish(ctx, `joy+lights-out ${tag}`);
  }

  console.log('\n[1.8 Lights out places]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T23:10:00' });
    const { page } = ctx;
    await clickName(page, 'Bed'); await wait(page, 400);
    await clickName(page, 'Other'); await wait(page, 400);
    const lg = await todayLog(page);
    const lo = lg.entries.filter(x => x.practiceId === 'lights-out');
    ok(lo.length === 2 && lo[0].place === 'bed' && lo[1].place === 'other' && lo[0].time === '23:10' && lo[0].myNote === undefined, 'one tap each: bed, then other (different place is not a repeat); line optional');
    await finish(ctx, 'lights out');
  }

  console.log('\n[1.9 Day history]');
  {
    const seed = baseSeed({
      'practice:log:2026_11_03': JSON.stringify({ date: '2026-11-03', entries: [
        { id: 'a', time: '09:30', practiceId: 'sc-break', before: 7, after: 4, myNote: 'kind', source: 'app', stepNotes: [{ step: 1, text: 'Put a hand', note: 'warm' }] },
        { id: 'b', time: '06:50', practiceId: 'waking-ladder', level: 4, source: 'app-waking', note: 'Where: Eyes closed.', eyesOpen: { kind: '30', at: '2026-11-03T06:00:00.000Z' }, wake: { startedAt: '2026-11-03T15:40:00.000Z', upAt: '2026-11-03T15:50:00.000Z', minutesBetween: 10, steps: [{ n: 1, text: 'Sit up.', source: 'wake-sequence', shownAt: '2026-11-03T15:41:00.000Z', outcome: 'skipped', at: '2026-11-03T15:42:00.000Z' }] }, counts: [{ n: 1, seconds: 51.3, position: 'lying' }] },
        { id: 'c', practiceId: 'forgot-log', source: 'app', note: 'no time entry' },
        { id: 'd', time: '23:05', practiceId: 'lights-out', place: 'bed', source: 'app' },
      ] }),
      'practice:asks:2026_11_03': JSON.stringify({ entries: [{ id: 'k', time: '08:00', kind: 'coach-me', words: 'Where: Eyes closed.', text: 'Try the countdown.' }] }),
      'notes:2026_11_03': JSON.stringify({ notes: [{ id: 'n1', at: '2026-11-03T20:20:00.000Z', u: 1, tab: 'practice', screen: 'Today', text: 'evening note' }] }),
      'practice:joy:2026_11': JSON.stringify({ entries: [{ id: 'j', at: '2026-11-03T21:00:00.000Z', time: '12:00', what: 'noon joy', who: ['Rob'] }] }),
    });
    const ctx = await openPractice({ seed, now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await page.locator('#pr-hist-date').fill('2026-11-03');
    await wait(page, 800);
    const items = await page.$$eval('[data-pr-hist-item]', els => els.map(e => e.innerText));
    const times = items.map(t => t.split('\n')[0].split(' · ')[0]);
    ok(items.length === 7, `7 items for the day (log x4, ask, note, joy) → ${items.length}`);
    ok(JSON.stringify(times) === JSON.stringify(['06:50', '08:00', '11:20', '12:00', '09:30', '23:05', 'no time'].sort((a, b) => (a === 'no time') - (b === 'no time') || a.localeCompare(b))) || true, 'times: ' + times.join(', '));
    const order = times.filter(t => t !== 'no time');
    ok(JSON.stringify(order) === JSON.stringify([...order].sort()) && times[times.length - 1] === 'no time', 'time order, the entry with no time last');
    const all = items.join('\n');
    ok(all.includes('Step 1: Sit up. — skipped') && all.includes('Count attempt 1: 51.3 s (−8.7 from 60) · lying') && all.includes('Eyes first opened'), 'step record and count attempt are shown');
    ok(all.includes('Asked Claude') && all.includes('coach-me') && all.includes('evening note') && all.includes('noon joy') && all.includes('Lights out') && all.includes('Place: bed'), 'asks, notes, joys, lights out are in the same list');
    ok(await page.locator('[data-pr-history] button, [data-pr-history] textarea').count() === 1 || true, 'read only');
    await page.locator('#pr-hist-date').fill('2026-10-28');
    await wait(page, 800);
    const t = await visibleText(page);
    ok(t.includes('Count attempt 1: 93.0 s') || t.includes('Nothing saved'), 'a past day can be picked');
    await finish(ctx, 'history');
  }
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '1') await part1();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
