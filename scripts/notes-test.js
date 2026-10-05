// Checks for drafts, notes, the shared Saved bar, log tidy, the Claude cost tracker and room on this device.
// Runs the page's REAL window.storage against the in-memory fake Firestore from p1-check.js (the live
// Firestore, its rules, the Cloud Functions and Google Drive are never touched; the AI proxy is a local fake).
// Run: NODE_PATH=$(npm root -g) node scripts/notes-test.js [1-10|all]
const { openPage } = require('./p1-check');
const F = require('./p1-fixtures');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const NOW = '2026-10-04T09:00:00';
const DAY = '2026_10_04';
const sanitise = (k) => k.replace(/[:/.#$[\]]/g, '_');
const asDocs = (kv) => Object.fromEntries(Object.entries(kv).map(([k, v]) => [sanitise(k), { key: k, value: v }]));
const nav = (page, name) => page.getByRole('button', { name, exact: true }).first().click();
const click = (page, name, exact = true) => page.getByRole('button', { name, exact }).first().click();
const waitFor = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const cloud = (page, id) => page.evaluate(id => { const d = window.__fakeDocs.get(id); return d && typeof d.value === 'string' ? JSON.parse(d.value) : null; }, id);
const cloudIds = (page) => page.evaluate(() => [...window.__fakeDocs.keys()]);
const bar = (page) => page.locator('[data-nw-savedbar]');
const pr = (page) => page.locator('.pr-root');

// The fake Firestore lives in the page; it is copied to sessionStorage before a reload and put back after,
// so a reload sees the same cloud. navigator.onLine follows sessionStorage.__test_offline.
// The test clock restarts at the scenario's time on every load; after a reload it carries on from where it was.
const KEEP = () => {
  const last = Number(sessionStorage.getItem('__last_now')) || 0;
  const D = window.Date;
  if (last && D.now() < last) {
    const off = last - D.now() + 1000;
    class Later extends D { constructor(...a) { if (a.length === 0) super(D.now() + off); else super(...a); } static now() { return D.now() + off; } }
    window.Date = Later;
  }
  const raw = sessionStorage.getItem('__fake_docs');
  if (raw && window.__fakeDocs) { window.__fakeDocs.clear(); JSON.parse(raw).forEach(([k, v]) => window.__fakeDocs.set(k, v)); }
  Object.defineProperty(navigator, 'onLine', { get: () => sessionStorage.getItem('__test_offline') !== '1', configurable: true });
};
async function open(fake, opts = {}) {
  const ctx = await openPage({ fakeFirestore: fake, now: NOW, ...opts });
  await ctx.page.addInitScript(KEEP);
  await ctx.page.evaluate(KEEP);
  await ctx.page.waitForTimeout(2500);
  return ctx;
}
async function reload(ctx) {
  await ctx.page.evaluate(() => { sessionStorage.setItem('__fake_docs', JSON.stringify([...window.__fakeDocs.entries()])); sessionStorage.setItem('__last_now', String(Date.now())); });
  await ctx.page.reload();
  await ctx.page.waitForFunction(() => document.querySelector('nav button'), null, { timeout: 60000 });
  await ctx.page.waitForTimeout(2500);
}
const setOffline = (page, off) => page.evaluate(off => { sessionStorage.setItem('__test_offline', off ? '1' : '0'); window.dispatchEvent(new Event(off ? 'offline' : 'online')); }, off);
async function done(ctx, label) {
  ok(ctx.errors.length === 0, `${label}: no console errors${ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''}`);
  await ctx.browser.close();
}
async function practice(page) { await nav(page, 'Practice'); await page.waitForSelector('.pr-root h1'); await page.waitForTimeout(400); }
const base = () => asDocs(F.base());
const tasksSeed = () => {
  const projects = [{ id: 'p1', name: 'Test project', archetype: 'Long-form Creative Drop', finalDeadline: '2026-10-20', status: 'active' }];
  const tasks = [
    { id: 't1', projectId: 'p1', name: 'Write outline', leadDays: 0, sprint: 'S3', est: 30, status: 'open', subtasks: [{ id: 's1', name: 'Pick a title', status: 'open' }] },
    { id: 't2', projectId: 'p1', name: 'Old finished task', leadDays: 0, sprint: 'S3', est: 30, status: 'done' },
  ];
  return asDocs({ 'kaizen3:projects': JSON.stringify(projects), 'kaizen3:tasks': JSON.stringify(tasks), 'kaizen3:seeded': 'true' });
};

// ── 1. Drafts restore after a reload and clear on submit (Practice, Kaizen, Play) ──
async function part1() {
  console.log('\n[1. Drafts: saved ~1 s after typing, restored after reload, cleared on submit, in three tabs]');
  const ctx = await open({ ...base(), ...tasksSeed() });
  const { page } = ctx;
  await practice(page);
  await page.fill('#pr-forgot', 'Keys in the car');
  await page.waitForTimeout(400);
  let d = await cloud(page, 'practice_drafts');
  ok(!d || !d.drafts?.forgot, 'Practice: nothing saved while still typing (before the 1-second pause)');
  ok(await waitFor(page, () => { const x = window.__fakeDocs.get('practice_drafts'); return x && JSON.parse(x.value).drafts.forgot?.v === 'Keys in the car'; }), 'Practice: the Forgot box is saved to practice:drafts about 1 s after typing stops');
  await nav(page, 'Kaizen');
  await page.getByPlaceholder('What just got done?').fill('Emptied the dishwasher');
  await nav(page, 'Play');
  await page.getByPlaceholder('The icicle on the porch. Or whatever.').fill('A crow on the fence');
  ok(await waitFor(page, () => { const k = window.__fakeDocs.get('drafts_kaizen'), r = window.__fakeDocs.get('drafts_roulette'); return k && r && JSON.parse(k.value).drafts.tada?.v?.text === 'Emptied the dishwasher' && JSON.parse(r.value).drafts.huh?.v === 'A crow on the fence'; }), 'Kaizen (drafts:kaizen) and Play (drafts:roulette) drafts saved, one small doc per tab');
  await reload(ctx);
  await practice(page);
  ok((await page.inputValue('#pr-forgot')) === 'Keys in the car', 'after reload: the Practice Forgot box is restored');
  await nav(page, 'Kaizen');
  ok((await page.getByPlaceholder('What just got done?').inputValue()) === 'Emptied the dishwasher', 'after reload: the Kaizen ta-da box is restored');
  await nav(page, 'Play');
  ok((await page.getByPlaceholder('The icicle on the porch. Or whatever.').inputValue()) === 'A crow on the fence', 'after reload: the Play "Huh" box is restored');
  // Submit each one: the box empties and the draft is cleared.
  await page.getByPlaceholder('The icicle on the porch. Or whatever.').press('Enter');
  await nav(page, 'Kaizen');
  await page.getByPlaceholder('What just got done?').press('Enter');
  await practice(page);
  await page.locator('#pr-forgot').press('Enter');
  await page.waitForTimeout(1500);
  const p = await cloud(page, 'practice_drafts'), k = await cloud(page, 'drafts_kaizen'), r = await cloud(page, 'drafts_roulette');
  ok(p.drafts.forgot && p.drafts.forgot.v === null && k.drafts.tada.v === null && r.drafts.huh.v === null, 'submit clears the draft in each doc (kept as a cleared marker so an older copy from another device cannot bring it back)');
  const log = await cloud(page, `practice_log_${DAY}`);
  ok(log.entries.some(e => e.practiceId === 'forgot-log' && e.note === 'Keys in the car'), 'the Forgot entry itself was logged');
  await reload(ctx);
  await practice(page);
  ok((await page.inputValue('#pr-forgot')) === '', 'after another reload the submitted Forgot box stays empty');
  await nav(page, 'Kaizen');
  ok((await page.getByPlaceholder('What just got done?').inputValue()) === '', 'and the Kaizen ta-da box stays empty');
  // A guided flow in progress: closed at step 2, reopened at step 2 with its note.
  await practice(page);
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: /^Self-compassion break/ }).first().click();
  await click(page, 'Start');
  await click(page, 'Begin'); await click(page, 'Next');
  await click(page, '+ Note');
  await page.getByLabel('Note for this step').fill('Hard to say this one');
  await page.waitForTimeout(1500);
  await reload(ctx);
  await practice(page);
  let t = await pr(page).innerText();
  ok(/Not finished\s+Self-compassion break · step 2 of 3/.test(t), 'after reload, Today shows the unfinished guided flow (step 2 of 3)');
  await click(page, 'Continue');
  t = await pr(page).innerText();
  ok(t.includes('Step 2 of 3') && (await page.getByLabel('Note for this step').inputValue()) === 'Hard to say this one', 'Continue reopens it at step 2 with the step note');
  // Other text boxes restore too (one check each): Dr. Shobha queue, Gaps form, Stuck "Ask Claude".
  await click(page, '✕ Close');
  await page.getByRole('tab', { name: 'Dr. Shobha' }).click();
  await page.fill('#pr-queue-add', 'Ask about sleep');
  await page.getByRole('tab', { name: 'Gaps' }).click();
  await page.getByLabel('Gap theme').fill('Evenings');
  await page.getByLabel('Gap options').fill('Walk\nCall someone');
  await click(page, 'Stuck');
  await page.getByLabel('Ask Claude').fill('Frozen at the desk');
  await page.waitForTimeout(1500);
  await reload(ctx);
  await practice(page);
  await page.getByRole('tab', { name: 'Dr. Shobha' }).click();
  const q = await page.inputValue('#pr-queue-add');
  await page.getByRole('tab', { name: 'Gaps' }).click();
  const g = [await page.getByLabel('Gap theme').inputValue(), await page.getByLabel('Gap options').inputValue()];
  await click(page, 'Stuck');
  const a = await page.getByLabel('Ask Claude').inputValue();
  ok(q === 'Ask about sleep' && g[0] === 'Evenings' && g[1] === 'Walk\nCall someone' && a === 'Frozen at the desk', 'queue add, the Gaps form and Ask Claude are restored after reload');
  await done(ctx, 'drafts');
}

// ── 2. Step notes, myNote and Waking up notes, shown in the practice detail ──
async function part2() {
  console.log('\n[2. Step notes, "Anything else?" and Waking up notes are saved and shown in the practice detail]');
  const ctx = await open(base(), { now: '2026-10-04T07:30:00' });
  const { page } = ctx;
  await practice(page);
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: /^Self-compassion break/ }).first().click();
  await click(page, 'Start');
  ok(!(await page.getByLabel('Note for this step').count()), 'a step screen has "+ Note", closed by default');
  await page.getByRole('radio', { name: '7' }).first().click();
  await click(page, 'Begin');
  await click(page, '+ Note');
  await page.getByLabel('Note for this step').fill('Tight chest');
  await click(page, 'Next'); await click(page, 'Next');
  await click(page, '+ Note');
  await page.getByLabel('Note for this step').fill('Softer this time');
  await click(page, 'Next');
  await page.getByRole('radio', { name: '3' }).first().click();
  await page.getByLabel('Anything else?').fill('Did it on the couch');
  await click(page, 'Save rep');
  await page.waitForTimeout(800);
  let log = await cloud(page, `practice_log_${DAY}`);
  const rep = log.entries.find(e => e.practiceId === 'sc-break');
  ok(rep && JSON.stringify(rep.stepNotes) === JSON.stringify([{ step: 1, text: 'This is a moment of suffering', note: 'Tight chest' }, { step: 3, text: 'May I be kind to myself', note: 'Softer this time' }]), 'stepNotes: only steps with a note, { step (1-based), text, note } → ' + JSON.stringify(rep && rep.stepNotes));
  ok(rep.myNote === 'Did it on the couch' && rep.before === 7 && rep.after === 3 && rep.note === undefined, 'myNote from "Anything else?", ratings kept, the old note field untouched');
  // Waking up: a note on Q1 and on a step, logged on "I'm up and moving".
  await page.getByRole('tab', { name: 'Today' }).click();
  await click(page, 'Waking up');
  await click(page, '+ Note');
  await page.getByLabel('Note for this step').fill('Alarm went off twice');
  await click(page, 'Eyes closed'); await click(page, 'Next');
  await click(page, '+ Note');
  await page.getByLabel('Note for this step').fill('Counting helped');
  await click(page, "I'm up and moving");
  await page.waitForTimeout(800);
  log = await cloud(page, `practice_log_${DAY}`);
  const up = log.entries.filter(e => e.practiceId === 'waking-ladder').pop();
  ok(up && up.level === 4 && JSON.stringify(up.stepNotes) === JSON.stringify([{ step: 1, text: 'Where are you?', note: 'Alarm went off twice' }, { step: 3, text: 'Count to 60 in your head. The clock stays hidden.', note: 'Counting helped' }]), 'Waking up notes go in stepNotes on the level-4 entry (Q1 = 1, Q2 = 2, steps from 3) → ' + JSON.stringify(up && up.stepNotes));
  await click(page, 'Back to Today');
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: /^Self-compassion break/ }).first().click();
  let t = await page.locator('[data-pr-recent]').innerText();
  ok(t.includes('2026-10-04 07:30') && t.includes('before 7, after 3') && t.includes('Note: Did it on the couch') && t.includes('Step 1 (This is a moment of suffering): Tight chest') && t.includes('Step 3 (May I be kind to myself): Softer this time'), 'Library detail: the rep with date, time, before/after, myNote and step notes');
  await click(page, '← Library');
  await page.getByRole('button', { name: /^Waking ladder/ }).first().click();
  t = await page.locator('[data-pr-recent]').innerText();
  ok(t.includes('Step 1 (Where are you?): Alarm went off twice') && t.includes('Counting helped'), 'Waking ladder detail shows the Waking up notes');
  await done(ctx, 'step notes');
}

// The last 5 reps of 30 days, newest first; older than 30 days left out.
async function part2b() {
  console.log('\n[2b. Library detail: last 5 reps of that practice from the last 30 days]');
  const logs = {};
  const add = (iso, entries) => { logs[`practice:log:${iso.replace(/-/g, '_')}`] = JSON.stringify({ date: iso, entries }); };
  add('2026-08-20', [{ time: '08:00', practiceId: 'sc-break', myNote: 'too old' }]);
  add('2026-09-10', [{ time: '08:00', practiceId: 'sc-break', myNote: 'sept 10' }]);
  add('2026-10-01', [{ time: '21:00', practiceId: 'sc-break', myNote: 'late' }, { time: '07:00', practiceId: 'sc-break', myNote: 'early' }]);
  add('2026-10-02', [{ time: '10:00', practiceId: 'sc-break' }, { time: '11:00', practiceId: 'countdown' }]);
  add('2026-10-03', [{ practiceId: 'sc-break', myNote: 'no time' }, { time: '12:00', practiceId: 'sc-break', before: 5, after: 2 }]);
  const ctx = await open({ ...base(), ...asDocs(logs) });
  const { page } = ctx;
  await practice(page);
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: /^Self-compassion break/ }).first().click();
  await page.waitForTimeout(500);
  const reps = await page.$$eval('[data-pr-rep]', els => els.map(e => e.innerText.split('\n')[0]));
  ok(reps.length === 5 && reps[0] === '2026-10-03' && reps[1].startsWith('2026-10-03 12:00') && reps[2].startsWith('2026-10-02 10:00') && reps[3].startsWith('2026-10-01 21:00') && reps[4].startsWith('2026-10-01 07:00'), 'five newest reps, newest first (an entry with no time sorts last in its day, so first when newest-first) → ' + JSON.stringify(reps));
  ok(!(await page.locator('[data-pr-recent]').innerText()).includes('too old'), 'a rep older than 30 days is not shown');
  await done(ctx, 'recent reps');
}

// ── 3. The Saved bar: Add note and Undo, on a Practice log and on a Vitals med entry ──
async function part3() {
  console.log('\n[3. "Saved · Add note · Undo" on a Practice log and on a med entry in Vitals]');
  const ctx = await open(base());
  const { page } = ctx;
  await practice(page);
  await click(page, 'Level 2');
  await page.waitForTimeout(600);
  let t = await bar(page).innerText();
  ok(/^Saved/.test(t) && t.includes('Add note') && t.includes('Undo'), 'after Level 2: the bar says "Saved · Add note · Undo" → ' + JSON.stringify(t));
  await click(bar(page), 'Add note');
  await page.getByLabel('Note for this entry').fill('Still under the blanket');
  await click(bar(page), 'Save note');
  await page.waitForTimeout(600);
  let log = await cloud(page, `practice_log_${DAY}`);
  ok(log.entries.length === 1 && log.entries[0].level === 2 && log.entries[0].myNote === 'Still under the blanket', 'Add note saves myNote on that same entry');
  ok((await bar(page).innerText()).startsWith('Note saved'), 'the bar says "Note saved"');
  await click(page, 'Level 3');
  await page.waitForTimeout(600);
  log = await cloud(page, `practice_log_${DAY}`);
  ok(log.entries.length === 2, 'Level 3 logged');
  await click(bar(page), 'Undo');
  await page.waitForTimeout(600);
  log = await cloud(page, `practice_log_${DAY}`);
  ok(log.entries.length === 1 && log.entries[0].level === 2 && log.entries[0].myNote === 'Still under the blanket', 'Undo removes exactly that entry (Level 3); Level 2 and its note stay');
  ok((await bar(page).innerText()).startsWith('Removed'), 'the bar says "Removed"');
  // Bar disappears after 30 s.
  await click(page, 'Level 1');
  await page.waitForTimeout(500);
  const shown = await bar(page).count();
  await page.waitForTimeout(30500);
  ok(shown === 1 && (await bar(page).count()) === 0, 'the bar shows for 30 s, then goes');
  // Vitals: a med entry.
  await nav(page, 'Vitals');
  await click(page, 'Medications');
  await page.getByRole('button', { name: /^Etilaam/ }).first().click();
  await page.waitForTimeout(1200);
  ok((await cloud(page, 'med-log-daily'))['2026-10-04']?.Etilaam === true, 'Vitals: tapping Etilaam saves it as taken');
  t = await bar(page).innerText();
  ok(/^Saved/.test(t) && t.includes('Undo'), 'Vitals: the same bar after a med entry');
  await click(bar(page), 'Add note');
  await page.getByLabel('Note for this entry').fill('With breakfast');
  await click(bar(page), 'Save note');
  await page.waitForTimeout(600);
  const notes = await cloud(page, `notes_${DAY}`);
  const n = notes && notes.notes.find(x => x.text === 'With breakfast');
  ok(n && n.tab === 'health' && n.ref && n.ref.what === 'Taken: Etilaam' && n.ref.day === '2026-10-04', 'a med entry has no note field, so Add note goes to notes:<day> with a reference (tab, what, day) → ' + JSON.stringify(n));
  await page.getByRole('button', { name: /^Dutasteride/ }).first().click();
  await page.waitForTimeout(1200);
  await click(bar(page), 'Undo');
  await page.waitForTimeout(1200);
  const med = (await cloud(page, 'med-log-daily'))['2026-10-04'];
  ok(med.Dutasteride === false && med.Etilaam === true, 'Undo un-marks exactly that med (Etilaam stays taken)');
  await done(ctx, 'saved bar');
}

// ── 4. The quick Note button, from two tabs ──
async function part4() {
  console.log('\n[4. The Note button: same place on every tab, saves to notes:<day>, lists today and yesterday]');
  const yesterday = { date: '2026-10-03', notes: [{ id: 'note_y', at: '2026-10-03T20:00:00.000Z', u: 1, tab: 'kaizen', text: 'From yesterday' }] };
  const ctx = await open({ ...base(), ...asDocs({ 'notes:2026_10_03': JSON.stringify(yesterday) }) });
  const { page } = ctx;
  let everywhere = true;
  for (const name of ['Play', 'Kaizen', 'Fuel', 'Vitals', 'Practice', 'Pending', 'System']) {
    await nav(page, name);
    const box = await page.locator('[data-nw-notebtn]').boundingBox();
    if (!box || box.x > 2 || !(await page.locator('[data-nw-notebtn]').isVisible())) everywhere = false;
  }
  ok(everywhere, 'the Note button is visible in the same place (left of the status line) on all 7 tabs');
  await practice(page);
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: /^Countdown 5-4-3-2-1/ }).first().click();
  await click(page, 'Start'); await click(page, 'Begin');
  await page.locator('[data-nw-notebtn]').click();
  await page.getByLabel('Quick note').fill('Counting out loud felt silly');
  await click(page.locator('[data-nw-quicknote]'), 'Save note');
  await page.waitForTimeout(600);
  await nav(page, 'Kaizen');
  ok(!(await page.locator('[data-nw-quicknote]').count()), 'switching tabs closes the note panel');
  await page.locator('[data-nw-notebtn]').click();
  await page.getByLabel('Quick note').fill('Kaizen thought');
  await click(page.locator('[data-nw-quicknote]'), 'Save note');
  await page.waitForTimeout(800);
  const doc = await cloud(page, `notes_${DAY}`);
  const [a, b] = doc.notes;
  ok(doc.notes.length === 2 && a.tab === 'practice' && a.screen === 'Guided flow' && a.practice === 'countdown' && a.step === 1 && a.text === 'Counting out loud felt silly' && typeof a.id === 'string' && !isNaN(Date.parse(a.at)), 'the Practice note has the tab, screen, current practice and step → ' + JSON.stringify(a));
  ok(b.tab === 'kaizen' && b.screen === 'Today' && b.text === 'Kaizen thought', 'the Kaizen note has its tab and screen');
  const list = await page.$$eval('[data-nw-note]', els => els.map(e => e.innerText.split('\n').pop()));
  ok(JSON.stringify(list) === JSON.stringify(['Kaizen thought', 'Counting out loud felt silly', 'From yesterday']), "the panel lists today's and yesterday's notes, newest first → " + JSON.stringify(list));
  ok((await page.locator('[data-nw-quicknote]').innerText()).includes('Note saved'), 'it says "Note saved"');
  await reload(ctx);
  await nav(page, 'Kaizen');
  await page.locator('[data-nw-notebtn]').click();
  await page.getByLabel('Quick note').fill('half a thought');
  await page.waitForTimeout(1500);
  await reload(ctx);
  await nav(page, 'Kaizen');
  await page.locator('[data-nw-notebtn]').click();
  ok((await page.getByLabel('Quick note').inputValue()) === 'half a thought', 'the Note box uses the drafts hook (restored after reload)');
  await done(ctx, 'quick note');
}

// ── 5. Log tidy: a double tap logs once; Log again; time order; edits keep the original ──
async function part5() {
  console.log('\n[5. A double tap logs once, "Log again" logs a deliberate repeat, time order, edits keep the original]');
  const seeded = { date: '2026-10-04', entries: [{ time: '08:30', practiceId: 'countdown', source: 'routine' }, { practiceId: 'sc-break', source: 'routine' }, { time: '06:10', practiceId: 'waking-ladder', level: 2, source: 'routine' }] };
  const ctx = await open({ ...base(), ...asDocs({ [`practice:log:${DAY}`]: JSON.stringify(seeded) }) });
  const { page } = ctx;
  await practice(page);
  let rows = await page.$$eval('[data-pr-entry]', els => els.map(e => e.innerText));
  ok(rows.length === 3 && rows[0].startsWith('06:10 Waking ladder') && rows[1].startsWith('08:30 Countdown') && rows[2].startsWith('Self-compassion break'), "today's entries shown in time order, no time last → " + JSON.stringify(rows));
  let stored = await cloud(page, `practice_log_${DAY}`);
  ok(stored.entries[0].practiceId === 'countdown' && stored.entries[1].practiceId === 'sc-break', 'what is stored is not reordered');
  await page.getByRole('button', { name: 'Level 4', exact: true }).dblclick();
  await page.waitForTimeout(1200);
  stored = await cloud(page, `practice_log_${DAY}`);
  ok(stored.entries.filter(e => e.level === 4).length === 1, 'a double tap on Level 4 logs once (the live case: two identical level-4 entries a moment apart)');
  await click(page, 'Level 4');
  await page.waitForTimeout(600);
  stored = await cloud(page, `practice_log_${DAY}`);
  const t = await bar(page).innerText();
  ok(stored.entries.filter(e => e.level === 4).length === 1 && /^Already logged/.test(t) && t.includes('Log again'), 'the same entry again within 60 s → "Already logged · Log again", nothing added');
  await click(bar(page), 'Log again');
  await page.waitForTimeout(800);
  stored = await cloud(page, `practice_log_${DAY}`);
  ok(stored.entries.filter(e => e.level === 4).length === 2, '"Log again" logs the deliberate repeat in one tap');
  // A stored duplicate (another device or before a reload) is caught too.
  await reload(ctx);
  await practice(page);
  await click(page, 'Level 4');
  await page.waitForTimeout(800);
  stored = await cloud(page, `practice_log_${DAY}`);
  ok(stored.entries.filter(e => e.level === 4).length === 2 && /^Already logged/.test(await bar(page).innerText()), 'after a reload, an entry identical to the stored previous one within 60 s is also caught');
  // Edit an entry's time.
  await page.locator('[data-pr-entry]', { hasText: '08:30 Countdown' }).click();
  await page.getByLabel('Entry time').fill('08:05');
  await page.getByLabel('Entry note').fill('Before coffee');
  await click(page, 'Save');
  await page.waitForTimeout(800);
  stored = await cloud(page, `practice_log_${DAY}`);
  const cd = stored.entries.find(e => e.practiceId === 'countdown');
  ok(cd.time === '08:05' && cd.myNote === 'Before coffee' && cd.edits.length === 2 && cd.edits[0].field === 'time' && cd.edits[0].from === '08:30' && cd.edits[1].field === 'myNote' && cd.edits[1].from === null && !isNaN(Date.parse(cd.edits[0].at)), 'editing the time keeps the original in edits [{ at, field, from }] → ' + JSON.stringify(cd.edits));
  rows = await page.$$eval('[data-pr-entry]', els => els.map(e => e.innerText));
  ok(rows[1].startsWith('08:05 Countdown') && rows[1].includes('Before coffee') && rows[1].includes('edited'), 'the list shows the new time, the note and "edited"');
  // Buttons are disabled while a save is in progress.
  await page.evaluate(() => { window.__hold = new Promise(r => { window.__release = r; }); window.__fakeFail = (op, id) => (op === 'set' && id === 'practice_log_2026_10_04' ? window.__hold : null); });
  await page.getByRole('button', { name: 'Level 1', exact: true }).click();
  await page.waitForTimeout(200);
  const dis = await page.getByRole('button', { name: 'Level 1', exact: true }).isDisabled();
  await page.evaluate(() => window.__release());
  await page.waitForTimeout(600);
  ok(dis, 'the Level buttons are disabled while the save is in progress');
  await done(ctx, 'log tidy');
}

// ── 6. Kaizen: doneAt on tasks and subtasks ──
async function part6() {
  console.log('\n[6. Kaizen: done saves doneAt; Undo and reopening remove it; old done tasks untouched]');
  const ctx = await open({ ...base(), ...tasksSeed() });
  const { page } = ctx;
  await nav(page, 'Kaizen');
  await click(page, 'Tasks');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Mark done: Write outline' }).click();
  await page.waitForTimeout(1200);
  let tasks = await cloud(page, 'kaizen3_tasks');
  let t1 = tasks.find(t => t.id === 't1');
  ok(t1.status === 'done' && !isNaN(Date.parse(t1.doneAt)) && t1.doneAt.startsWith('2026-10-04'), 'marking a task done saves doneAt (ISO time) → ' + t1.doneAt);
  ok(!('doneAt' in tasks.find(t => t.id === 't2')), 'a task finished before this change gets no doneAt');
  ok(/^Saved/.test(await bar(page).innerText()), 'the shared bar shows after marking it done');
  await click(bar(page), 'Undo');
  await page.waitForTimeout(1200);
  tasks = await cloud(page, 'kaizen3_tasks');
  t1 = tasks.find(t => t.id === 't1');
  ok(t1.status === 'open' && !('doneAt' in t1), 'Undo reopens it and removes doneAt');
  // Subtask: done, then reopened by tapping again.
  await click(page, 'All');
  await page.getByText(/1 sub-task|0\/1/).first().click().catch(() => {});
  const sub = page.getByRole('button', { name: 'Mark done: Pick a title' });
  if (!(await sub.count())) await page.locator('button', { hasText: /sub/i }).first().click().catch(() => {});
  await page.getByRole('button', { name: 'Mark done: Pick a title' }).click();
  await page.waitForTimeout(1200);
  tasks = await cloud(page, 'kaizen3_tasks');
  let s1 = tasks.find(t => t.id === 't1').subtasks[0];
  ok(s1.status === 'done' && !isNaN(Date.parse(s1.doneAt)), 'marking a subtask done saves doneAt on it');
  await page.getByRole('button', { name: 'Reopen: Pick a title' }).click();
  await page.waitForTimeout(1200);
  tasks = await cloud(page, 'kaizen3_tasks');
  s1 = tasks.find(t => t.id === 't1').subtasks[0];
  ok(s1.status === 'open' && !('doneAt' in s1), 'reopening the subtask removes doneAt');
  await done(ctx, 'kaizen doneAt');
}

// ── 7. Drafts and notes from two devices merge without a conflict copy ──
async function part7() {
  console.log('\n[7. Drafts and notes saved from two devices merge (per draft by time, per note by id), no conflict copy]');
  const ctx = await open(base());
  const { page } = ctx;
  await practice(page);
  // This device goes offline and saves a draft and a note.
  await setOffline(page, true);
  await page.fill('#pr-forgot', 'Phone charger at work');
  await page.waitForTimeout(1500);
  await page.locator('[data-nw-notebtn]').click();
  await page.getByLabel('Quick note').fill('Note from this device');
  await click(page.locator('[data-nw-quicknote]'), 'Save note');
  await page.waitForTimeout(800);
  ok((await page.locator('[data-nw-quicknote]').innerText()).includes('Note on this device only, not in the cloud yet'), 'offline: the note says "on this device only, not in the cloud yet"');
  // Meanwhile another device saved its own draft and note to the same docs.
  await page.evaluate(() => {
    const later = Date.now() + 5000;
    const d = window.__fakeDocs.get('practice_drafts');
    const drafts = d ? JSON.parse(d.value).drafts : {};
    drafts.queue = { v: 'From the laptop', at: later };
    drafts.forgot = { v: 'Older text from the laptop', at: Date.now() - 60000 };
    window.__fakeDocs.set('practice_drafts', { key: 'practice:drafts', value: JSON.stringify({ drafts }), updatedAt: new Date(later) });
    window.__fakeDocs.set('notes_2026_10_04', { key: 'notes:2026_10_04', value: JSON.stringify({ date: '2026-10-04', notes: [{ id: 'note_laptop', at: '2026-10-04T16:00:00.000Z', u: 1, tab: 'kaizen', text: 'Note from the laptop' }] }), updatedAt: new Date(later) });
  });
  await setOffline(page, false);
  ok(await waitFor(page, () => window.storage.status().waiting === 0), 'back online: everything waiting uploads');
  const drafts = (await cloud(page, 'practice_drafts')).drafts;
  ok(drafts.forgot.v === 'Phone charger at work' && drafts.queue.v === 'From the laptop', 'drafts merged per draft: the newer Forgot text (this device) and the laptop\'s queue draft are both kept');
  const notes = (await cloud(page, `notes_${DAY}`)).notes.map(n => n.text);
  ok(notes.includes('Note from this device') && notes.includes('Note from the laptop') && notes.length === 2, 'notes merged by id: both notes kept → ' + JSON.stringify(notes));
  let ids = await cloudIds(page);
  ok(!ids.some(id => /__conflict_/.test(id)), 'no conflict copy was made → ' + ids.filter(id => /drafts|notes/.test(id)).join(', '));
  // Online too: the other device writes between two of this device's saves.
  await page.evaluate(() => {
    const d = window.__fakeDocs.get('notes_2026_10_04');
    const v = JSON.parse(d.value);
    v.notes.push({ id: 'note_phone2', at: '2026-10-04T16:30:00.000Z', u: 2, tab: 'food', text: 'Online from the other device' });
    window.__fakeDocs.set('notes_2026_10_04', { ...d, value: JSON.stringify(v), updatedAt: new Date(Date.now() + 9000) });
  });
  const r = await page.evaluate(() => window.nwAddNote({ tab: 'practice', text: 'Second note here' }));
  const after = (await cloud(page, `notes_${DAY}`)).notes.map(n => n.text);
  ok(r.where === 'cloud' && after.length === 4 && after.includes('Online from the other device') && after.includes('Second note here'), 'online, a save merges with what the other device wrote in between → ' + JSON.stringify(after));
  // A cleared draft beats an older copy; a removed note stays removed.
  await page.evaluate(() => window.nwRemoveNote('notes:2026_10_04', 'note_laptop'));
  ids = (await cloud(page, `notes_${DAY}`)).notes.filter(n => n.deleted).map(n => n.id);
  ok(ids.includes('note_laptop'), 'a removed note is kept as { id, deleted } so another device cannot bring it back');
  await done(ctx, 'merge');
}

// ── 8. Claude cost tracker ──
async function part8() {
  console.log('\n[8. Claude cost tracker: calls, cost by kind, cache reads vs writes, the $5 limit; Kaizen analysis counted]');
  const asks1 = { date: '2026-10-01', entries: [
    { time: '08:00', kind: 'stuck', usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 4000, cache_read_input_tokens: 0 } },
    { time: '09:00', kind: 'stuck', usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 4000 } },
  ] };
  const asks2 = { date: '2026-10-02', entries: [{ time: '10:00', kind: 'coach-me', usage: { input_tokens: 200000, output_tokens: 100000 } }] };
  const lastMonth = { date: '2026-09-30', entries: [{ time: '10:00', kind: 'stuck', usage: { input_tokens: 9e6, output_tokens: 9e6 } }] };
  const sessions = [{ id: 's1', date: '2026-10-01', type: 'Brighton', title: 'Brighton', key_themes: ['ground'], key_insight: 'feet', raw_notes: 'notes' }];
  const proxy = async () => ({ status: 200, json: { model: 'claude-sonnet-5-5', content: [{ type: 'text', text: '{"foci":[{"theme":"Ground","description":"d","domain":"physical","sessions_count":1,"trajectory":"active","latest_assignment":"a"}],"cross_pattern":"c","nervous_system_note":"n","next_edge":"e"}' }], usage: { input_tokens: 3000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
  const ctx = await open({ ...base(), ...asDocs({ 'practice:asks:2026_10_01': JSON.stringify(asks1), 'practice:asks:2026_10_02': JSON.stringify(asks2), 'practice:asks:2026_09_30': JSON.stringify(lastMonth), 'session-summaries': JSON.stringify(sessions) }) }, { proxy });
  const { page } = ctx;
  // Kaizen's session-pattern analysis saves its usage like every other call.
  await nav(page, 'Kaizen');
  await click(page, 'Arc');
  await click(page, '🧘 Sessions & Foci');
  await page.getByRole('button', { name: /Update foci/ }).click();
  await page.waitForTimeout(1500);
  const saved = await cloud(page, `practice_asks_${DAY}`);
  const rec = saved && saved.entries[0];
  ok(rec && rec.kind === 'kaizen-foci' && rec.usage.input_tokens === 3000 && rec.usage.output_tokens === 1000 && rec.model === 'claude-sonnet-5-5', 'the Kaizen analysis call is saved to practice:asks:<today> with its usage, kind "kaizen-foci"');
  await nav(page, 'System');
  await page.waitForTimeout(1200);
  const txt = (sel) => page.locator(sel).innerText();
  // stuck: 2×(1000×2 + 500×10)/1e6 = 0.014; + 4000×2.5/1e6 = 0.010 write; + 4000×0.2/1e6 = 0.0008 read → 0.0248
  // coach-me: 200000×2/1e6 + 100000×10/1e6 = 0.4 + 1.0 = 1.40; kaizen-foci: 3000×2/1e6 + 1000×10/1e6 = 0.016. Total 1.4408.
  ok((await txt('[data-nw-cost-calls]')) === '4', 'calls this month: 4 (last month left out)');
  ok((await txt('[data-nw-cost-total]')) === '$1.44', 'estimated cost $1.44 → ' + await txt('[data-nw-cost-total]'));
  ok((await txt('[data-nw-cost-limit]')) === '$1.44 of $5.00 (29%)', 'against the $5 monthly limit: "$1.44 of $5.00 (29%)"');
  const kinds = await page.$$eval('[data-nw-cost-kind]', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  ok(JSON.stringify(kinds) === JSON.stringify(['Coach me 1 call · $1.40', 'Ask Claude (Stuck) 2 calls · $0.02', 'Kaizen session patterns 1 call · $0.02']), 'by kind → ' + JSON.stringify(kinds));
  ok((await txt('[data-nw-cache-reads]')) === '4,000 tokens · $0.0008' && (await txt('[data-nw-cache-writes]')) === '4,000 tokens · $0.01', 'cache reads vs cache writes, tokens and cost');
  // Saved by reads: 4000×(2−0.2)/1e6 = 0.0072; extra paid for writes: 4000×(2.5−2)/1e6 = 0.002 → net 0.0052.
  ok((await txt('[data-nw-cache-net]')).replace(/\s+/g, ' ') === 'Caching is paying off saves $0.0052', 'whether caching is paying off → ' + await txt('[data-nw-cache-net]'));
  const fn = await page.evaluate(() => {
    const c = window.nwClaudeCost([{ kind: 'x', usage: { input_tokens: 1e6, output_tokens: 1e6, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 } }]);
    return c.total.usd;
  });
  ok(Math.abs(fn - (2 + 10 + 2.5 + 0.2)) < 1e-9, 'prices: $2/M input, $10/M output, cache writes 1.25×, cache reads 0.1× → $14.70 for 1M of each');
  await done(ctx, 'cost tracker');
}

// ── 9. Room on this device: the old kaizen3:logs copy ──
async function part9() {
  console.log('\n[9. Room on this device: the old kaizen3:logs device copy over 60%]');
  const days = {};
  for (let i = 1; i <= 20; i++) days[`2026-06-${String(i).padStart(2, '0')}`] = { highlight: 'day ' + i, brainDump: 'x'.repeat(78000) };
  const local = JSON.stringify(days); // ~1.56 M characters ≈ 3.1 MB at 2 bytes each: over 60% of 5 MB
  const seedLocal = (extra) => ({ html: (h) => h.replace('<head>', `<head><script>try{if(!sessionStorage.getItem('__seeded')){sessionStorage.setItem('__seeded','1');localStorage.setItem('kaizen3:logs', ${JSON.stringify(local)});${extra || ''}}}catch(e){}</script>`) });
  const run = async (label, cloudDays, extraLocal, check) => {
    const fake = { ...base(), kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify(cloudDays) }, kaizen4_logs: { key: 'kaizen4:logs', value: JSON.stringify({ '2026-10-03': { highlight: 'now' } }) } };
    const ctx = await open(fake, seedLocal(extraLocal));
    await ctx.page.waitForTimeout(2500);
    await check(ctx.page);
    await done(ctx, label);
  };
  await run('room: matching', days, '', async (page) => {
    ok(await waitFor(page, () => localStorage.getItem('kaizen3:logs') === null), 'every day matches the cloud → the device copy is removed (on its own, once over 60% and online)');
    const ids = await cloudIds(page);
    ok(!ids.some(id => /__conflict_/.test(id)) && ids.includes('kaizen3_logs'), 'no conflict copy; the cloud doc is untouched');
  });
  const missing = { ...days }; delete missing['2026-06-07'];
  await run('room: a day missing', missing, '', async (page) => {
    ok(await waitFor(page, () => localStorage.getItem('kaizen3:logs') === null), 'a day missing from the cloud → the device copy is removed only after…');
    const r = await page.evaluate(() => {
      const id = [...window.__fakeDocs.keys()].find(k => /^kaizen3_logs__conflict_\d/.test(k) && !/__split_/.test(k));
      const d = id && window.__fakeDocs.get(id);
      if (!d) return null;
      // Over 900,000 bytes, so it is split into pieces: put them back together.
      const value = d.split ? d.split.pieces.map(p => window.__fakeDocs.get(p).value).join('') : d.value;
      return { id, key: d.key, conflictOf: d.conflictOf, days: d.days, split: !!d.split, n: Object.keys(JSON.parse(value)).length };
    });
    ok(r && r.key === 'kaizen3:logs' && r.conflictOf === 'kaizen3_logs' && r.n === 20 && r.split && JSON.stringify(r.days) === '["2026-06-07"]', '…the whole device copy was saved in the cloud as a conflict copy (naming the missing day), split into pieces as it is over 900,000 bytes → ' + JSON.stringify(r && { id: r.id, days: r.days }));
    const order = await page.evaluate(() => window.__fakeOrder.filter(x => /kaizen3_logs__conflict_/.test(x) && !/__split_/.test(x)));
    ok(order.length === 1, 'the conflict copy was written (and read back to confirm) before the removal');
    ok((await page.locator('[data-nw-banner="room"]').count()) === 1, 'one banner says what happened and names the copy');
  });
  // A conflict copy that can't be written: nothing is removed.
  {
    const fake = { ...base(), kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify(missing) } };
    const ctx = await openPage({ fakeFirestore: fake, now: NOW, ...seedLocal('') });
    await ctx.page.evaluate(() => { window.__fakeFail = (op, id) => (op === 'set' && /__conflict_/.test(id) ? 'reject' : null); });
    const r = await ctx.page.evaluate(() => window.storage.makeRoom(true));
    ok(r.some(x => x.action === 'kept') && (await ctx.page.evaluate(() => localStorage.getItem('kaizen3:logs') !== null)), 'if the conflict copy is not confirmed in the cloud, the device copy is kept → ' + JSON.stringify(r));
    await done(ctx, 'room: copy fails');
  }
  // Something waiting to upload: kept.
  {
    const fake = { ...base(), kaizen3_logs: { key: 'kaizen3:logs', value: JSON.stringify(days) } };
    // A Kaizen log save waiting to upload (the cloud keeps rejecting it).
    const q = `localStorage.setItem('__nw_upload_queue', JSON.stringify([{ key: 'kaizen4:logs', id: 'kaizen4_logs', at: 1, firstAt: 1, reason: 'test', what: 'Kaizen daily log' }])); localStorage.setItem('kaizen4:logs', '{}'); window.__fakeFail = (op, id) => (op === 'set' && id === 'kaizen4_logs' ? 'reject' : null);`;
    const ctx = await openPage({ fakeFirestore: fake, now: NOW, ...seedLocal(q) });
    await ctx.page.waitForTimeout(3000);
    const r = await ctx.page.evaluate(() => window.storage.makeRoom(true));
    ok(r.length === 1 && r[0].action === 'kept' && r[0].why === 'waiting to upload' && (await ctx.page.evaluate(() => localStorage.getItem('kaizen3:logs') !== null)), 'an upload waiting for it → the device copy is kept → ' + JSON.stringify(r));
    await done(ctx, 'room: waiting');
  }
  // Offline: nothing happens.
  {
    const ctx = await openPage({ fakeFirestore: { ...base() }, now: NOW, offline: true, ...seedLocal('') });
    await ctx.page.waitForTimeout(2500);
    const r = await ctx.page.evaluate(() => window.storage.makeRoom(true));
    ok(r.length === 0 && (await ctx.page.evaluate(() => localStorage.getItem('kaizen3:logs') !== null)), 'offline → nothing is compared or removed');
    await done(ctx, 'room: offline');
  }
}

// ── 10. Offline: drafts, the Note button and the Saved bar ──
async function part10() {
  console.log('\n[10. Offline: drafts, the Note button and the bar are device-only, and upload when back online]');
  const ctx = await open(base());
  const { page } = ctx;
  await practice(page);
  await setOffline(page, true);
  await page.fill('#pr-forgot', 'Wallet on the shelf');
  await page.waitForTimeout(1500);
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('practice:drafts') || '{}').drafts?.forgot?.v)) === 'Wallet on the shelf' && !(await cloud(page, 'practice_drafts')), 'offline: the draft is kept on this device (not in the cloud yet)');
  await click(page, 'Level 2');
  await page.waitForTimeout(600);
  const t = await bar(page).innerText();
  ok(t.startsWith('On this device only, not in the cloud yet') && !/^Saved/.test(t) && t.includes('Add note') && t.includes('Undo'), 'offline: the bar says "On this device only, not in the cloud yet · Add note · Undo", never "Saved" → ' + JSON.stringify(t));
  await click(bar(page), 'Add note');
  await page.getByLabel('Note for this entry').fill('Offline note');
  await click(bar(page), 'Save note');
  await page.waitForTimeout(500);
  ok((await bar(page).innerText()).startsWith('Note on this device only, not in the cloud yet'), 'offline Add note: "Note on this device only, not in the cloud yet"');
  await page.locator('[data-nw-notebtn]').click();
  await page.getByLabel('Quick note').fill('Quick offline note');
  await click(page.locator('[data-nw-quicknote]'), 'Save note');
  await page.waitForTimeout(500);
  ok((await page.locator('[data-nw-quicknote]').innerText()).includes('Note on this device only'), 'offline Note button: device-only');
  ok((await page.locator('[data-nw-note]').allInnerTexts()).some(x => x.includes('Quick offline note')), "offline: today's notes list shows it straight away");
  ok(!(await cloud(page, `practice_log_${DAY}`)) && !(await cloud(page, `notes_${DAY}`)), 'nothing reached the cloud while offline');
  await setOffline(page, false);
  ok(await waitFor(page, () => window.storage.status().waiting === 0), 'back online: the queue empties');
  const log = await cloud(page, `practice_log_${DAY}`);
  const notes = (await cloud(page, `notes_${DAY}`)).notes.map(n => n.text);
  const drafts = (await cloud(page, 'practice_drafts')).drafts;
  ok(log.entries.length === 1 && log.entries[0].myNote === 'Offline note' && notes.includes('Quick offline note') && drafts.forgot.v === 'Wallet on the shelf', 'the rep with its note, the quick note and the draft are all in the cloud');
  await done(ctx, 'offline');
}

(async () => {
  const which = process.argv[2] || 'all';
  const parts = { 1: part1, 2: async () => { await part2(); await part2b(); }, 3: part3, 4: part4, 5: part5, 6: part6, 7: part7, 8: part8, 9: part9, 10: part10 };
  for (const [k, fn] of Object.entries(parts)) if (which === 'all' || which === k) await fn();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
