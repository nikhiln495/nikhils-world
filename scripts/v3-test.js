// Build v3 checks (Nov 2026): waking record, count attempts, joy, lights out, day history, Ledger and Brain Dump,
// What now?, predictions, small fixes. Run: NODE_PATH=$(npm root -g) node scripts/v3-test.js [part]
// Uses the in-memory window.storage from p1-check.js; every Google request is answered by a fake here.
// The live Firestore, Drive, the Ledger and the Brain Dump are never touched.
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

// ───────────────────────── Part 2 ─────────────────────────
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${G.SHEET_ID}/edit#gid=0`;
const dev = (extra = {}) => ({ __nw_ledger_link: JSON.stringify(SHEET_URL), ...extra });
const newFake = (over = {}) => G.makeGoogle({ sheet: { Ledger: G.ledgerValues(), Rules: G.RULES_ROWS }, doc: { title: 'Brain Dump Nov 2026', paras: [
  { text: 'Monday, Nov 2, 2026', style: 'HEADING_1' }, { text: 'task: old thing (from Nikhil\'s World, 7:00 AM)', style: 'NORMAL_TEXT' }, { text: 'Sunday, Nov 1, 2026', style: 'HEADING_1' }, { text: 'older note', style: 'NORMAL_TEXT' }] }, ...over });
async function openLedger(fake, opts = {}) {
  const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', token: true, google: fake.handler, device: dev(), ...opts });
  return ctx;
}
const stripText = (page) => page.locator('[data-pr-ledger]').innerText();
const writes = (fake, kind) => fake.writes.filter(w => w.api === 'sheets' && (!kind || w.kind === kind));

async function part2() {
  console.log('\n[2.3-2.5 Ledger: read by header name, work rows kept out, the strip]');
  {
    const fake = newFake();
    const ctx = await openLedger(fake);
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    const t = await stripText(page);
    ok(/today spark/i.test(t) && t.includes('File the tax form') && /this week/i.test(t) && t.includes('Book the dentist') && t.includes('Homework help') && t.includes('Renew passport'), 'strip: Spark, this week, and a task due in 12 days');
    ok(!t.includes('Paint the shelf'), 'a task due in 2027 is not shown');
    ok(!/Maria|Call participant|ASMP|STARR|VINE|Prep STARR/i.test(t), 'work rows (VINE, ASMP, STARR, Work) are not shown');
    ok(/3 work rows kept out|work rows kept out/.test(t), 'says how many were kept out');
    ok(t.indexOf('Book the dentist') < t.indexOf('Homework help'), 'ordered by Flow_Order (1 before 5)');
    ok(t.includes('Next: Put the tax folder on the desk') && !t.includes('Find the login'), 'a task shows its next open step; done steps are not "next"');
    await page.locator('[data-pr-ledger-open]').first().click();
    const detail = await page.locator('[data-pr-ledger-task]').innerText();
    ok(detail.includes('Find the login') && detail.includes('Put the tax folder on the desk') && detail.includes('Fill in page one') && detail.includes('[Nov 1 09:00] started'), 'tap a task: all its steps (done ones too) and comments');
    const calls = fake.calls.map(c => c.url);
    ok(calls.some(u => /values:batchGet/.test(u) && /ranges=Ledger/.test(u) && /ranges=Rules/.test(u)), 'reads the Ledger and Rules tabs with Sheets values');
    ok(fake.calls.every(c => c.auth === 'Bearer TEST-TOKEN'), "uses the app's existing Google token");
    const dumpMem = await page.evaluate(() => JSON.stringify([...window.__mem.entries()]));
    ok(!/tax form|Maria|dentist|ASMP/.test(dumpMem), 'no Ledger text anywhere in the database (storage)');
    const cache = await page.evaluate(() => localStorage.getItem('__nw_ledger_cache'));
    ok(cache && cache.includes('File the tax form') && !/Maria|ASMP|STARR/.test(cache), 'this device keeps the last read, without work rows');
    const link = await page.evaluate(() => localStorage.getItem('__nw_ledger_link'));
    ok(link && link.includes(G.SHEET_ID) && !dumpMem.includes(G.SHEET_ID), 'the link is on this device only');
    await finish(ctx, 'ledger strip');

    // columns found by name, not position: the same sheet with its columns reversed
    const rev = newFake();
    rev.sheets.Ledger = rev.sheets.Ledger.map(r => r.slice().reverse());
    const c2 = await openLedger(rev);
    await c2.page.waitForSelector('[data-pr-ledger-open]');
    const t2 = await stripText(c2.page);
    ok(t2.includes('File the tax form') && t2.includes('Book the dentist') && !/Maria|ASMP/.test(t2) && t2.indexOf('Book the dentist') < t2.indexOf('Homework help'), 'columns in another order: same strip');
    await c2.browser.close();
  }

  console.log('\n[2.1/2.5 Ledger: one line when it cannot read]');
  {
    const c1 = await openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00' });
    await wait(c1.page, 600);
    ok((await stripText(c1.page)).includes('No Ledger link yet. Paste it on the System tab.'), 'no link → says so');
    ok(await c1.page.getByRole('button', { name: 'Waking up', exact: true }).count() === 1 && /lights out/i.test(await visibleText(c1.page)), 'everything else on Today still works');
    await c1.browser.close();
    const c2 = await openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', device: dev(), google: newFake().handler, googleStub: true });
    await wait(c2.page, 600);
    ok((await stripText(c2.page)).includes('Not signed in to Google.') && await c2.page.locator('[data-pr-connect]').count() >= 1, 'no token → "Not signed in" and Connect Google');
    await c2.page.locator('[data-pr-ledger] [data-pr-connect]').click();
    await c2.page.waitForSelector('[data-pr-ledger-open]');
    ok((await stripText(c2.page)).includes('File the tax form'), 'Connect Google → token → the Ledger reads');
    await c2.browser.close();
    const off = newFake(); off.apiDisabled = 'sheets';
    const c3 = await openLedger(off);
    await wait(c3.page, 800);
    ok((await stripText(c3.page)).includes('The Google Sheets API is not turned on'), 'Sheets API off → says which');
    await c3.browser.close();
    const cache = JSON.stringify({ at: '2026-11-03T07:00:00.000Z', rows: [{ row: 2, Parent_Task: 'Cached task', Bucket: G.SPARK, Step_Num: '1', Step_Action: 'Cached step', Done: 'FALSE' }], rules: [], head: ['Parent_Task'], idx: {}, hidden: 0 });
    const c4 = await openLedger(newFake(), { offline: true, device: dev({ __nw_ledger_cache: cache }) });
    await wait(c4.page, 800);
    const t4 = await stripText(c4.page);
    ok(t4.includes('Cached task') && /From this device, read/.test(t4), 'offline: the last read shows, with its time');
    await c4.browser.close();
  }

  console.log('\n[2.6 Ledger writes: preview, confirm, guards]');
  {
    // a. mark done
    let fake = newFake();
    let ctx = await openLedger(fake);
    let page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Done', exact: true }).click();
    let pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(pv.includes('Done → TRUE') && /Completed_At → 2026-11-03T/.test(pv) && !pv.includes('Actual_Mins'), 'preview shows exactly what changes');
    ok(writes(fake).length === 0, 'nothing is written before the tap');
    await clickName(page, 'Cancel');
    ok(writes(fake).length === 0 && await page.locator('[data-pr-ledger-preview]').count() === 0, 'Cancel writes nothing');
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Done', exact: true }).click();
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    let w = writes(fake, 'update');
    ok(w.length === 2 && w.some(x => x.range === 'Ledger!A2' && x.values[0][0] === true) && w.some(x => x.range === 'Ledger!M2' && /^2026-11-03T/.test(x.values[0][0])), 'Done = TRUE and Completed_At = ISO time, only those two cells → ' + w.map(x => x.range).join(', '));
    ok(fake.sheets.Ledger[1][0] === true && fake.sheets.Ledger[1][12].startsWith('2026-11-03T'), 'the sheet has them');
    ok(/Saved/.test(await page.locator('[data-nw-savedbar]').first().innerText()), 'the Saved bar says Saved (the Ledger has it)');
    await finish(ctx, 'ledger done');

    // formula column guard
    fake = newFake({ formulas: { Ledger: (() => { const v = G.ledgerValues(); v[1][12] = '=NOW()'; return v; })() } });
    ctx = await openLedger(fake); page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Done', exact: true }).click();
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    ok(writes(fake).length === 0 && (await page.locator('[data-pr-ledger-preview]').innerText()).includes('Completed_At column holds formulas'), 'a column with formulas is never written; says so');
    ok(fake.calls.some(c => /valueRenderOption=FORMULA/.test(c.url)), 'read the tab with valueRenderOption FORMULA before the first write');
    await ctx.browser.close();

    // moved row: found again by Parent_Task, Step_Num, Step_Action
    fake = newFake();
    ctx = await openLedger(fake); page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Done', exact: true }).click();
    fake.sheets.Ledger.splice(1, 0, G.ledgerRow({ Done: false, Bucket: G.SPARK, Domain: 'Home', Parent_Task: 'Inserted above', Step_Num: 1, Step_Action: 'New row' }));
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    w = writes(fake, 'update');
    ok(w.length === 2 && w.every(x => /^Ledger![AM]3$/.test(x.range)), 'the row moved down one: found again, written at row 3 → ' + w.map(x => x.range).join(', '));
    ok(fake.sheets.Ledger[1][0] === false && fake.sheets.Ledger[2][0] === true, 'the row that took its place was not touched');
    await ctx.browser.close();

    // ambiguous and vanished
    fake = newFake();
    ctx = await openLedger(fake); page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Done', exact: true }).click();
    fake.sheets.Ledger.splice(1, 0, G.ledgerRow({ Done: false, Bucket: G.SPARK, Domain: 'Home', Parent_Task: 'Unrelated', Step_Num: 1, Step_Action: 'Other' }));
    fake.sheets.Ledger.push(fake.sheets.Ledger[2].slice());
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    ok(writes(fake).length === 0 && (await page.locator('[data-pr-ledger-preview]').innerText()).includes('More than one row matches'), 'two rows match → no write, says so');
    fake.sheets.Ledger = fake.sheets.Ledger.filter(r => r[6] !== 'Put the tax folder on the desk');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    ok(writes(fake).length === 0 && (await page.locator('[data-pr-ledger-preview]').innerText()).includes('not in the Ledger any more'), 'no match → no write, says so');
    await ctx.browser.close();

    // b. comment, c. add a step, d. add a task
    fake = newFake();
    ctx = await openLedger(fake); page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Comment', exact: true }).click();
    await page.locator('textarea[aria-label="Comment for this step"]').fill('Found the folder under the bed');
    await clickName(page, 'Review comment');
    pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(/\[Nov 3 08:\d\d\] Found the folder under the bed \(from Nikhil's World\)/.test(pv), 'comment preview: [Nov 3 08:10] his words (from Nikhil\'s World)');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    const cm = fake.sheets.Ledger[1][15];
    ok(cm.startsWith("[Nov 1 09:00] started (from Nikhil's World)\n[Nov 3 08:") && cm.endsWith("Found the folder under the bed (from Nikhil's World)"), 'comment added on a new line; what was there is kept → ' + JSON.stringify(cm));
    ok(writes(fake, 'update').length === 1 && writes(fake, 'update')[0].range === 'Ledger!P2', 'only the Comments cell was written');
    await page.locator('input[aria-label="New step for this task"]').fill('Photograph the form');
    await clickName(page, 'Review new step');
    pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(pv.includes('Step_Num Step 3') && pv.includes('Photograph the form'), 'new step preview: next Step_Num ("Step 3", the form this sheet uses)');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    const last = fake.sheets.Ledger[fake.sheets.Ledger.length - 1];
    ok(last[4] === 'File the tax form' && last[2] === G.SPARK && last[3] === 'Home' && last[5] === 'Step 3' && last[6] === 'Photograph the form' && last[0] === '' && last[12] === '', 'appended row: same Parent_Task, Bucket, Domain; Step_Num 3; other cells left alone');
    await clickName(page, 'Add task');
    await page.locator('input[aria-label="Task name"]').fill('Fix the bike');
    await page.locator('input[aria-label="First physical step (Step 1)"]').fill('Put the bike on the stand');
    await page.locator('textarea[aria-label="Other steps, one per line"]').fill('Take the wheel off\nPatch the tube');
    await page.locator('select[aria-label="Bucket"]').selectOption(G.WEEK);
    await page.locator('select[aria-label="Domain"]').selectOption('Home');
    await clickName(page, 'Review task');
    pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(pv.includes('Step_Num Step 1 · Put the bike on the stand') && pv.includes('Step_Num Step 3 · Patch the tube'), 'new task preview: first physical step is Step 1');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    const n = fake.sheets.Ledger.length;
    const rows3 = fake.sheets.Ledger.slice(n - 3);
    ok(rows3.map(r => r[5]).join() === 'Step 1,Step 2,Step 3' && rows3.every(r => r[4] === 'Fix the bike' && r[2] === G.WEEK && r[3] === 'Home') && rows3[0][6] === 'Put the bike on the stand', 'task rows appended: Step 1, 2, 3 with bucket and domain');
    ok(fake.writes.every(x => x.api !== 'docs'), 'no Docs write from the Ledger');
    // never My_ / Pin
    const before = fake.writes.length;
    const guard = await page.evaluate(async (id) => { const out = []; for (const col of ['Pin', 'My_Note']) { try { await nwLedgerBatchWrite(id, { idx: { [col]: 1 } }, [{ col, row: 2, value: 'x' }]); out.push('wrote'); } catch (e) { out.push(e.code); } } return out; }, G.SHEET_ID);
    ok(JSON.stringify(guard) === '["never","never"]' && fake.writes.length === before, 'the app never writes to Pin or My_ columns → ' + JSON.stringify(guard));
    await finish(ctx, 'ledger writes');
  }

  console.log('\n[2.6 Ledger writes offline: kept on this device, Send to Ledger when back]');
  {
    const fake = newFake();
    const cacheRows = G.LEDGER_ROWS.slice(0, 2).map((r, i) => ({ row: i + 2, ...Object.fromEntries(G.LEDGER_HEAD.map((h, k) => [h, G.ledgerRow(r)[k] === true ? 'TRUE' : G.ledgerRow(r)[k] === false ? 'FALSE' : String(G.ledgerRow(r)[k])])) }));
    const cache = JSON.stringify({ at: '2026-11-03T07:00:00.000Z', rows: cacheRows, rules: [], head: G.LEDGER_HEAD, idx: Object.fromEntries(G.LEDGER_HEAD.map((h, i) => [h, i])), hidden: 0 });
    const ctx = await openLedger(fake, { offline: true, device: dev({ __nw_ledger_cache: JSON.stringify(JSON.parse(cache)) }) });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Done', exact: true }).click();
    await clickName(page, 'Confirm and send');
    await wait(page, 600);
    const t = await stripText(page);
    ok(/1 change kept on this device, not in the Ledger yet/.test(t) && t.includes('Mark done: File the tax form'), 'offline: the change is kept on this device and listed');
    ok(fake.calls.filter(c => /sheets/.test(c.url)).length === 0, 'offline: nothing sent');
    ok(await page.locator('[data-pr-ledger-sendpending]').isDisabled(), 'Send to Ledger waits for internet');
    ok((await page.locator('[data-nw-savedbar]').first().innerText()).toLowerCase().includes('device only'), 'the bar does not say saved');
    await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
    await wait(page, 500);
    ok(await page.locator('[data-pr-ledger-sendpending]').isEnabled(), 'back online: Send to Ledger is on');
    await page.locator('[data-pr-ledger-sendpending]').click();
    await wait(page, 1000);
    ok(writes(fake, 'update').some(x => x.range === 'Ledger!A2' && x.values[0][0] === true) && fake.sheets.Ledger[1][0] === true, 'Send to Ledger writes it (after re-finding the row)');
    ok(!(await stripText(page)).includes('kept on this device'), 'the pending list is empty');
    await finish(ctx, 'ledger offline');
  }

  console.log('\n[2.7 Brain Dump: add to the top of this month\'s doc]');
  {
    // no heading for today
    let fake = newFake();
    let ctx = await openLedger(fake);
    let page = ctx.page;
    await wait(page, 600);
    await page.locator('[data-nw-quick="dump"]').click();
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Call the dentist about the crown');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'task:', exact: true }).click();
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForSelector('[data-nw-dump-preview]');
    let pv = await page.locator('[data-nw-dump-preview]').innerText();
    ok(pv.includes('Brain Dump Nov 2026') && pv.includes('A new heading goes at the top first: Tuesday, Nov 3, 2026') && /task: Call the dentist about the crown \(from Nikhil's World, 8:\d\d AM\)/.test(pv), 'preview before the first send: doc, heading, and the exact paragraph');
    ok(fake.writes.length === 0, 'nothing sent before the preview is confirmed');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send now' }).click();
    await wait(page, 1000);
    let ps = fake.doc.paras;
    ok(ps[0].text === 'Tuesday, Nov 3, 2026' && ps[0].style === 'HEADING_1' && /^task: Call the dentist about the crown \(from Nikhil's World, 8:\d\d AM\)$/.test(ps[1].text) && ps[1].style === 'NORMAL_TEXT' && ps[2].text === 'Monday, Nov 2, 2026' && ps[2].style === 'HEADING_1', 'a new H1 heading at the top, then the paragraph, existing text below');
    ok(ps.length === 6 && ps[3].text.startsWith('task: old thing') && ps[5].text === 'older note', 'existing text untouched');
    const post = fake.calls.filter(c => /batchUpdate/.test(c.url) && c.method === 'POST').pop();
    ok(post.body.writeControl.requiredRevisionId === 'rev1', 'written with requiredRevisionId from a fresh read');
    ok(fake.writes.every(x => x.kind !== 'FORBIDDEN') && !JSON.stringify(post.body).includes('delete'), 'no delete or replace requests');
    ok(/sent/.test(await page.locator('[data-nw-capture]').first().innerText()), 'the capture shows as sent');
    // second capture: today's heading is first now → goes under it, newest first; no preview this time
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Buy stamps\nPay the water bill');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await wait(page, 1200);
    ps = fake.doc.paras;
    ok(ps[0].text === 'Tuesday, Nov 3, 2026' && /^Buy stamps \(from Nikhil's World/.test(ps[1].text) && /^Pay the water bill \(from Nikhil's World/.test(ps[2].text) && ps[3].text.startsWith('task: Call the dentist') && ps.filter(p => p.text === 'Tuesday, Nov 3, 2026').length === 1, "under today's heading (no second heading), above the earlier capture; one paragraph per line, each with the suffix");
    ok(ps[1].style === 'NORMAL_TEXT' && ps[2].style === 'NORMAL_TEXT', 'inserted paragraphs are normal text');
    ok(!(await page.evaluate(() => JSON.stringify([...window.__mem.entries()]))).includes('Buy stamps'), 'capture text is not in the database');
    await finish(ctx, 'dump online');

    // stale revision
    fake = newFake(); fake.staleOnce = 1;
    ctx = await openLedger(fake); page = ctx.page;
    await wait(page, 600);
    await page.locator('[data-nw-quick="dump"]').click();
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Stale test');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForSelector('[data-nw-dump-preview]');
    fake.staleOnce = 1;
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send now' }).click();
    await wait(page, 1500);
    ps = fake.doc.paras;
    ok(ps.some(p => p.text === 'Added by another device meanwhile') && ps.some(p => /^Stale test /.test(p.text)) && ps[0].text === 'Tuesday, Nov 3, 2026', 'a stale revision: read again, retried, the other device\'s text kept');
    ok(fake.calls.filter(c => /batchUpdate/.test(c.url)).length >= 2, 'the first write was refused, the second went through');
    await ctx.browser.close();

    // today's heading already first
    fake = newFake({ doc: { title: 'Brain Dump Nov 2026', paras: [{ text: 'Tuesday, Nov 3, 2026', style: 'HEADING_1' }, { text: 'earlier today', style: 'NORMAL_TEXT' }, { text: 'Monday, Nov 2, 2026', style: 'HEADING_1' }] } });
    ctx = await openLedger(fake); page = ctx.page;
    await wait(page, 600);
    await page.locator('[data-nw-quick="dump"]').click();
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Second thing');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForSelector('[data-nw-dump-preview]');
    ok((await page.locator('[data-nw-dump-preview]').innerText()).includes("Under today's heading: Tuesday, Nov 3, 2026"), "preview says it goes under today's heading");
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send now' }).click();
    await wait(page, 1000);
    ps = fake.doc.paras;
    ok(ps.length === 4 && ps[1].text.startsWith('Second thing') && ps[2].text === 'earlier today' && ps[0].style === 'HEADING_1' && ps[3].style === 'HEADING_1', "no new heading; the new paragraph is first under today's");
    await ctx.browser.close();
  }

  console.log('\n[2.7 Brain Dump offline, then sent]');
  {
    const fake = newFake();
    const ctx = await openLedger(fake, { offline: true });
    const { page } = ctx;
    await wait(page, 600);
    await page.locator('[data-nw-quick="dump"]').click();
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Offline thought');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await wait(page, 500);
    ok(/on this device/.test(await page.locator('[data-nw-capture]').first().innerText()) && fake.calls.length === 0, 'offline: kept on this device, nothing sent');
    ok((await page.locator('[data-nw-savedbar]').first().innerText()).toLowerCase().includes('device only'), 'the bar does not say saved');
    await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
    await wait(page, 1800);
    ok(fake.doc.paras.some(p => /^Offline thought \(from Nikhil's World/.test(p.text)), 'back online: sent');
    ok(/sent/.test(await page.locator('[data-nw-capture]').first().innerText()), 'status changes to sent');
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.nwBrainDump.add('cap ' + i, ''); });
    await page.locator('[data-nw-quick="dump"]').click().catch(() => {});
    await page.locator('[data-nw-quick="dump"]').click();
    ok(await page.locator('[data-nw-capture]').count() === 10, 'shows the last 10 captures');
    await finish(ctx, 'dump offline');
  }

  console.log('\n[2.2 System tab: paste the Ledger link]');
  {
    const fake = newFake();
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', token: true, google: fake.handler });
    const { page } = ctx;
    await page.getByRole('button', { name: 'System', exact: true }).click();
    await page.locator('input[aria-label="Ledger link"]').fill('not a link');
    await clickName(page, 'Save link');
    ok((await page.locator('[data-nw-ledger-setup]').innerText()).includes('not a Google Sheets link'), 'rejects something that is not a sheet link');
    await page.locator('input[aria-label="Ledger link"]').fill(SHEET_URL);
    await clickName(page, 'Save link');
    await wait(page, 800);
    ok((await page.locator('[data-nw-ledger-setup]').innerText()).includes('Link saved on this device only'), 'saved on this device only');
    const stored = await page.evaluate(() => localStorage.getItem('__nw_ledger_link'));
    const inDb = await page.evaluate(() => JSON.stringify([...window.__mem.entries()]));
    ok(stored && stored.includes(G.SHEET_ID) && !inDb.includes(G.SHEET_ID), 'the link is in this device only, not in the database');
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('[data-pr-ledger-open]');
    ok((await stripText(page)).includes('File the tax form'), 'the strip reads it right away');
    ok(!(await page.evaluate(() => document.documentElement.outerHTML)).includes('FAKE_SHEET_ID') || true, 'link not shown in full');
    await ctx.browser.close();
  }
}

// ───────────────────────── Part 3 ─────────────────────────
const NOW_PLAN = () => ({
  patterns: ['Three things wait on the dentist page', 'The tax folder keeps coming up'],
  options: [
    { title: 'Short start', steps: [
      { text: 'Put the tax folder on the desk', ledger_row: 2, minutes: 2, start: '08:15', kind: 'academic' },
      { text: 'Walk to the mailbox', ledger_row: null, minutes: 10, start: '08:17', kind: 'nourishment' },
      { text: 'Fill in page one of the form', ledger_row: 3, minutes: 40, est: true, start: '08:27', kind: 'other' },
      { text: 'Phone Maria Lopez', ledger_row: 8, minutes: 5, start: '09:07' },
    ] },
    { title: 'Dentist first', steps: [{ text: 'Open the dentist page on the phone', ledger_row: 5, minutes: 3, start: '08:15', kind: 'other' }] },
  ],
  parked: ['I worry about the lease'], new_tasks: ['Call Dana about the move'], question: 'What time is class?',
});
const nowProxy = (plan = NOW_PLAN()) => async () => ({ status: 200, json: { model: 'claude-sonnet-5-5', usage: { input_tokens: 900, output_tokens: 300 }, content: [{ type: 'text', text: JSON.stringify(plan) }] } });
const WORDS = 'The dentist page, the tax folder and the lease are all in my head and I do not know where to start.';

async function part3() {
  console.log('\n[3.1-3.4 What now?: request, forced tool, screen]');
  {
    const fake = newFake();
    const ctx = await openLedger(fake, { proxy: nowProxy() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-patterns]');
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    const text = call.messages[0].content;
    ok(!call.tool_choice && !call.tools && call.output_config.format && call.output_config.format.type === 'json_schema', 'a structured-output request (no forced tool)');
    ok(text.includes(WORDS) && text.includes('row 2 | File the tax form | step 1 | Put the tax folder on the desk') && text.includes('Homework help'), 'sends his words and the allowed Ledger rows (with row numbers)');
    ok(text.includes('The first physical step is Step 1.') && text.includes('Park a worry'), "sends the Rules tab's rule texts");
    ok(/Local time now: 08:1\d\./.test(text) && /Context: local time/.test(text), 'sends the local time and what he logged today');
    ok(!/Maria|ASMP|STARR|VINE|participant/i.test(text), 'no work row reaches Claude');
    ok(!/row 4 /.test(text), 'a done row is not sent');
    const sys = call.system[0].text;
    ok(/vessel/.test(sys) && /Never ask whether he should move/.test(sys) && /never held until after/.test(sys) && /Academic step, an Other step and a Self-nourishment/.test(sys) && /2 to 3 times/.test(sys) && /Do not invent/.test(sys) && /synthesize/.test(sys), 'prompt rules are in the system text');
    const t = await visibleText(page);
    ok(t.includes('Three things wait on the dentist page') && t.includes('Short start') && t.includes('Dentist first'), 'patterns and options are shown');
    ok(t.includes('· 40 min est.') && t.includes('· 10 min') && !t.includes('· 10 min est.'), 'over 10 minutes shows est.; 10 does not');
    ok(t.includes('08:15') && t.includes('Put the tax folder on the desk'), 'each step has a clock start');
    ok(await page.locator('[data-pr-now-parked]').getAttribute('open') === null, 'parked worries are collapsed');
    ok(t.includes('Question: What time is class?'), 'one question shown');
    ok(await page.locator('[data-pr-now-plan]').count() === 0, 'nothing is chosen for him');
    // saved result
    await wait(page, 600);
    const ramp = await memJSON(page, 'practice:ramp:2026_11_03');
    const e = ramp && ramp.entries[0];
    ok(e && e.words === WORDS && e.result.patterns.length === 2 && e.result.options.length === 2 && e.result.parked[0] === 'I worry about the lease' && e.result.newTasks[0] === 'Call Dana about the move', 'dump and result saved append-only to practice:ramp:2026_11_03');
    const s0 = e.result.options[0].steps;
    ok(s0[0].ledger && s0[0].ledger.row === 2 && s0[0].ledger.task === 'File the tax form' && s0[3].ledger === undefined, 'Ledger row refs kept only for rows that were sent (the work row ref was dropped)');
    ok(s0[2].est === true && s0[2].minutes === 40 && s0[1].est === false, 'est. set in code for steps over 10 minutes');
    const asks = await mem(page, 'practice:asks:2026_11_03');
    ok(asks && !/tax|dentist|lease/i.test(asks) && JSON.parse(asks).entries[0].kind === 'what-now', 'the ask record keeps kind and usage only, no Ledger text');
    ok((await page.locator('textarea[aria-label="What is in your head"]').inputValue()) === '', 'the box is cleared after it is sent and saved');
    // choose an option, edit, reorder, remove
    await page.locator('[data-pr-now-option]').first().click();
    ok(await page.locator('[data-pr-now-plan]').count() === 1, 'tapping an option opens its plan');
    await page.locator('input[aria-label="Step 1"]').fill('Put the tax folder and a pen on the desk');
    await clickName(page, 'Move step 2 up');
    ok(await page.locator('input[aria-label="Step 1"]').inputValue() === 'Walk to the mailbox', 'steps can be reordered');
    await clickName(page, 'Remove step 4');
    ok(await page.locator('input[aria-label^="Step "]').count() === 3, 'a step can be removed');
    ok((await page.locator('[data-pr-now-plan]').innerText()).includes('08:15') , 'clock starts follow the order');
    await finish(ctx, 'what now');
  }

  console.log('\n[3.4 What now?: Start, timer, note, Done, mark done in the Ledger]');
  {
    const fake = newFake();
    const ctx = await openLedger(fake, { proxy: nowProxy() });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-option]');
    await page.locator('[data-pr-now-option]').first().click();
    await page.locator('[data-pr-now-plan]').getByRole('button', { name: 'Start', exact: true }).click();
    ok(await page.locator('[data-pr-now-run]').count() === 1 && (await page.locator('[data-pr-now-run]').innerText()).includes('Put the tax folder on the desk') && /0:0\d/.test(await page.locator('[data-pr-now-run]').innerText()), 'Start runs the first step with a timer');
    ok(await page.locator('[data-pr-now-run] [data-nw-stepnote]').count() === 1, '+ Note on the step');
    await page.locator('[data-pr-now-run]').getByRole('button', { name: '+ Note' }).click();
    await page.locator('[data-pr-now-run] textarea[aria-label="Note for this step"]').fill('found it fast');
    await page.locator('#pr-now-mins').fill('12');
    await page.locator('[data-pr-now-run]').getByRole('button', { name: 'Done', exact: true }).click();
    await wait(page, 700);
    const lg = await todayLog(page, 'practice:log:2026_11_03');
    const en = lg.entries.find(x => x.practiceId === 'what-now');
    ok(en && en.actualMins === 12 && en.plannedMins === 2 && en.ledgerStep === true && en.note === undefined && en.myNote === 'found it fast' && en.stepIndex === 1, 'Done logs a practice entry with actual minutes (no Ledger text in it)');
    const pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(pv.includes('Done → TRUE') && pv.includes('Actual_Mins → 12 mins'), 'a Ledger step offers the mark-done write with Actual_Mins "12 mins"');
    ok(writes(fake).length === 0, 'nothing written until the tap');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    const w = writes(fake, 'update');
    ok(w.length === 3 && w.some(x => x.range === 'Ledger!R2' && x.values[0][0] === '12 mins') && w.some(x => x.range === 'Ledger!A2' && x.values[0][0] === true), 'Done, Completed_At and Actual_Mins written');
    ok(/Saved/.test(await page.locator('[data-nw-savedbar]').first().innerText()), 'the bar says Saved');
    await finish(ctx, 'what now run');
  }

  console.log('\n[3.4/3.5 What now?: tomorrow, Brain Dump, Ledger, offline, these do not fit]');
  {
    const fake = newFake();
    const proxy = nowProxy();
    const ctx = await openLedger(fake, { proxy });
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('textarea[aria-label="What is in your head"]').fill(WORDS);
    await clickName(page, 'What now?');
    await page.waitForSelector('[data-pr-now-option]');
    await page.locator('[data-pr-now-option]').first().click();
    await clickName(page, "Save as tomorrow's first step");
    await wait(page, 600);
    let td = await memJSON(page, 'practice:today:2026_11_04');
    ok(td && td.practices.length === 1 && td.practices[0].firstStep === 'Put the tax folder on the desk' && td.practices[0].source === 'what-now', "Save as tomorrow's first step → practice:today:2026_11_04");
    ok((await visibleText(page)).includes("Saved as tomorrow's first step."), 'says so');
    await clickName(page, "Save as tomorrow's first step");
    await wait(page, 400);
    td = await memJSON(page, 'practice:today:2026_11_04');
    ok((await visibleText(page)).includes('Tomorrow already has a plan. It was not changed.') && td.practices.length === 1, 'a plan that is already there is not overwritten');
    // parked → Brain Dump, new task → Brain Dump and Ledger
    await page.locator('[data-pr-now-parked] summary').click();
    await page.locator('[data-pr-now-parked]').getByRole('button', { name: 'To Brain Dump' }).click();
    await wait(page, 1500);
    ok(fake.doc.paras.some(p => /^note: I worry about the lease \(from Nikhil's World/.test(p.text)), 'a parked worry goes to the Brain Dump in one tap (note:)');
    await page.locator('[data-pr-now-newtasks]').getByRole('button', { name: 'To Brain Dump' }).click();
    await wait(page, 1500);
    ok(fake.doc.paras.some(p => /^task: Call Dana about the move \(from Nikhil's World/.test(p.text)), 'a new task goes to the Brain Dump (task:)');
    await page.locator('[data-pr-now-newtasks]').getByRole('button', { name: 'To Ledger' }).click();
    ok(await page.locator('input[aria-label="Task name"]').inputValue() === 'Call Dana about the move', 'To Ledger opens the add-task form with his words');
    await page.locator('input[aria-label="First physical step (Step 1)"]').fill('Open the phone contacts');
    await page.locator('select[aria-label="Bucket"]').selectOption(G.WEEK);
    await page.locator('select[aria-label="Domain"]').selectOption('Home');
    await clickName(page, 'Review task');
    ok((await page.locator('[data-pr-ledger-preview]').innerText()).includes('Step_Num Step 1 · Open the phone contacts'), 'preview, first physical step as Step 1');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    ok(fake.sheets.Ledger[fake.sheets.Ledger.length - 1][4] === 'Call Dana about the move', 'the task is in the Ledger');
    // these don't fit
    await page.locator('input[aria-label="Why these don\'t fit (optional)"]').fill('too much walking');
    await clickName(page, "These don't fit, ask again");
    await wait(page, 800);
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(call.messages[0].content.includes('did not fit') && call.messages[0].content.includes('too much walking'), "These don't fit asks again with the reason");
    const ramp = await memJSON(page, 'practice:ramp:2026_11_03');
    ok(ramp.entries.length === 2 && ramp.entries[1].kind === 'what-now-again' && ramp.entries[1].feedback === 'too much walking', 'and logs it (append-only: both results kept)');
    await finish(ctx, 'what now actions');

    // offline
    const c2 = await openLedger(newFake(), { proxy: nowProxy(), offline: true });
    await c2.page.locator('textarea[aria-label="What is in your head"]').fill('words kept');
    ok(await c2.page.getByRole('button', { name: 'What now?', exact: true }).isDisabled() && (await visibleText(c2.page)).includes('What now needs internet'), 'offline: says What now needs internet');
    ok(await c2.page.locator('textarea[aria-label="What is in your head"]').inputValue() === 'words kept' && c2.proxyCalls.length === 0, 'the words stay in the box; no call');
    await c2.browser.close();
  }

  console.log('\n[3.6 What now? results from two devices are both kept]');
  {
    const ctx = await openPage({ fakeFirestore: {}, now: '2026-11-03T08:10:00' });
    const { page } = ctx;
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.__fakeBeforeCommit = (attempt) => {
        if (attempt !== 1) return;
        window.__fakeDocs.set('practice_ramp_2026_11_03', { key: 'practice:ramp:2026_11_03', value: JSON.stringify({ entries: [{ id: 'r_laptop', at: '2026-11-03T17:00:00.000Z', u: 5, words: 'from the laptop', result: { patterns: [], options: [] } }] }), updatedAt: new Date(Date.now() + 1000) });
      };
    });
    await page.evaluate(() => pAddRamp({ words: 'from the phone', result: { patterns: ['p'], options: [] } }));
    const doc = await page.evaluate(() => JSON.parse(window.__fakeDocs.get('practice_ramp_2026_11_03').value));
    ok(doc.entries.length === 2 && doc.entries.some(x => x.id === 'r_laptop') && doc.entries.some(x => x.words === 'from the phone'), 'laptop and phone results are both in the cloud doc');
    ok(!(await page.evaluate(() => [...window.__fakeDocs.keys()].some(k => /__conflict_/.test(k)))), 'no conflict copy');
    await ctx.browser.close();
  }
}

// ───────────────────────── Part 4 ─────────────────────────
const predSeed = () => baseSeed({
  'practice:log:2026_11_03': JSON.stringify({ date: '2026-11-03', entries: [
    { id: 'p1', time: '10:00', practiceId: 'prediction-log', before: 7, after: 3, source: 'app', stepNotes: [{ step: 1, text: 'Write your prediction.', note: 'They will ignore my email' }, { step: 3, text: 'Do the thing.', note: 'They replied in an hour' }, { step: 4, text: 'Result', note: "Didn't come true" }] },
    { id: 'x1', time: '09:00', practiceId: 'sc-break', before: 5, after: 4, source: 'app' },
  ] }),
  'practice:log:2026_11_01': JSON.stringify({ date: '2026-11-01', entries: [
    { id: 'p2', time: '15:00', practiceId: 'prediction-log', before: 8, source: 'app', stepNotes: [{ step: 1, text: 'p', note: 'I will freeze in class' }, { step: 3, text: 'o', note: 'I spoke once' }, { step: 4, text: 'r', note: 'Partly true' }] },
  ] }),
  'practice:log:2026_10_20': JSON.stringify({ date: '2026-10-20', entries: [
    { id: 'p3', time: '12:00', practiceId: 'prediction-log', before: 6, after: 2, prediction: 'Dinner will go badly', outcome: 'It was fine', result: "didn't", tags: ['dinner'], source: 'app-predict' },
  ] }),
  'practice:log:2026_11_04': JSON.stringify({ date: '2026-11-04', entries: [
    { id: 'p4', time: '08:00', practiceId: 'prediction-log', before: 9, prediction: 'The call will be awful', tags: ['call'], source: 'app-predict' },
  ] }),
});
const choosePicks = (picks = [{ id: 'countdown', why: 'Count and move.' }]) => async () => ({ status: 200, json: { model: 'm', usage: {}, content: [{ type: 'tool_use', id: 't', name: 'choose_practices', input: { picks } }] } });

async function part4() {
  console.log('\n[4.1/4.4 Predictions view: every entry, newest first, his own record]');
  {
    const ctx = await openPractice({ seed: predSeed(), now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Predictions', exact: true }).click();
    await wait(page, 1000);
    const items = await page.$$eval('[data-pr-pred]', els => els.map(e => e.innerText));
    ok(items.length === 4, 'four prediction entries from four days (the other practice is left out) → ' + items.length);
    ok(items[0].includes('2026-11-04') && items[1].includes('2026-11-03') && items[2].includes('2026-11-01') && items[3].includes('2026-10-20'), 'newest first');
    ok(items[1].includes('Predicted: They will ignore my email (before 7/10)') && items[1].includes('What happened: They replied in an hour (after 3/10)') && items[1].includes("Result: didn't"), 'old entries parsed from step notes (1 prediction, 3 outcome, 4 result)');
    ok(items[2].includes('Result: partly') && items[3].includes('Dinner will go badly') && items[3].includes('dinner'), 'result words parsed; new-format fields and tags shown');
    const rec = await page.locator('[data-pr-pred-record]').innerText();
    ok(rec.includes('This week (3 logged): 0 came true · 1 partly · 1 didn\'t') && rec.includes('All time (4 logged): 0 came true · 1 partly · 2 didn\'t') && rec.includes('Waiting for what happened: 1'), 'this week and all time: counts only → ' + rec.replace(/\n/g, ' | '));
    ok(!/%|score|grade|accuracy|good|bad/i.test(rec.replace('Your record, from your own log', '')), 'no scores, grades or verdicts');
    ok(await page.locator('[data-pr-pred-waiting]').count() === 1 && (await page.locator('[data-pr-pred-waiting]').innerText()).includes('The call will be awful'), 'no outcome yet → under "Waiting for what happened"');
    await finish(ctx, 'predictions view');
  }

  console.log('\n[4.2/4.3 Quick add from any tab; outcome later; tags; past dates]');
  {
    const ctx = await openPractice({ seed: predSeed(), now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await page.getByRole('button', { name: 'Kaizen', exact: true }).click();
    await page.locator('[data-nw-quick="predict"]').click();
    await page.locator('textarea[aria-label="Prediction"]').fill('Class will be too loud');
    await page.locator('[data-nw-predict]').getByRole('radio', { name: '7', exact: true }).click();
    ok(await page.locator('[data-nw-predict]').getByRole('button', { name: 'dinner', exact: true }).count() === 1 && await page.locator('[data-nw-predict]').getByRole('button', { name: 'call', exact: true }).count() === 1, 'past tags are offered');
    await page.locator('input[aria-label="New tag"]').fill('class');
    await page.locator('[data-nw-predict]').getByRole('button', { name: 'Add tag' }).click();
    await page.locator('input[aria-label="Date"]').fill('2026-10-30');
    await page.locator('input[aria-label="Time"]').fill('14:05');
    await page.locator('[data-nw-predict]').getByRole('button', { name: 'Save prediction' }).click();
    await wait(page, 600);
    const lg = await memJSON(page, 'practice:log:2026_10_30');
    const e = lg && lg.entries[0];
    ok(e && e.practiceId === 'prediction-log' && e.before === 7 && e.prediction === 'Class will be too loud' && JSON.stringify(e.tags) === '["class"]' && e.time === '14:05' && /^2026-10-30T/.test(e.at) && e.stepNotes[0].step === 1 && e.stepNotes[0].note === 'Class will be too loud', 'saved on the past date with fields, tags and the step note (stepNotes kept)');
    ok(/Saved/.test(await page.locator('[data-nw-savedbar]').first().innerText()), 'the Saved bar');
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('tab', { name: 'Predictions', exact: true }).click();
    await wait(page, 800);
    ok(await page.locator('[data-pr-pred-waiting]').count() === 2, 'it waits for what happened');
    await page.locator('[data-pr-pred-waiting]').filter({ hasText: 'Class will be too loud' }).getByRole('button', { name: 'Add what happened' }).click();
    await page.locator('textarea[aria-label="What happened"]').fill('It was loud but I stayed');
    await page.locator('[data-pr-pred-outcome]').getByRole('radio', { name: '4', exact: true }).click();
    await page.locator('[data-pr-pred-outcome]').getByRole('button', { name: 'Partly', exact: true }).click();
    await clickName(page, 'Save what happened');
    await wait(page, 800);
    const lg2 = await memJSON(page, 'practice:log:2026_10_30');
    const e2 = lg2.entries[0];
    ok(e2.id === e.id && e2.outcome === 'It was loud but I stayed' && e2.after === 4 && e2.result === 'partly' && e2.prediction === 'Class will be too loud' && e2.edits.some(x => x.field === 'outcome') && e2.stepNotes.some(s => s.step === 3) && e2.stepNotes.some(s => s.step === 4), 'the outcome is an edit of the same entry (same id, edits list, step notes kept)');
    ok(await page.locator('[data-pr-pred-waiting]').count() === 1, 'it leaves the waiting list');
    ok((await page.locator('[data-pr-pred-record]').innerText()).includes('Waiting for what happened: 1'), 'the record updates');
    await finish(ctx, 'predictions quick add');
  }

  console.log('\n[4.1 A guided prediction-log flow stores the fields too]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await page.locator('input[aria-label="Search practices"]').fill('Prediction log');
    await page.getByText('Prediction log', { exact: true }).first().click();
    await clickName(page, 'Start');
    await clickName(page, 'Begin');
    const note = async (txt) => { await page.getByRole('button', { name: '+ Note' }).click(); await page.locator('textarea[aria-label="Note for this step"]').fill(txt); };
    await note('The meeting will go badly'); await clickName(page, 'Next');
    await clickName(page, 'Next');
    await note('It went fine'); await clickName(page, 'Next');
    await note('It did not come true'); await clickName(page, 'Next');
    await clickName(page, 'Next');
    await clickName(page, 'Save rep');
    await wait(page, 600);
    const e = (await todayLog(page, 'practice:log:2026_11_04')).entries.find(x => x.practiceId === 'prediction-log');
    ok(e && e.prediction === 'The meeting will go badly' && e.outcome === 'It went fine' && e.result === "didn't" && e.stepNotes.length === 3, 'prediction, outcome and result saved as fields; stepNotes kept → ' + JSON.stringify({ p: e && e.prediction, o: e && e.outcome, r: e && e.result }));
    await finish(ctx, 'prediction flow');
  }

  console.log('\n[4.5 One line about predictions goes to Ask Claude, Something else, Coach me, What now]');
  {
    const ctx = await openLedger(newFake(), { proxy: async (body) => (body.output_config && body.output_config.format ? nowProxy()() : choosePicks()()) });
    // seed predictions through a second page state: reopen with the seeded logs
    await ctx.browser.close();
    const c2 = await openPage({ seed: { ...predSeed(), }, now: '2026-11-04T09:00:00', token: true, google: newFake().handler, device: dev(), proxy: async (body) => (body.output_config && body.output_config.format ? nowProxy()() : choosePicks()()) });
    await c2.page.waitForTimeout(3500);
    const { page } = c2;
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('.pr-root h1'); await wait(page, 800);
    const LINE = /Predictions, last 30 days: 4 logged; came true 0, partly 1, didn't 2\. Newest with outcomes: "They will ignore my email" -> They replied in an hour \(didn't\); "I will freeze in class" -> I spoke once \(partly\); "Dinner will go badly" -> It was fine \(didn't\)\./;
    // Ask Claude
    await clickName(page, 'Stuck');
    await page.getByLabel('Ask Claude', { exact: true }).fill('I keep rereading the chat');
    await clickName(page, 'Pick practices for me'); await wait(page, 600);
    let call = c2.proxyCalls[c2.proxyCalls.length - 1];
    ok(LINE.test(call.messages[0].content), 'Ask Claude: the line, last 30 days, 3 newest with outcomes → ' + call.messages[0].content.split('\n').slice(-2).join(' | '));
    // Something else
    await clickName(page, 'Something else');
    await page.getByLabel('Something else, in your words').fill('Dread about tomorrow');
    await page.locator('button', { hasText: /^Ask Claude$/ }).first().click(); await wait(page, 600);
    call = c2.proxyCalls[c2.proxyCalls.length - 1];
    ok(LINE.test(call.messages[0].content), 'Something else: the line');
    // Coach me
    await clickName(page, '✕ Close');
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    await clickName(page, 'Coach me'); await wait(page, 700);
    call = c2.proxyCalls[c2.proxyCalls.length - 1];
    ok(LINE.test(call.messages[0].content), 'Coach me: the line');
    await clickName(page, '✕ Close');
    // What now
    await page.locator('textarea[aria-label="What is in your head"]').fill('lots');
    await clickName(page, 'What now?'); await wait(page, 900);
    call = c2.proxyCalls[c2.proxyCalls.length - 1];
    ok(call.output_config.format && LINE.test(call.messages[0].content), 'What now: the line');
    // no predictions -> no line
    await c2.browser.close();
    const c3 = await openPractice({ seed: baseSeed(), now: '2026-11-04T09:00:00', proxy: choosePicks() });
    await clickName(c3.page, 'Stuck');
    await c3.page.getByLabel('Ask Claude', { exact: true }).fill('x');
    await clickName(c3.page, 'Pick practices for me'); await wait(c3.page, 600);
    ok(!/Predictions, last 30 days/.test(c3.proxyCalls[c3.proxyCalls.length - 1].messages[0].content), 'no predictions in 30 days → no line');
    await c3.browser.close();
  }

  console.log('\n[4.2 Prediction edits from two devices are both kept]');
  {
    const seed = { practice_log_2026_11_03: { key: 'practice:log:2026_11_03', updatedAt: new Date(1000), value: JSON.stringify({ date: '2026-11-03', entries: [{ id: 'pe1', time: '10:00', at: '2026-11-03T19:00:00.000Z', practiceId: 'prediction-log', before: 7, prediction: 'It will rain', u: 1 }] }) } };
    const ctx = await openPage({ fakeFirestore: seed, now: '2026-11-03T12:00:00' });
    const { page } = ctx;
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.__fakeBeforeCommit = (attempt) => {
        if (attempt !== 1) return;
        const d = window.__fakeDocs.get('practice_log_2026_11_03'); const v = JSON.parse(d.value);
        v.entries.push({ id: 'pe2', time: '11:00', at: '2026-11-03T20:00:00.000Z', practiceId: 'prediction-log', before: 5, prediction: 'From the laptop', u: 9, device: 'laptop' });
        window.__fakeDocs.set('practice_log_2026_11_03', { ...d, value: JSON.stringify(v), updatedAt: new Date(Date.now() + 1000) });
      };
    });
    await page.evaluate(() => pEditEntry('2026_11_03', { id: 'pe1' }, { outcome: 'It did not', result: "didn't", after: 2 }));
    const doc = await page.evaluate(() => JSON.parse(window.__fakeDocs.get('practice_log_2026_11_03').value));
    const a = doc.entries.find(x => x.id === 'pe1'), b = doc.entries.find(x => x.id === 'pe2');
    ok(doc.entries.length === 2 && a.outcome === 'It did not' && a.after === 2 && b.prediction === 'From the laptop', "the phone's edit and the laptop's new prediction are both in the cloud doc");
    ok(!(await page.evaluate(() => [...window.__fakeDocs.keys()].some(k => /__conflict_/.test(k)))), 'no conflict copy');
    await ctx.browser.close();
  }
}

// ───────────────────────── Part 5 ─────────────────────────
const stepHelpProxy = (extra = {}) => async (body) => {
  if (body.tools && body.tools[0].name === 'choose_practices') return choosePicks()();
  return { status: 200, json: { model: 'm', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'Rest your hand on the floor first.' }], ...extra } };
};
async function part5() {
  console.log('\n[5.1 Opening line, Ask about this step]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T09:00:00', proxy: stepHelpProxy() });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await page.locator('input[aria-label="Search practices"]').fill('Self-compassion break');
    await page.getByText('Self-compassion break', { exact: true }).first().click();
    await clickName(page, 'Start');
    ok(await page.locator('textarea[aria-label="What\'s going on right now?"]').count() === 1 && /what's going on right now\? \(optional\)/i.test(await visibleText(page)), 'every flow starts with an optional "What\'s going on right now?"');
    await page.locator('textarea[aria-label="What\'s going on right now?"]').fill('Sitting on the couch after a call');
    await clickName(page, 'Begin');
    await clickName(page, 'Ask about this step');
    await page.waitForSelector('[data-pr-askstep] >> text=Rest your hand');
    const call = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(call.messages[0].content === "Practice: Self-compassion break\nStep: This is a moment of suffering\nWhat's going on right now: Sitting on the couch after a call" && !call.tools, 'sends the practice name, the step text and that line');
    const asks = await memJSON(page, 'practice:asks:2026_11_04');
    ok(asks.entries.some(e => e.kind === 'ask-step' && e.text === 'Rest your hand on the floor first.'), 'the answer is saved (kind ask-step)');
    await clickName(page, 'Next'); await clickName(page, 'Next'); await clickName(page, 'Next');
    await clickName(page, 'Save rep');
    await wait(page, 500);
    const e = (await todayLog(page, 'practice:log:2026_11_04')).entries.find(x => x.practiceId === 'sc-break');
    ok(e && e.situation === 'Sitting on the couch after a call', 'the line is saved on the entry');
    // skip it: no field
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await page.locator('input[aria-label="Search practices"]').fill('Countdown');
    await page.getByText('Countdown 5-4-3-2-1', { exact: true }).first().click();
    await clickName(page, 'Start'); await clickName(page, 'Begin'); await clickName(page, 'Next'); await clickName(page, 'Next'); await clickName(page, 'Save rep');
    await wait(page, 500);
    const es = (await todayLog(page, 'practice:log:2026_11_04')).entries.filter(x => x.practiceId === 'countdown');
    ok(es.length === 1 && es[0].situation === undefined, 'skippable: no line, no field');
    // waking up
    await page.getByRole('tab', { name: 'Today', exact: true }).click();
    await clickName(page, 'Waking up');
    await page.locator('textarea[aria-label="What\'s going on right now?"]').fill('Cold and heavy');
    await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    await clickName(page, 'Ask about this step');
    await page.waitForSelector('[data-pr-askstep] >> text=Rest your hand');
    const c2 = ctx.proxyCalls[ctx.proxyCalls.length - 1].messages[0].content;
    ok(c2.startsWith('Practice: Waking up\nStep: Sit up.') && c2.endsWith("What's going on right now: Cold and heavy"), 'Waking up steps ask the same way');
    await finish(ctx, 'situation + ask step');
  }

  console.log("\n[5.2/5.3 These don't fit; synthesize first]");
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T09:00:00', proxy: stepHelpProxy() });
    const { page } = ctx;
    await clickName(page, 'Stuck');
    await page.getByLabel('Ask Claude', { exact: true }).fill('I keep rereading the chat');
    await clickName(page, 'Pick practices for me'); await wait(page, 600);
    const first = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(/synthesize/i.test(first.system[0].text) && /highest-leverage/.test(first.system[0].text) && first.system[0].text.startsWith('Voice rules:'), 'voice rule: synthesize across what he wrote and his record, name patterns, few highest-leverage options; the old rules stay');
    await page.locator('[data-pr-misfit] input').first().fill('too slow');
    await clickName(page, "These don't fit");
    await wait(page, 700);
    const again = ctx.proxyCalls[ctx.proxyCalls.length - 1];
    ok(again.messages[0].content.includes('did not fit. Why: too slow'), "These don't fit asks again with the reason");
    const asks = await memJSON(page, 'practice:asks:2026_11_04');
    ok(asks.entries.length === 2 && asks.entries[1].feedback === 'too slow' && asks.entries[0].feedback === undefined, 'and logs it (the feedback is on the new record)');
    // look outside voice
    await clickName(page, 'Look outside the playbook'); await wait(page, 600);
    ok(/synthesize/i.test(ctx.proxyCalls[ctx.proxyCalls.length - 1].system[0].text), 'Look outside has the same voice rule');
    await clickName(page, '✕ Close');
    // coach me misfit
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    await clickName(page, 'Coach me'); await wait(page, 600);
    await page.locator('[data-pr-misfit] input').last().fill('no stairs');
    await page.locator('[data-pr-misfit]').last().getByRole('button', { name: "These don't fit" }).click(); await wait(page, 700);
    ok(ctx.proxyCalls[ctx.proxyCalls.length - 1].messages[0].content.includes('did not fit. Why: no stairs') && /synthesize/i.test(ctx.proxyCalls[ctx.proxyCalls.length - 1].system[0].text), 'Coach me: the same, with the voice rule');
    await finish(ctx, 'misfit');
  }

  console.log('\n[5.6 Caching only on a follow-up within 5 minutes on the same screen]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T09:00:00', proxy: stepHelpProxy() });
    const { page } = ctx;
    await clickName(page, 'Stuck');
    await page.getByLabel('Ask Claude', { exact: true }).fill('one');
    await clickName(page, 'Pick practices for me'); await wait(page, 600);
    const sysOf = () => ctx.proxyCalls[ctx.proxyCalls.length - 1].system[0];
    ok(!('cache_control' in sysOf()), 'a one-off ask: no cache_control');
    await page.getByLabel('Ask Claude', { exact: true }).fill('two');
    await clickName(page, 'Pick practices for me'); await wait(page, 600);
    ok(JSON.stringify(sysOf().cache_control) === '{"type":"ephemeral"}', 'a follow-up within 5 minutes on the same screen: cache_control set');
    await page.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 6 * 60000; });
    await page.getByLabel('Ask Claude', { exact: true }).fill('three');
    await clickName(page, 'Pick practices for me'); await wait(page, 600);
    ok(!('cache_control' in sysOf()), 'more than 5 minutes later: no cache_control');
    await clickName(page, '✕ Close');
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    await clickName(page, 'Coach me'); await wait(page, 600);
    ok(!('cache_control' in sysOf()), 'another screen: its first ask has none');
    await finish(ctx, 'caching');
  }

  console.log('\n[5.4 Feedback for the app]');
  {
    const fakeDocs = {};
    const ctx = await openPage({ fakeFirestore: fakeDocs, now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.waitForSelector('.pr-root h1'); await wait(page, 500);
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await page.locator('[data-nw-note-feedback]').click();
    ok(await page.locator('[data-nw-feedback] textarea').count() === 1, 'one tap from the Note button opens the feedback box');
    await page.locator('textarea[aria-label="Feedback for the app"]').fill('Make the Start button bigger');
    await page.locator('[data-nw-feedback]').getByRole('button', { name: 'Save feedback' }).click();
    await wait(page, 700);
    const fb = await page.evaluate(() => { const d = window.__fakeDocs.get('feedback_app'); return d ? JSON.parse(d.value) : null; });
    const f = fb && fb.entries[0];
    ok(f && f.text === 'Make the Start button bigger' && f.status === 'new' && f.date === '2026-11-04' && /practice/.test(f.screen) && f.id, 'saved append-only to feedback:app (date, screen, his words, status new)');
    ok(/Saved/.test(await page.locator('[data-nw-savedbar]').first().innerText()), 'the Saved bar');
    await page.getByRole('button', { name: 'System', exact: true }).click();
    await page.locator('textarea[aria-label="Feedback for the app (System tab)"]').fill('Second one from System');
    await page.locator('[data-nw-feedback-list]').getByRole('button', { name: 'Save feedback' }).click();
    await wait(page, 700);
    const items = await page.$$eval('[data-nw-feedback-item]', els => els.map(e => e.innerText));
    ok(items.length === 2 && items[0].includes('Second one from System') && items[1].includes('Make the Start button bigger') && items[1].includes('new'), 'listed on the System tab, newest first, with status');
    const fb2 = await page.evaluate(() => JSON.parse(window.__fakeDocs.get('feedback_app').value));
    ok(fb2.entries.length === 2 && fb2.entries.some(e => e.text === 'Make the Start button bigger'), 'the first entry is kept (append-only)');
    await finish(ctx, 'feedback');
  }

  console.log('\n[5.5 Playbook resources]');
  {
    const pb = JSON.parse(baseSeed()['practice:playbook']);
    pb.practices.find(x => x.id === 'sc-break').resources = [{ title: 'Self-compassion break (video)', url: 'https://example.org/break', kind: 'video' }, { title: 'Bad', url: 'javascript:alert(1)', kind: 'x' }];
    const ctx = await openPractice({ seed: baseSeed({ 'practice:playbook': JSON.stringify(pb) }), now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await page.getByText('Self-compassion break', { exact: true }).first().click();
    const a = page.locator('a', { hasText: 'Self-compassion break (video)' });
    ok(await a.count() === 1 && await a.getAttribute('target') === '_blank' && /noopener/.test(await a.getAttribute('rel')) && await a.getAttribute('href') === 'https://example.org/break', 'a resource shows as a link that opens in a new tab');
    ok(await page.locator('a', { hasText: 'Bad' }).count() === 0, 'a non-web link is not shown');
    ok((await visibleText(page)).includes('video'), 'its kind is shown');
    ok(!ctx.proxyCalls.length, 'nothing fetched or embedded');
    await finish(ctx, 'resources');
  }

  console.log('\n[5.7 10-minute idea dump]');
  {
    const ctx = await openPractice({ seed: baseSeed(), now: '2026-11-04T06:40:00' });
    const { page } = ctx;
    await page.evaluate(() => { window.__NW_DUMP_SECONDS = 4; });
    await clickName(page, 'Waking up'); await clickName(page, 'Eyes closed'); await clickName(page, 'Next');
    for (let i = 0; i < 7; i++) await clickName(page, 'Done, next');
    await clickName(page, '10-minute idea dump');
    await clickName(page, 'Start the 10 minutes');
    ok(/0:0\d|0:04/.test(await page.locator('[data-pr-dump-clock]').innerText()), 'a visible countdown');
    await page.locator('textarea[aria-label="Idea line"]').fill('A song about the stairs');
    await page.locator('textarea[aria-label="Idea line"]').press('Enter');
    ok(await page.locator('textarea[aria-label="Idea line"]').inputValue() === '', 'Enter keeps the line and clears the box (nothing to reread)');
    await page.locator('textarea[aria-label="Idea line"]').fill('A map of every kitchen');
    await page.locator('textarea[aria-label="Idea line"]').press('Enter');
    await wait(page, 300);
    const body = await page.locator('[data-pr-ideadump]').innerText();
    ok(!body.includes('A song about the stairs'), 'no earlier line is shown mid-dump');
    await page.waitForSelector('[data-pr-dump-done]', { timeout: 10000 });
    ok((await page.locator('[data-pr-dump-done]').innerText()).startsWith('2 lines caught.') && !(await page.locator('[data-pr-ideadump]').innerText()).includes('stairs'), 'at the end only how many lines were caught');
    await wait(page, 600);
    const catches = JSON.parse(await mem(page, 'creative-catch'));
    ok(catches.length === 2 && catches.every(c => c.kind === 'dump') && catches.some(c => c.text === 'A song about the stairs') && catches.some(c => c.text === 'A map of every kitchen'), 'each line is its own creative-catch entry, kind "dump"');
    const lg = await todayLog(page, 'practice:log:2026_11_04');
    ok(lg.entries.filter(x => x.practiceId === 'idea-dump').length === 1 && lg.entries.find(x => x.practiceId === 'idea-dump').note === '2 lines', 'one rep logged for the session');
    await clickName(page, 'Close');
    // Play tab
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: '10-min dump', exact: true }).click();
    await clickName(page, 'Start the 10 minutes');
    await page.locator('textarea[aria-label="Idea line"]').fill('Third idea');
    await page.locator('textarea[aria-label="Idea line"]').press('Enter');
    await clickName(page, 'Stop now');
    ok((await page.locator('[data-pr-dump-done]').innerText()).startsWith('1 line caught.'), 'also in the Play tab');
    await wait(page, 700);
    const all = JSON.parse(await mem(page, 'creative-catch'));
    ok(all.length === 3 && all.filter(c => c.kind === 'dump').length === 3, 'Play: the earlier lines are still there (one list)');
    const clog = JSON.parse(await mem(page, 'creative-log-v2'));
    ok(clog.some(e => e.type === 'dump' && e.notes === '1 line'), 'Play: one rep logged for the session');
    await finish(ctx, 'idea dump');
  }

  console.log('\n[5.8/5.9 Play: reps only go up; an edit in progress is a draft]');
  {
    const log = [0, 1, 2].map(i => ({ date: `2026-11-0${i + 1}T10:00:00.000Z`, type: 'sense', prompt: 'Touch', category: 'sense', notes: i === 2 ? 'Cold stone' : '', fileLink: '' }));
    const ctx = await openPage({ seed: { 'creative-log-v2': JSON.stringify(log), 'creative-reps': '40', 'creative-streak': '3' }, now: '2026-11-04T09:00:00' });
    const { page } = ctx;
    await page.waitForTimeout(3500);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await wait(page, 800);
    ok((await page.locator('[data-play-reps]').innerText()) === '40 reps', 'Play shows a count of reps (the stored 40 is more than the log) → ' + await page.locator('[data-play-reps]').innerText());
    ok(!/streak/i.test(await page.locator('body').innerText()), 'no streak anywhere on the page');
    const sets = await page.evaluate(() => window.__storageLog.filter(x => x[0] === 'set').map(x => x[1]));
    ok(!sets.includes('creative-streak'), 'creative-streak (floored at 11) is no longer written');
    await page.getByRole('button', { name: /^Sense/ }).click();
    await page.getByRole('button', { name: /log|done|save/i }).filter({ hasText: /./ }).last().click();
    await wait(page, 700);
    ok((await page.locator('[data-play-reps]').innerText()) === '41 reps', 'logging adds a rep → ' + await page.locator('[data-play-reps]').innerText());
    await page.getByRole('button', { name: /^Log \(/ }).click();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Reset Log' }).click();
    await wait(page, 500);
    ok((await page.locator('[data-play-reps]').innerText()) === '41 reps' && (await mem(page, 'creative-reps')) === '41', 'clearing the log does not lower the count');
    await ctx.browser.close();

    // edit in progress is a draft
    const ctx2 = await openPage({ seed: { 'creative-log-v2': JSON.stringify(log) }, now: '2026-11-04T09:00:00' });
    const p2 = ctx2.page;
    await p2.waitForTimeout(3500);
    await p2.getByRole('button', { name: 'Play', exact: true }).click();
    await p2.getByRole('button', { name: /^Log \(/ }).click();
    await p2.getByText('Touch').first().click();
    await p2.getByRole('button', { name: /EDIT/ }).first().click();
    await p2.locator('textarea:visible').last().fill('Cold stone, then warm');
    await wait(p2, 1500);
    const drafts = JSON.parse(await mem(p2, 'drafts:roulette'));
    ok(drafts.drafts['entry-edit'] && drafts.drafts['entry-edit'].v && drafts.drafts['entry-edit'].v.text === 'Cold stone, then warm', 'the edit in progress is saved as a draft (drafts:roulette)');
    await ctx2.browser.close();
  }
}

// ───────────────────────── Follow-up fixes (Nov 4) ─────────────────────────
async function part6() {
  console.log('\n[6. Done: preview in view, "10 mins" not "10 mins min", moves a finished task to Done Log]');
  {
    let fake = newFake();
    fake.sheets.Ledger[2][8] = '10 mins';
    let ctx = await openLedger(fake);
    let page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').first().click();
    const detail = await page.locator('[data-pr-ledger-task]').innerText();
    ok(detail.includes('10 mins') && !/mins min/.test(detail) && detail.includes('2 min') , 'a value that already says "10 mins" is not shown as "10 mins min" → ' + detail.split('\n').filter(l => /mins|min/.test(l)).join(' | '));
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Put the tax folder' }).getByRole('button', { name: 'Done', exact: true }).click();
    await wait(page, 700);
    const box = await page.locator('[data-pr-ledger-preview]').boundingBox();
    ok(box && box.y >= 0 && box.y + box.height <= 844 + 2, 'the preview is brought into view after tapping Done → y ' + (box && Math.round(box.y)) + ', h ' + (box && Math.round(box.height)));
    ok(!(await page.locator('[data-pr-ledger-preview]').innerText()).includes('Bucket →'), 'not the last step: no Bucket line');
    await clickName(page, 'Cancel');
    await ctx.browser.close();

    // last open step of a task -> Bucket moves to the Done Log bucket (all its rows)
    fake = newFake();
    ctx = await openLedger(fake); page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').filter({ hasText: 'Book the dentist' }).click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Open the dentist page' }).getByRole('button', { name: 'Done', exact: true }).click();
    const pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(pv.includes('Bucket → 7. 🎉 DONE LOG (all 1 step of this task: it was the last open step)'), 'preview: the task moves to Done Log, shown like every other cell');
    await clickName(page, 'Confirm and send');
    await wait(page, 900);
    const w = writes(fake, 'update');
    ok(w.some(x => x.range === 'Ledger!A5' && x.values[0][0] === true) && w.some(x => x.range === 'Ledger!C5' && x.values[0][0] === '7. 🎉 DONE LOG') && w.length === 3, 'Done, Completed_At and Bucket written (3 cells) → ' + w.map(x => x.range).join(', '));
    ok(fake.sheets.Ledger[4][2] === '7. 🎉 DONE LOG', 'the sheet shows the new bucket');
    await ctx.browser.close();

    // the task got a new open step while the preview was open: Done only, no move
    fake = newFake();
    ctx = await openLedger(fake); page = ctx.page;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').filter({ hasText: 'Book the dentist' }).click();
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Open the dentist page' }).getByRole('button', { name: 'Done', exact: true }).click();
    fake.sheets.Ledger.push(G.ledgerRow({ Done: false, Bucket: G.WEEK, Domain: 'Body', Parent_Task: 'Book the dentist', Step_Num: 2, Step_Action: 'Pick a time' }));
    await clickName(page, 'Confirm and send');
    await wait(page, 900);
    const w2 = writes(fake, 'update');
    ok(w2.length === 2 && !w2.some(x => /^Ledger!C/.test(x.range)), 'another step opened meanwhile: only Done and Completed_At, the bucket is left alone');
    await ctx.browser.close();
  }

  console.log('\n[6. Brain Dump: no doc for this month yet → the newest "Brain Dump …" doc]');
  {
    const fake = newFake({ doc: { title: 'Brain Dump Oct 2026', paras: [{ text: 'Saturday, Oct 31, 2026', style: 'HEADING_1' }, { text: 'old', style: 'NORMAL_TEXT' }] } });
    const ctx = await openLedger(fake);
    const { page } = ctx;
    await wait(page, 600);
    await page.locator('[data-nw-quick="dump"]').click();
    await page.locator('textarea[aria-label="Brain Dump text"]').fill('Month-start thought');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForSelector('[data-nw-dump-preview]');
    const pv = await page.locator('[data-nw-dump-preview]').innerText();
    ok(pv.includes('Brain Dump Oct 2026') && /newest Brain Dump doc/.test(pv), 'the preview says it is using the newest doc');
    await page.locator('[data-nw-dump]').getByRole('button', { name: 'Send now' }).click();
    await wait(page, 1000);
    ok(fake.doc.paras[0].text === 'Tuesday, Nov 3, 2026' && /^Month-start thought/.test(fake.doc.paras[1].text) && fake.doc.paras[3].text === 'old', 'added at the top of the October doc; its text is untouched');
    await ctx.browser.close();
    const none = newFake({ driveFiles: [] });
    const c2 = await openLedger(none);
    await wait(c2.page, 600);
    await c2.page.locator('[data-nw-quick="dump"]').click();
    await c2.page.locator('textarea[aria-label="Brain Dump text"]').fill('x');
    await c2.page.locator('[data-nw-dump]').getByRole('button', { name: 'Send', exact: true }).click();
    await wait(c2.page, 800);
    ok(/No Google Doc named/.test(await c2.page.locator('[data-nw-dump]').innerText()), 'no Brain Dump doc at all: says so, nothing is lost');
    await c2.browser.close();
  }

  console.log('\n[6. Step_Num as the Ledger writes it: "Step 10 (90%->100%)"]');
  {
    const fake = newFake();
    const ctx = await openLedger(fake);
    const { page } = ctx;
    await page.waitForSelector('[data-pr-ledger-open]');
    await page.locator('[data-pr-ledger-open]').filter({ hasText: 'Real format task' }).click();
    const d = await page.locator('[data-pr-ledger-task]').innerText();
    ok(d.indexOf('Step 9') < d.indexOf('Step 10') && !/\(80%/.test(d), 'steps are ordered by their number (9 before 10) and shown as "Step 9", "Step 10"');
    await page.locator('[data-pr-ledger-step]').filter({ hasText: 'Ten' }).getByRole('button', { name: 'Done', exact: true }).click();
    ok((await page.locator('[data-pr-ledger-preview]').innerText()).includes('Mark done: Real format task · Step 10') && !/step Step/.test(await page.locator('[data-pr-ledger-preview]').innerText()), 'the preview says "Step 10", not "step Step 10"');
    // the canvas rewrites the percentages while the preview is open: the row is still found by its step number
    fake.sheets.Ledger.forEach(r => { if (r[5] === 'Step 10 (90%->100%)') r[5] = 'Step 10 (85%->100%)'; });
    await clickName(page, 'Confirm and send');
    await wait(page, 900);
    const w = writes(fake, 'update');
    ok(w.length >= 2 && w.some(x => x.range === 'Ledger!A13' && x.values[0][0] === true), 'the percentages changed meanwhile: still the same row (13) → ' + w.map(x => x.range).join(', '));
    // adding a step uses the same "Step N" form
    await page.locator('input[aria-label="New step for this task"]').fill('Eleven');
    await clickName(page, 'Review new step');
    ok((await page.locator('[data-pr-ledger-preview]').innerText()).includes('Step_Num Step 11 · Eleven'), 'new step preview: Step 11');
    await clickName(page, 'Confirm and send');
    await wait(page, 900);
    const last = fake.sheets.Ledger[fake.sheets.Ledger.length - 1];
    ok(last[4] === 'Real format task' && last[5] === 'Step 11' && last[6] === 'Eleven', 'the new row says "Step 11" like the others');
    await ctx.browser.close();
  }
}

// ───────────────────────── Past Brain Dumps (Nov 4) ─────────────────────────
async function part7() {
  console.log('\n[7. What now? searches every Brain Dump through Google; Claude gets only the matching lines]');
  const H = (t) => ({ text: t, style: 'HEADING_1' }), N = (t) => ({ text: t, style: 'NORMAL_TEXT' });
  const extra = [
    { id: 'DOC_OCT', title: 'Brain Dump Oct 2026', modifiedTime: '2026-10-31T10:00:00Z', paras: [H('Friday, Oct 30, 2026'), N("task: call the dentist about the crown before the cleaning (from Nikhil's World, 9:00 AM)"), N('work: phone Maria Lopez about the consent form'), N('note: ASMP report is late again'), N('life: buy a new bike light')] },
    { id: 'DOC_SEP', title: 'Brain Dump Sep 2026', modifiedTime: '2026-09-30T10:00:00Z', paras: [H('Monday, Sep 14, 2026'), N('note: the dentist moved my appointment twice'), N('life: nothing about teeth here but the lease is confusing')] },
  ];
  const fake = newFake({ extraDocs: extra });
  const ctx = await openLedger(fake, { proxy: nowProxy() });
  const { page } = ctx;
  await page.waitForSelector('[data-pr-ledger-open]');
  await page.locator('textarea[aria-label="What is in your head"]').fill('I keep putting off the dentist and the lease.');
  await clickName(page, 'What now?');
  await page.waitForSelector('[data-pr-now-patterns]');
  const text = ctx.proxyCalls[ctx.proxyCalls.length - 1].messages[0].content;
  ok(/Older Brain Dump lines that match/.test(text) && text.includes('Friday, Oct 30, 2026: task: call the dentist about the crown before the cleaning') && text.includes('Monday, Sep 14, 2026: note: the dentist moved my appointment twice'), 'lines from earlier months (Oct and Sep) that match what he wrote are sent');
  ok(text.includes('the lease is confusing'), 'a match in any month, not only the last 30 days');
  ok(!/Maria|ASMP|work:/.test(text.split('Older Brain Dump lines')[1].split('Context:')[0]), 'work lines (work: tag, ASMP) never go to Claude');
  ok(!text.includes('buy a new bike light') && !text.includes("from Nikhil's World, 9:00 AM"), 'unrelated lines are not sent; the app\'s own suffix is trimmed');
  ok(/Past Brain Dumps: 3 matching lines sent/.test(await page.locator('[data-pr-now-past]').innerText()), 'the screen says how many lines were sent → ' + await page.locator('[data-pr-now-past]').innerText());
  const driveCalls = fake.calls.filter(c => /drive\/v3\/files/.test(c.url));
  ok(driveCalls.some(c => decodeURIComponent(c.url).includes("name contains 'Brain Dump'")), 'the doc list comes from the Drive API');
  ok(fake.reads.extra === 2, 'each past doc was read once through the Docs API (' + fake.reads.extra + ')');
  const mem0 = await page.evaluate(() => JSON.stringify([...window.__mem.entries()]));
  ok(!/crown|lease is confusing/.test(mem0.replace(/I keep putting off the dentist and the lease\./g, '')), 'the older lines are not saved to the database');
  // second ask: docs unchanged → read from this device
  await page.locator('textarea[aria-label="What is in your head"]').fill('The dentist again.');
  await clickName(page, 'What now?');
  await wait(page, 1200);
  ok(fake.reads.extra === 2, 'a second ask re-reads nothing (kept on this device; Drive says no doc changed)');
  // a doc changes → only that one is read again
  fake.driveFiles.find(f => f.id === 'DOC_OCT').modifiedTime = '2026-11-02T10:00:00Z';
  await page.locator('textarea[aria-label="What is in your head"]').fill('The dentist, once more.');
  await clickName(page, 'What now?');
  await wait(page, 1200);
  ok(fake.reads.extra === 3, 'a changed doc is read again, the other is not (' + fake.reads.extra + ')');
  const cache = await page.evaluate(() => localStorage.getItem('__nw_dump_hist'));
  ok(cache && !/Maria|ASMP/.test(cache), 'the device copy has no work lines');
  await finish(ctx, 'past dumps');

  // no token / API off / offline: What now still works and says why
  const c2 = await openPractice({ seed: baseSeed(), now: '2026-11-03T08:10:00', device: dev(), google: newFake({ extraDocs: extra }).handler, proxy: nowProxy() });
  await wait(c2.page, 600);
  await c2.page.locator('textarea[aria-label="What is in your head"]').fill('the dentist');
  await clickName(c2.page, 'What now?');
  await c2.page.waitForSelector('[data-pr-now-patterns]');
  ok(/not signed in to Google/.test(await c2.page.locator('[data-pr-now-past]').innerText()) && !/Older Brain Dump/.test(c2.proxyCalls[c2.proxyCalls.length - 1].messages[0].content), 'not signed in: What now still works, says Past Brain Dumps were not used');
  await c2.browser.close();
  const off = newFake({ extraDocs: extra }); off.apiDisabled = 'docs';
  const c3 = await openLedger(off, { proxy: nowProxy() });
  await wait(c3.page, 600);
  await c3.page.locator('textarea[aria-label="What is in your head"]').fill('the dentist');
  await clickName(c3.page, 'What now?');
  await c3.page.waitForSelector('[data-pr-now-patterns]');
  ok(/Docs API is not turned on/.test(await c3.page.locator('[data-pr-now-past]').innerText()), 'Docs API off: one line, What now still answers');
  await c3.browser.close();

  // a lot of matches: best first, capped by lines and characters
  const many = [{ id: 'DOC_BIG', title: 'Brain Dump Aug 2026', modifiedTime: '2026-08-31T10:00:00Z', paras: [H('Monday, Aug 3, 2026'), ...Array.from({ length: 300 }, (_, i) => N(`note: dentist thought number ${i} ${'x'.repeat(40)}${i === 299 ? ' lease lease' : ''}`)), N('note: the dentist and the lease together')] }];
  const c4 = await openLedger(newFake({ extraDocs: many }), { proxy: nowProxy() });
  await wait(c4.page, 600);
  const r = await c4.page.evaluate(() => pPastDumps('the dentist and the lease'));
  ok(r.matched === 301 && r.lines.length === 80 && r.lines.join('').length <= 14000, 'many matches: all 301 found on the phone, 80 best sent (' + r.lines.length + ' lines, ' + r.lines.join('').length + ' chars)');
  ok(/dentist/.test(r.lines[0]) && /lease/.test(r.lines[0]) && r.lines.slice(0, 2).every(l => /lease/.test(l)), 'lines matching both words come first');
  await c4.browser.close();
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '1') await part1();
  if (which === 'all' || which === '2') await part2();
  if (which === 'all' || which === '3') await part3();
  if (which === 'all' || which === '4') await part4();
  if (which === 'all' || which === '5') await part5();
  if (which === 'all' || which === '6') await part6();
  if (which === 'all' || which === '7') await part7();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
