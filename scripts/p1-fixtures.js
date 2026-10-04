// Fixture docs for the local Practice-tab checks. Invented test data only —
// shaped like the seeded practice:* docs in the spec, not copied from Firestore.
const P = (id, cat, name, status, stage, when, steps, extra = {}) =>
  ({ id, cat, name, source: 'fixture', status, stage, when, steps, history: [{ date: '2026-10-03', change: 'seeded', by: 'fixture' }], ...extra });

const practices = [
  P('waking-ladder', 'wake', 'Waking ladder', 'active', 'pre4', 'Every morning in bed', ['Level 1: eyes open', 'Level 2: roll to your side', 'Level 3: prop up on elbows', 'Level 4: sit up and put your feet on the floor']),
  P('passage-of-time', 'wake', 'Passage of time count', 'learning', 'stage4', 'Eyes open but not moving', ['Count to 60 without looking at a clock', 'Tap Done and see how long it really was']),
  P('countdown', 'wake', 'Countdown 5-4-3-2-1', 'active', 'any', 'When you know the next move and are not making it', ['Count 5-4-3-2-1 out loud', 'Move on 1']),
  P('sf-daily-stall', 'compassion', 'Self-forgiveness for the daily stall', 'homework', 'pre4', 'Lying there blaming yourself for not being up', ['Put a hand on your chest', 'Say: I am stuck, not bad']),
  P('late-not-skipped', 'wake', 'Late, not skipped', 'active', 'pre4', 'When the morning plan already slipped', ['Name the next thing on the plan', 'Do it late instead of skipping it']),
  P('task-drop-reset', 'drop', 'Task-drop reset', 'active', 'post4', 'Up but frozen after a task ends', ['Stand still and feel your feet for 10 seconds', 'Name the next task out loud']),
  P('ten-percent-intercept', 'body', '10% intercept', 'homework', 'any', 'When you feel the first 10% of a brace', ['Notice where you brace', 'Let 10% of it go', 'Breathe out longer than in'], { now: 'First sign of bracing in jaw or shoulders' }),
  P('yield-push-reach', 'body', 'Yield, push, reach', 'learning', 'post4', 'Frozen standing', ['Yield your weight into the floor', 'Push the floor away', 'Reach toward the thing']),
  P('c-see', 'body', 'C-see', 'reference', 'post4', 'Frozen and staring', ['Look at three things at the edge of your vision']),
  P('look-name-return', 'body', 'Look, name, return', 'active', 'any', 'On edge around someone or a sound', ['Look at the source', 'Name it out loud quietly', 'Return to what you were doing']),
  P('one-sense-down', 'body', 'One sense down', 'learning', 'any', 'Too much input', ['Close your eyes or put on earplugs for 60 seconds']),
  P('no-decoding', 'body', 'No decoding', 'active', 'any', 'Trying to read meaning in a sound', ['Say: that is a sound, not a message']),
  P('thought-stop', 'mind', 'Thought stop', 'active', 'any', 'Looping on the same thought', ['Say stop out loud', 'Set a 60 second timer and look around the room', 'Pick one physical task']),
  P('whatsapp-letting-go', 'mind', 'WhatsApp letting go', 'homework', 'any', 'Rereading a chat', ['Close the app', 'Put the phone face down']),
  P('one-word', 'mind', 'One-word container', 'active', 'any', 'Dread or a pile of worries', ['Pick one word for the whole pile', 'Write it down', 'Put the paper away']),
  P('softer-voice', 'compassion', 'Softer voice', 'learning', 'any', 'Harsh inner voice', ['Repeat the harsh sentence in a softer voice']),
  P('sc-break', 'compassion', 'Self-compassion break', 'active', 'any', 'Hurting and blaming yourself', ['This is a moment of suffering', 'Suffering is part of life', 'May I be kind to myself'], { evidence: ['Neff 2003'] }),
  P('compassionate-friend', 'compassion', 'Compassionate friend', 'learning', 'any', 'Harsh on myself', ['Write what a kind friend would say']),
  P('compare-if-then', 'mind', 'Compare if-then', 'new', 'any', 'Comparing myself', ['If I compare, then I name one thing I did today']),
  P('learn-from-struggles', 'compassion', 'Learn from struggles', 'learning', 'any', 'After a hard moment', ['Write one thing it taught you']),
  P('own-model-of-change', 'mind', 'Own model of change', 'open', 'any', 'Comparing paths', ['Write how you change, not how others do']),
  P('regulate-then-relate', 'relate', 'Regulate then relate', 'active', 'any', 'After a conflict', ['Breathe out slowly 5 times before replying']),
  P('repair-when-i-hurt', 'relate', 'Repair when I hurt someone', 'pending', 'any', 'After you hurt someone', ['Name what you did', 'Say what you will do next time']),
  P('repair-when-hurt', 'relate', 'Repair when I was hurt', 'pending', 'any', 'After someone hurt you', ['Write what you needed']),
  P('three-way-discernment', 'relate', 'Three-way discernment', 'in-session', 'any', 'Not sure whose part is whose', ['Mine / theirs / neither']),
  P('bedtime-plan', 'sleep', 'Bedtime plan', 'active', 'any', 'After 9 PM', ['Phone on the charger in the other room', 'Lights out at target']),
  P('sleep-5a', 'sleep', 'Sleep 5A', 'setup', 'any', 'Can not get to bed', ['Stand up', 'Walk to the bedroom']),
  P('forgot-log', 'leave', 'Forgot log', 'active', 'any', 'Leaving the house', ['Write what you forgot and where it is']),
  P('exit-script', 'leave', 'Exit script', 'active', 'any', 'About to leave', ['Keys, phone, wallet, meds']),
  P('time-estimate', 'leave', 'Time estimate', 'restart', 'any', 'Before leaving', ['Guess how long, then time it']),
  P('grief-release', 'compassion', 'Grief release tapping', 'learning', 'post4', 'Grief about lost time', ['Tap the side of your hand 11 times', 'Say the sentence', 'Tap the top of your head 11 times']),
  P('fall-practice', 'body', 'Fall practice', 'new', 'post4', 'Scared of falling', ['Kneel on a mat', 'Roll to your side slowly']),
  P('power-nap', 'sleep', 'Power nap', 'active', 'any', 'Afternoon crash', ['Lie down and set a 15 minute timer']),
  P('soothing-breath', 'body', 'Soothing breath', 'active', 'any', 'Heart racing', ['Breathe in 4, out 6 for 3 minutes']),
  P('elbow-prop', 'wake', 'Elbow prop', 'not-working', 'pre4', 'In bed', ['Stay propped on your elbows for 30 seconds', 'Then sit up']),
  P('cats-sit', 'body', 'Cats sit', 'active', 'any', 'On edge at home', ['Sit where you can see the cats', 'Watch one cat for 2 minutes']),
  P('learn', 'compassion', 'Learn self-compassion', 'learning', 'any', 'Course practice', ['Read one page', 'Do the exercise']),
];

const playbook = {
  version: 7,
  rules: ['Nothing is deleted'],
  categories: [['wake', 'Waking up'], ['body', 'Body'], ['mind', 'Mind'], ['compassion', 'Self-compassion'], ['relate', 'Relating'], ['sleep', 'Sleep'], ['leave', 'Leaving the house'], ['drop', 'The drop']],
  course: { id: 'msc', name: 'Self-compassion course', why: 'Less self-criticism', path: [{ weeks: '1-2', practices: ['sc-break', 'softer-voice'] }, { weeks: '3-4', practices: ['compassionate-friend', 'sf-daily-stall', 'learn'] }], evidence: [], rules: [] },
  practices,
};

const homework = {
  nextSession: '2026-10-09',
  items: [
    { id: 'hw-1', title: 'Self-forgiveness sentence each morning', assigned: '2026-09-25', due: '2026-10-09', status: 'open', source: 'Dr. Shobha' },
    { id: 'hw-2', title: 'Count to 60 with the clock hidden', assigned: '2026-09-25', due: '2026-10-09', status: 'open', hard: true, updates: [{ date: '2026-10-01', text: 'Did it twice', by: 'Nikhil (app)' }] },
  ],
  owedByDrShobha: ['Send the grief worksheet', 'Confirm the nightly call time'],
};

const shobhaQueue = { items: [
  { item: 'Ask about the morning freeze after the alarm', since: '2026-09-28', status: 'open' },
  { item: 'Talk about comparing myself to friends', since: '2026-09-29', status: 'open' },
  { item: 'Old item', since: '2026-09-01', status: 'covered', coveredOn: '2026-09-18' },
] };
const outsideMap = { items: [{ theme: 'Cold mornings', since: '2026-09-20', owners: ['Brighton'], options: ['Heater on a timer'], updates: [] }] };
const progress = { items: [{ practiceId: 'sc-break', reps7: 3, reps30: 9, lastDone: '2026-10-02', trend: 'up', comment: 'Steady.' }], note: 'Deep Pass note.' };
const stuckMap = { version: 2, updated: '2026-10-03', rules: [], situations: [
  { id: 'bed', label: 'In bed, not past level 4', practices: ['sf-daily-stall', 'waking-ladder', 'missing-id', 'elbow-prop'] },
  { id: 'frozen', label: 'Up but frozen', practices: ['task-drop-reset', 'countdown'] },
], history: [] };

const todayDoc = (iso) => ({
  date: iso,
  practices: [
    { id: 'sc-break', name: 'Self-compassion break', why: 'You were harsh on yourself yesterday', when: 'After breakfast', firstStep: 'Put a hand on your chest' },
    { id: 'elbow-prop', name: 'Elbow prop', why: 'should be hidden', when: 'x', firstStep: 'x' },
    { id: 'countdown', name: 'Countdown', why: 'For the drop after class', when: 'After class', firstStep: 'Count 5 out loud' },
  ],
  homework: ['hw-1'],
  sleep: { tomorrowFirstFixedPoint: '09:00 class', wakeTarget: '07:30', lightsOutTarget: '23:30', lastNightLevel: 2 },
  progressNotes: ['Two mornings at level 4 this week.'],
});

const base = () => ({
  'practice:playbook': JSON.stringify(playbook),
  'practice:homework': JSON.stringify(homework),
  'practice:shobha-queue': JSON.stringify(shobhaQueue),
  'practice:outside-map': JSON.stringify(outsideMap),
  'practice:progress': JSON.stringify(progress),
  'practice:stuck-map': JSON.stringify(stuckMap),
});

module.exports = { playbook, homework, shobhaQueue, outsideMap, progress, stuckMap, todayDoc, base };
