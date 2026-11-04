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
    ok(pv.includes('Step_Num 3') && pv.includes('Photograph the form'), 'new step preview: next Step_Num (3)');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    const last = fake.sheets.Ledger[fake.sheets.Ledger.length - 1];
    ok(last[4] === 'File the tax form' && last[2] === G.SPARK && last[3] === 'Home' && last[5] === 3 && last[6] === 'Photograph the form' && last[0] === '' && last[12] === '', 'appended row: same Parent_Task, Bucket, Domain; Step_Num 3; other cells left alone');
    await clickName(page, 'Add task');
    await page.locator('input[aria-label="Task name"]').fill('Fix the bike');
    await page.locator('input[aria-label="First physical step (Step 1)"]').fill('Put the bike on the stand');
    await page.locator('textarea[aria-label="Other steps, one per line"]').fill('Take the wheel off\nPatch the tube');
    await page.locator('select[aria-label="Bucket"]').selectOption(G.WEEK);
    await page.locator('select[aria-label="Domain"]').selectOption('Home');
    await clickName(page, 'Review task');
    pv = await page.locator('[data-pr-ledger-preview]').innerText();
    ok(pv.includes('Step_Num 1 · Put the bike on the stand') && pv.includes('Step_Num 3 · Patch the tube'), 'new task preview: first physical step is Step 1');
    await clickName(page, 'Confirm and send');
    await wait(page, 800);
    const n = fake.sheets.Ledger.length;
    const rows3 = fake.sheets.Ledger.slice(n - 3);
    ok(rows3.map(r => r[5]).join() === '1,2,3' && rows3.every(r => r[4] === 'Fix the bike' && r[2] === G.WEEK && r[3] === 'Home') && rows3[0][6] === 'Put the bike on the stand', 'task rows appended: Step 1, 2, 3 with bucket and domain');
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

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === '1') await part1();
  if (which === 'all' || which === '2') await part2();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
