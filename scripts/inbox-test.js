// Checks for tools/inbox/*.gs (the "NW Inbox" Apps Script project): voice memos to text with Gemini on Vertex AI,
// Fireflies transcripts to Drive. The .gs files run in a Node sandbox with DriveApp, DocumentApp, SpreadsheetApp,
// UrlFetchApp, PropertiesService, LockService, ScriptApp, Session and Utilities mocked. No real network, no real Google.
// Run: NODE_PATH=$(npm root -g) node scripts/inbox-test.js [all]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const eq = (a, b, label) => { const same = JSON.stringify(a) === JSON.stringify(b); ok(same, label); if (!same) console.log('    got     ', JSON.stringify(a), '\n    expected', JSON.stringify(b)); };

const DIR = path.join(__dirname, '..', 'tools', 'inbox');
const SRC = fs.readdirSync(DIR).filter(f => f.endsWith('.gs')).sort().map(f => ({ f, s: fs.readFileSync(path.join(DIR, f), 'utf8') }));
const DOC = 'application/vnd.google-apps.document', SHEET = 'application/vnd.google-apps.spreadsheet';
const DAY = 86400000;

// ── time zone helpers (same patterns Utilities.formatDate gets in the scripts) ──
function parts(date, tz) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' })
    .formatToParts(date).forEach(p => { o[p.type] = p.value; });
  return o;
}
function fmt(date, tz, pattern) {
  const p = parts(date, tz), n2 = (x) => ('0' + x).slice(-2);
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const mi = MON.indexOf(p.month), h = Number(p.hour);
  const map = { yyyy: p.year, MMMM: p.month, MMM: p.month.slice(0, 3), MM: n2(mi + 1), EEEE: p.weekday, EEE: p.weekday.slice(0, 3), dd: n2(p.day), d: String(Number(p.day)), HH: n2(h), h: String(h % 12 || 12), mm: p.minute, ss: p.second, a: h < 12 ? 'AM' : 'PM', z: p.timeZoneName };
  return pattern.replace(/yyyy|MMMM|MMM|MM|EEEE|EEE|dd|d|HH|h|mm|ss|a|z/g, t => map[t]);
}
function parseLocal(str, tz) { // 'yyyy-MM-dd HH:mm:ss' or 'yyyy-MM-dd' in tz
  const m = /(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?/.exec(str);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const off = (t) => { const p = parts(new Date(t), tz); return Date.UTC(+p.year, new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(new Date(t)) - 1, +p.day, Number(p.hour), +p.minute, +p.second) - Math.floor(t / 1000) * 1000; };
  let t = guess - off(guess); t = guess - off(t);
  return new Date(t);
}

// ── the sandbox ──
function makeEnv(opts = {}) {
  const log = { fetches: [], sleeps: [], triggers: [], logs: [] };
  const props = Object.assign({}, opts.props || {});
  let n = 1;
  const drive = { files: {}, folders: { root: { id: 'root', name: 'My Drive', parent: null } } };
  const tz = () => props.TIME_ZONE || 'America/Anchorage';

  const mkIter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  function folderObj(rec) {
    return {
      getId: () => rec.id, getName: () => rec.name, isTrashed: () => false,
      getFiles: () => mkIter(Object.values(drive.files).filter(f => f.parent === rec.id).map(fileObj)),
      getFoldersByName: (nm) => mkIter(Object.values(drive.folders).filter(f => f.parent === rec.id && f.name === nm).map(folderObj)),
      createFolder: (nm) => { const r = { id: 'fo' + n++, name: nm, parent: rec.id }; drive.folders[r.id] = r; return folderObj(r); },
    };
  }
  function fileObj(rec) {
    return {
      getId: () => rec.id, getName: () => rec.name, getMimeType: () => rec.mime, getSize: () => rec.size || 0,
      getLastUpdated: () => rec.updated || new Date('2026-11-03T20:00:00Z'), getDescription: () => rec.desc || '',
      setDescription: (d) => { rec.desc = d; }, moveTo: (fo) => { rec.parent = fo.getId(); },
      getOwner: () => ({ getEmail: () => rec.owner || 'me@x.com' }),
      getBlob: () => ({ getBytes: () => Array.from(Buffer.alloc(rec.size || 0)) }),
      _rec: rec,
    };
  }
  const addFile = (rec) => { rec.id = rec.id || 'fi' + n++; rec.parent = rec.parent || 'root'; drive.files[rec.id] = rec; return rec; };
  const DriveApp = {
    getFolderById: (id) => folderObj(drive.folders[id]),
    getFoldersByName: (nm) => mkIter(Object.values(drive.folders).filter(f => f.name === nm && f.id !== 'root').map(folderObj)),
    createFolder: (nm) => { const r = { id: 'fo' + n++, name: nm, parent: 'root' }; drive.folders[r.id] = r; return folderObj(r); },
    getFilesByName: (nm) => mkIter(Object.values(drive.files).filter(f => f.name === nm).map(fileObj)),
    getFileById: (id) => fileObj(drive.files[id]),
  };

  // Docs
  const docs = {};
  function paraObj(r) {
    const p = {
      _r: r,
      getText: () => r.text, setText: (t) => { r.text = t; return p; },
      getHeading: () => r.heading, setHeading: (h) => { r.heading = h; return p; },
      getAttributes: () => Object.assign({}, r.attrs), setAttributes: (a) => { r.attrs = Object.assign({}, a); return p; },
      removeFromParent: () => { const d = r.doc; d.children = d.children.filter(c => c !== r); },
    };
    return p;
  }
  function docObj(d) {
    const wrap = (r) => (r._w = r._w || paraObj(r));
    const mk = (text, hr) => ({ text, heading: 'NORMAL', attrs: {}, hr: !!hr, doc: d });
    const body = {
      getParagraphs: () => d.children.map(wrap),
      getNumChildren: () => d.children.length,
      getChildIndex: (p) => d.children.indexOf(p._r),
      insertParagraph: (i, t) => { const r = mk(t); d.children.splice(i, 0, r); return wrap(r); },
      appendParagraph: (t) => { const r = mk(t); d.children.push(r); return wrap(r); },
      insertHorizontalRule: (i) => { const r = mk('', true); d.children.splice(i, 0, r); return wrap(r); },
      getText: () => d.children.map(c => c.text).join('\n'),
      setText: (t) => { d.children = t.split('\n').map(x => mk(x)); },
    };
    return { getId: () => d.id, getBody: () => body, saveAndClose: () => {}, _d: d };
  }
  const newDoc = (name, lines, extra = {}) => {
    const d = { id: 'doc' + n++, name, children: [] };
    d.children = (lines && lines.length ? lines : ['']).map(l => (typeof l === 'string' ? { text: l, heading: 'NORMAL', attrs: {}, doc: d } : Object.assign({ attrs: {}, doc: d }, l)));
    docs[d.id] = d;
    addFile(Object.assign({ id: d.id, name, mime: DOC }, extra));
    return d;
  };
  const DocumentApp = {
    ParagraphHeading: { NORMAL: 'NORMAL', HEADING1: 'HEADING1' },
    openById: (id) => { if (!docs[id]) throw new Error('no doc ' + id); return docObj(docs[id]); },
    create: (name) => docObj(newDoc(name, [''])),
  };

  // Sheets
  const sheets = {};
  const SpreadsheetApp = {
    create: (name) => { const id = 'sh' + n++; sheets[id] = { rows: [] }; addFile({ id, name, mime: SHEET }); return { getId: () => id, getSheets: () => [{ appendRow: (r) => sheets[id].rows.push(r) }] }; },
    openById: (id) => { if (!sheets[id]) throw new Error('no sheet'); return { getId: () => id, getSheets: () => [{ appendRow: (r) => sheets[id].rows.push(r) }] }; },
  };

  // Web calls: tests set env.route(call) -> { code, body, headers, bytes }
  const env = { route: null, vertexQueue: [], log };
  const UrlFetchApp = {
    fetch: (url, o = {}) => {
      const call = { url, method: (o.method || 'get').toLowerCase(), headers: o.headers || {}, payload: o.payload, body: null };
      if (typeof o.payload === 'string') { try { call.body = JSON.parse(o.payload); } catch (e) { /* not json */ } }
      log.fetches.push(call);
      const r = (env.route && env.route(call)) || { code: 404, body: 'no route' };
      return {
        getResponseCode: () => r.code, getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
        getHeaders: () => r.headers || {}, getContent: () => Array.from(r.bytes || []),
      };
    },
  };

  const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, Error, RegExp, Promise,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => env.lockOk !== false, releaseLock: () => {} }) },
    ScriptApp: {
      getOAuthToken: () => 'gas-token', getProjectTriggers: () => log.triggers.slice(), deleteTrigger: (t) => { log.triggers = log.triggers.filter(x => x !== t); },
      newTrigger: (fn) => ({ timeBased: () => { const spec = { fn }; const b = { everyMinutes: (m) => { spec.minutes = m; return b; }, everyHours: (h) => { spec.hours = h; return b; }, create: () => { const t = Object.assign({ getHandlerFunction: () => fn }, spec); log.triggers.push(t); return t; } }; return b; } }),
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@x.com' }) },
    Logger: { log: (s) => log.logs.push(s) },
    Utilities: {
      formatDate: (d, z, p) => fmt(d, z, p), parseDate: (s, z) => parseLocal(s, z), sleep: (ms) => log.sleeps.push(ms),
      base64Encode: (b) => Buffer.from(b).toString('base64'),
    },
    DriveApp, DocumentApp, SpreadsheetApp, UrlFetchApp,
  };
  vm.createContext(ctx);
  SRC.forEach(({ f, s }) => vm.runInContext(s, ctx, { filename: f }));
  Object.assign(env, { ctx, props, drive, docs, sheets, addFile, newDoc, DriveApp, fmt: (d, p) => fmt(d, tz(), p) });
  env.run = (fn) => vm.runInContext(fn + '()', ctx);
  env.logRows = () => Object.values(sheets).flatMap(s => s.rows);
  env.paras = (d) => d.children.map(c => c.text);
  return env;
}

// A Voice Inbox with audio files. Returns folder ids.
function voiceSetup(env, files) {
  const inbox = env.DriveApp.createFolder("Nikhil's World Voice Inbox");
  const done = inbox.createFolder('Done'), problem = inbox.createFolder('Problem');
  const recs = files.map(f => env.addFile({ name: f.name, mime: f.mime || 'audio/x-m4a', size: f.size || 1000, parent: inbox.getId(), updated: new Date('2026-11-04T01:00:00Z') }));
  return { inbox: inbox.getId(), done: done.getId(), problem: problem.getId(), recs };
}
const where = (env, rec) => env.drive.folders[rec.parent].name;
const U = (minutes) => minutes * 60 * 32; // audio tokens for N minutes
function vertexOk(env, texts, minutes = 1) {
  const q = texts.slice();
  env.route = (c) => {
    if (/aiplatform\.googleapis\.com/.test(c.url)) {
      const t = q.length ? q.shift() : 'Plain transcript.';
      if (t && t.code) return t;
      return { code: 200, body: { candidates: [{ content: { parts: [{ text: t }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: U(minutes) + 20, candidatesTokenCount: 300, promptTokensDetails: [{ modality: 'AUDIO', tokenCount: U(minutes) }, { modality: 'TEXT', tokenCount: 20 }] } } };
    }
    return null;
  };
}
const SAMPLE_A = [
  'All caught up with pasting transcriptions!',
  { text: 'Tue, Nov 3, 2026', heading: 'HEADING1', attrs: { fontSize: 20 } },
  'rock climbing interactions (where is where there\'s this other guy standing by in front of whom I accidentally or like purposely or whatever said, oh my life is not worth much anyway, … because this can be something that really helps physical activity we know that):',
  'So, you\'re back up the pen. First thing you need to do is secure yourself. Okay. So take your PS.. If you try, you\'re right. And leave the locker on it. …',
];
const texts = (d) => d.children.map(c => c.text);
const emptyCount = (d) => d.children.filter(c => !c.text && !c.hr).length;
const isSubsequence = (small, big) => { let i = 0; for (const x of big) if (i < small.length && x === small[i]) i++; return i === small.length; };
const NAME_NOV3 = '20261103 091400-AB12.m4a';   // Nov 3, 2026 9:14 AM in Anchorage
const NAME_NOV3_PM = '20261103 143000-CD34.m4a'; // 2:30 PM
const NAME_NOV4 = '20261104 080500-EF56.m4a';

// ── Part 1 ──
function part1() {
  console.log('\n[1. Voice Inbox: headings, text above the first heading, order, empty paragraphs]');
  // a. same date as the first Heading 1: added under it, status line kept
  {
    const env = makeEnv(); const s = voiceSetup(env, [{ name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', SAMPLE_A);
    const before = texts(main), empties = emptyCount(main);
    vertexOk(env, ['First paragraph.\n\nSecond paragraph.']);
    env.run('runVoiceInbox');
    const after = texts(main);
    eq(after.slice(0, 5), [SAMPLE_A[0], 'Tue, Nov 3, 2026', '(voice memo, 9:14 AM, auto-transcribed from ' + NAME_NOV3 + ')', 'First paragraph.', 'Second paragraph.'], 'same date: entry goes directly under the first Heading 1, status line stays on top');
    eq(after.slice(5), before.slice(2), 'existing memo text below is untouched and in order');
    ok(after.length === before.length + 3, 'only the 3 entry lines were added');
    ok(emptyCount(main) === empties, 'no empty paragraphs added');
    ok(main.children[2].heading === 'NORMAL' && main.children[1].heading === 'HEADING1', 'entry lines are Normal; the heading is still Heading 1');
    ok(where(env, s.recs[0]) === 'Done' && /Transcribed .*gemini-2\.5-flash.*us-central1.*nikhils-world/.test(s.recs[0].desc), 'audio moved to Done; description says when and where it was transcribed');
    const rolling = env.docs[env.props.ROLLING_DOC_ID];
    eq(texts(rolling), ['Tue, Nov 3, 2026', after[2], 'First paragraph.', 'Second paragraph.'], 'the same entry went into the rolling "last 7 days" doc (no empty first paragraph)');
    ok(rolling.name === "Nikhil's World — Voice, last 7 days", 'rolling doc has the exact title');
    const req = env.log.fetches.find(c => /aiplatform/.test(c.url));
    ok(/us-central1-aiplatform\.googleapis\.com\/v1\/projects\/nikhils-world\/locations\/us-central1\/publishers\/google\/models\/gemini-2\.5-flash:generateContent$/.test(req.url), 'Vertex AI generateContent URL uses the project, region and model');
    ok(req.headers.Authorization === 'Bearer gas-token', 'uses ScriptApp.getOAuthToken()');
    ok(req.body.contents[0].parts[0].inlineData && req.body.contents[0].parts[0].inlineData.mimeType === 'audio/mp4', 'small file goes inline');
    ok(/verbatim/i.test(req.body.contents[0].parts[1].text) && /Never guess/i.test(req.body.contents[0].parts[1].text) && /Speaker 1/.test(req.body.contents[0].parts[1].text), 'prompt asks for verbatim text, speaker labels only for several speakers, no guessed names');
    ok(!env.log.fetches.some(c => /anthropic|claude\.ai/i.test(c.url)), 'no Anthropic or Claude call');
    const row = env.logRows().find(r => r[5] === 'done');
    ok(row && row[1] === NAME_NOV3 && row[2] === 1 && row[3] > 0 && row[4] === 300, 'log sheet row has file, minutes, input and output tokens, status');
  }
  // b. new date: a Heading 1 in the same style, directly above the first one, below the status line
  {
    const env = makeEnv(); voiceSetup(env, [{ name: NAME_NOV4 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', SAMPLE_A);
    vertexOk(env, ['Hello.']);
    env.run('runVoiceInbox');
    const t = texts(main);
    eq(t.slice(0, 5), [SAMPLE_A[0], 'Wed, Nov 4, 2026', '(voice memo, 8:05 AM, auto-transcribed from ' + NAME_NOV4 + ')', 'Hello.', 'Tue, Nov 3, 2026'], 'new date: new Heading 1 directly above the first Heading 1');
    ok(main.children[1].heading === 'HEADING1' && main.children[1].attrs.fontSize === 20, 'new heading copies the first heading\'s style');
    ok(isSubsequence(texts({ children: SAMPLE_A.map(x => ({ text: x.text || x })) }), t), 'every original line is still there, in order');
  }
  // c. nothing above the first heading / several lines above / no Heading 1 / empty doc
  const variants = [
    ['nothing above the first heading', [SAMPLE_A[1], SAMPLE_A[2]], 0, 'Tue, Nov 3, 2026'],
    ['several lines above the first heading', ['one', 'two', '', 'three', SAMPLE_A[1], SAMPLE_A[2]], 4, 'Tue, Nov 3, 2026'],
  ];
  for (const [label, doc, hIdx] of variants) {
    const env = makeEnv(); voiceSetup(env, [{ name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', doc);
    const before = texts(main), empties = emptyCount(main);
    vertexOk(env, ['Hi.']);
    env.run('runVoiceInbox');
    const t = texts(main);
    eq(t.slice(0, hIdx + 1), before.slice(0, hIdx + 1), label + ': everything above and including the heading is untouched');
    eq(t.slice(hIdx + 1, hIdx + 3), ['(voice memo, 9:14 AM, auto-transcribed from ' + NAME_NOV3 + ')', 'Hi.'], label + ': entry directly under the heading');
    ok(emptyCount(main) === empties, label + ': no empty paragraphs added');
  }
  {
    const env = makeEnv(); voiceSetup(env, [{ name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', ['Just my own words', 'More words']);
    vertexOk(env, ['Hi.']);
    env.run('runVoiceInbox');
    eq(texts(main), ['Just my own words', 'More words', 'Tue, Nov 3, 2026', '(voice memo, 9:14 AM, auto-transcribed from ' + NAME_NOV3 + ')', 'Hi.'], 'no Heading 1 at all: heading and entry are appended at the end');
    ok(main.children[2].heading === 'HEADING1', '...and the appended date is a Heading 1');
  }
  {
    const env = makeEnv(); voiceSetup(env, [{ name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', ['']);
    vertexOk(env, ['Hi.']);
    env.run('runVoiceInbox');
    eq(texts(main), ['Tue, Nov 3, 2026', '(voice memo, 9:14 AM, auto-transcribed from ' + NAME_NOV3 + ')', 'Hi.'], 'a completely empty doc is filled without leaving an empty first paragraph');
  }
  // d. memo order: oldest processed first, newest at the top of the day
  {
    const env = makeEnv(); voiceSetup(env, [{ name: NAME_NOV3_PM }, { name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', SAMPLE_A);
    vertexOk(env, ['Morning words.', 'Afternoon words.']);
    env.run('runVoiceInbox');
    eq(texts(main).slice(1, 6), ['Tue, Nov 3, 2026', '(voice memo, 2:30 PM, auto-transcribed from ' + NAME_NOV3_PM + ')', 'Afternoon words.', '(voice memo, 9:14 AM, auto-transcribed from ' + NAME_NOV3 + ')', 'Morning words.'], 'two memos on one day: the newest is at the top of the day');
  }
  // e. wrong owner / missing doc: nothing is touched, file stays
  {
    const env = makeEnv(); const s = voiceSetup(env, [{ name: NAME_NOV3 }]);
    env.newDoc('Transcripts of Voice Recordings', SAMPLE_A, { owner: 'someone@else.com' });
    vertexOk(env, ['x']);
    env.run('runVoiceInbox');
    ok(where(env, s.recs[0]) === "Nikhil's World Voice Inbox" && !env.log.fetches.length, 'a doc owned by someone else is not used; the audio stays in the inbox and nothing is sent');
  }
  // f. TRANSCRIPTS_DOC_ID override, other time zone
  {
    const env = makeEnv({ props: { TIME_ZONE: 'Asia/Kolkata' } }); voiceSetup(env, [{ name: 'Memo.m4a' }]); // modified 2026-11-04 01:00 UTC
    const other = env.newDoc('Some other title', SAMPLE_A);
    env.props.TRANSCRIPTS_DOC_ID = other.id;
    vertexOk(env, ['Hi.']);
    env.run('runVoiceInbox');
    eq(texts(other).slice(1, 3), ['Wed, Nov 4, 2026', '(voice memo, 6:30 AM, auto-transcribed from Memo.m4a)'], 'TRANSCRIPTS_DOC_ID and TIME_ZONE are Script Properties; a name without a date uses the file time in the script time zone');
  }

  console.log('\n[2. Voice Inbox: big file via the bucket, retries, daily cap, rolling doc]');
  {
    const env = makeEnv(); const s = voiceSetup(env, [{ name: NAME_NOV3, size: 25 * 1024 * 1024 }]);
    env.newDoc('Transcripts of Voice Recordings', SAMPLE_A);
    const orig = vertexOk; orig(env, ['Long memo text.']);
    const vertexRoute = env.route; let puts = 0;
    env.route = (c) => {
      if (c.method === 'post' && /storage\.googleapis\.com\/upload\/storage\/v1\/b\/nikhils-world-nw-inbox-temp\/o\?uploadType=resumable/.test(c.url)) return { code: 200, body: '', headers: { Location: 'https://storage.googleapis.com/resumable/abc' } };
      if (/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/.*alt=media/.test(c.url)) { const m = /bytes=(\d+)-(\d+)/.exec(c.headers.Range); return { code: 206, bytes: Buffer.alloc(+m[2] - +m[1] + 1) }; }
      if (c.method === 'put' && c.url === 'https://storage.googleapis.com/resumable/abc') { puts++; return { code: /-26214399\/26214400$/.test(c.headers['Content-Range']) ? 200 : 308, body: '' }; }
      if (c.method === 'delete' && /storage\.googleapis\.com\/storage\/v1\/b\/.*\/o\//.test(c.url)) return { code: 204, body: '' };
      return vertexRoute(c);
    };
    env.run('runVoiceInbox');
    const v = env.log.fetches.find(c => /aiplatform/.test(c.url)), p0 = v.body.contents[0].parts[0];
    ok(p0.fileData && /^gs:\/\/nikhils-world-nw-inbox-temp\/voice-/.test(p0.fileData.fileUri) && !p0.inlineData, 'file over the inline limit goes to Vertex as a gs:// object, not inline');
    ok(puts === 4 && env.log.fetches.filter(c => /alt=media/.test(c.url)).length === 4, 'copied to the bucket in four 8 MiB pieces (no single call near the 50 MB limit)');
    ok(env.log.fetches.some(c => c.method === 'delete' && /\/o\/voice-/.test(c.url)), 'the bucket copy is deleted afterwards');
    ok(where(env, s.recs[0]) === 'Done', 'big file ends in Done');
    ok(Math.max(...env.log.fetches.map(c => (typeof c.payload === 'string' ? c.payload.length : 0))) < 50 * 1024 * 1024, 'no request payload near the 50 MB limit');
  }
  {
    const env = makeEnv(); const s = voiceSetup(env, [{ name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', SAMPLE_A); const before = texts(main);
    env.route = (c) => (/aiplatform/.test(c.url) ? { code: 500, body: 'Backend Error' } : null);
    env.run('runVoiceInbox');
    ok(where(env, s.recs[0]) === "Nikhil's World Voice Inbox", 'failure 1: file stays in the inbox for a retry');
    env.run('runVoiceInbox');
    ok(where(env, s.recs[0]) === "Nikhil's World Voice Inbox", 'failure 2: still in the inbox');
    env.run('runVoiceInbox');
    ok(where(env, s.recs[0]) === 'Problem' && /Backend Error/.test(s.recs[0].desc) && /3 times/.test(s.recs[0].desc), 'after the 2 retries it moves to Problem with the error in its description');
    ok(env.drive.files[s.recs[0].id] && true, 'the audio file is never deleted');
    eq(texts(main), before, 'nothing was written to the doc');
    ok(env.logRows().filter(r => /failed|problem/.test(r[5])).length === 3, 'each try is in the log sheet');
    env.route = (c) => (/aiplatform/.test(c.url) ? { code: 200, body: { candidates: [{ content: { parts: [{ text: 'cut' }] }, finishReason: 'MAX_TOKENS' }] } } : null);
  }
  {
    // a cut-off answer is never written
    const env = makeEnv(); const s = voiceSetup(env, [{ name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', SAMPLE_A); const before = texts(main);
    env.route = (c) => ({ code: 200, body: { candidates: [{ content: { parts: [{ text: 'cut' }] }, finishReason: 'MAX_TOKENS' }] } });
    env.run('runVoiceInbox');
    eq(texts(main), before, 'a cut-off transcript (MAX_TOKENS) is not written');
    ok(/cut off/.test(JSON.stringify(env.logRows())), '...and the log says why');
  }
  {
    // a retry after a good write does not write twice
    const env = makeEnv(); const s = voiceSetup(env, [{ name: NAME_NOV3 }]);
    const main = env.newDoc('Transcripts of Voice Recordings', SAMPLE_A);
    vertexOk(env, ['Once.']);
    const rec = s.recs[0]; let broke = true; const mv = rec;
    const origSet = env.DriveApp.getFileById;
    env.run('runVoiceInbox');
    const once = texts(main).filter(x => x === 'Once.').length;
    // simulate: put the file back and run again => it is transcribed again only if not recorded as written
    rec.parent = s.inbox; env.run('runVoiceInbox');
    ok(once === 1 && texts(main).filter(x => x === 'Once.').length === 1, 'a file whose text was already written is only moved, not written twice');
  }
  {
    const env = makeEnv({ props: { DAILY_CAP_MINUTES: '10' } });
    const s = voiceSetup(env, [{ name: NAME_NOV3, size: 5 * 240000 }, { name: NAME_NOV3_PM, size: 8 * 240000 }]); // 5 and 8 minutes at the 32 kbps guess
    env.newDoc('Transcripts of Voice Recordings', SAMPLE_A);
    vertexOk(env, ['one', 'two'], 5);
    env.run('runVoiceInbox');
    ok(where(env, s.recs[0]) === 'Done' && where(env, s.recs[1]) === "Nikhil's World Voice Inbox", 'daily cap: the second memo waits (5 + 8 > 10 minutes)');
    ok(env.log.fetches.filter(c => /aiplatform/.test(c.url)).length === 1, '...and Vertex is not called for it');
    ok(env.logRows().some(r => /waiting: daily cap/.test(r[5])), '...and the log says so');
    env.run('runVoiceInbox');
    ok(where(env, s.recs[1]) === "Nikhil's World Voice Inbox", 'still waiting later the same day');
    const u = JSON.parse(env.props.VOICE_USED); u.day = '2000-01-01'; env.props.VOICE_USED = JSON.stringify(u);
    env.run('runVoiceInbox');
    ok(where(env, s.recs[1]) === 'Done', 'next day the count starts again and it goes through');
  }
  {
    const env = makeEnv({ props: { DAILY_CAP_MINUTES: '10' } });
    const s = voiceSetup(env, [{ name: NAME_NOV3, size: 20 * 240000 }]);
    env.newDoc('Transcripts of Voice Recordings', SAMPLE_A); vertexOk(env, ['x']);
    env.run('runVoiceInbox');
    ok(where(env, s.recs[0]) === 'Problem' && /daily cap/.test(s.recs[0].desc) && !env.log.fetches.length, 'a memo longer than the whole daily cap goes to Problem with the reason (it could never run)');
  }
  {
    const env = makeEnv(); const s = voiceSetup(env, [{ name: NAME_NOV3 }, { name: 'notes.pdf', mime: 'application/pdf' }, { name: 'song.mp3', mime: 'audio/mpeg' }]);
    env.newDoc('Transcripts of Voice Recordings', SAMPLE_A); vertexOk(env, ['a', 'b']);
    env.run('runVoiceInbox');
    ok(where(env, s.recs[1]) === "Nikhil's World Voice Inbox" && where(env, s.recs[0]) === 'Done' && where(env, s.recs[2]) === 'Done', 'm4a and mp3 are picked up; a PDF is left alone');
    env.lockOk = false; s.recs[0].parent = s.inbox; const before = env.log.fetches.length;
    env.run('runVoiceInbox');
    ok(env.log.fetches.length === before, 'if another run holds the lock, this run does nothing');
  }
  {
    const env = makeEnv(); voiceSetup(env, [{ name: NAME_NOV3 }]);
    env.newDoc('Transcripts of Voice Recordings', SAMPLE_A); vertexOk(env, ['Fresh.']);
    const d = (days) => { const t = new Date(Date.now() - days * DAY); return env.fmt(t, 'EEE, MMM d, yyyy'); };
    const H = (x) => ({ text: x, heading: 'HEADING1' });
    const rolling = env.newDoc("Nikhil's World — Voice, last 7 days", [H(d(2)), 'recent entry', H(d(9)), 'old entry', 'old entry 2', H(d(30)), 'ancient']);
    env.props.ROLLING_DOC_ID = rolling.id;
    const stamp = env.fmt(new Date(Date.now() - 1 * DAY), 'yyyyMMdd HHmmss').replace(/^(\d{4})(\d{2})(\d{2})/, '$1$2$3');
    const rec = Object.values(env.drive.files).find(f => f.name === NAME_NOV3); rec.name = env.fmt(new Date(Date.now() - 1 * DAY), 'yyyy-MM-dd').replace(/-/g, '') + ' 091400-ZZ.m4a';
    env.run('runVoiceInbox');
    const t = texts(rolling);
    ok(!t.includes('old entry') && !t.includes('old entry 2') && !t.includes('ancient') && !t.includes(d(9)) && !t.includes(d(30)), 'rolling doc: days older than 7 days are dropped');
    ok(t.includes('recent entry') && t.includes('Fresh.') && t[0] === d(1), 'rolling doc: recent days stay and the new entry is on top under its date');
    ok(texts(env.docs[Object.keys(env.docs).find(k => env.docs[k].name === 'Transcripts of Voice Recordings')]).includes('Tue, Nov 3, 2026'), 'trimming never touches his own doc');
  }

  console.log('\n[3. setupInbox]');
  {
    const env = makeEnv();
    env.route = (c) => {
      if (c.method === 'get' && /storage\/v1\/b\/nikhils-world-nw-inbox-temp$/.test(c.url)) return { code: env.bucketMade ? 200 : 404, body: {} };
      if (c.method === 'post' && /storage\/v1\/b\?project=nikhils-world/.test(c.url)) { env.bucketMade = true; env.bucketBody = c.body; return { code: 200, body: {} }; }
      if (c.method === 'patch') { env.patched = c.body; return { code: 200, body: {} }; }
      return null;
    };
    const rep = env.run('setupInbox');
    const names = Object.values(env.drive.folders).map(f => f.name);
    ok(['Nikhil\'s World Voice Inbox', 'Done', 'Problem', 'Fireflies Meetings'].every(n => names.includes(n)), 'creates the Voice Inbox with Done and Problem, and Fireflies Meetings');
    ok(env.bucketBody && env.bucketBody.lifecycle.rule[0].action.type === 'Delete' && env.bucketBody.lifecycle.rule[0].condition.age === 1, 'creates the bucket with a 1-day delete rule');
    ok(Object.values(env.drive.files).some(f => f.name === 'NW Inbox log'), 'creates the log sheet');
    ok(env.log.triggers.length === 2 && env.log.triggers.some(t => t.fn === 'runVoiceInbox' && t.minutes === 15) && env.log.triggers.some(t => t.fn === 'runFireflies' && t.hours === 2), 'two triggers: voice every 15 minutes, Fireflies every 2 hours');
    ok(/MISSING Script Property: FIREFLIES_API_KEY/.test(env.log.logs.join('\n')), 'names the missing Script Property');
    ok(env.props.FIREFLIES_START_DATE === env.fmt(new Date(), 'yyyy-MM-dd'), 'FIREFLIES_START_DATE defaults to the day setup runs');
    const folders = Object.keys(env.drive.folders).length, files = Object.keys(env.drive.files).length;
    env.run('setupInbox');
    ok(env.log.triggers.length === 2 && Object.keys(env.drive.folders).length === folders && Object.keys(env.drive.files).length === files, 'safe to run twice: no duplicate triggers, folders or files');
    ok(env.patched && env.patched.lifecycle, 'second run re-applies the bucket delete rule');
    ok(!/AIza|sk-|private_key|Bearer [A-Za-z0-9]{20,}/.test(SRC.map(x => x.s).join('\n')), 'no keys or tokens in the .gs files');
    ok(!/anthropic|api\.claude/i.test(SRC.map(x => x.s).join('\n').replace(/Anthropic \/ Claude API is called anywhere here|No Anthropic or Claude/g, '')), 'no Anthropic or Claude API calls in the .gs files');
  }
}

// ── Part 2 ──
const ID1 = '01M645GYVS32HBSTPRKCN34EWA', ID2 = '01AAAAAAAAAAAAAAAAAAAAAAA2', ID3 = '01AAAAAAAAAAAAAAAAAAAAAAA3', ID4 = '01AAAAAAAAAAAAAAAAAAAAAAA4', ID5 = '01AAAAAAAAAAAAAAAAAAAAAAA5';
function sentencesB() {
  return [
    { speaker_name: 'Nikhil Nandagopal', text: 'Give me a sec.', start_time: 1.2, end_time: 1.9 },
    { speaker_name: 'Nikhil Nandagopal', text: "I'm just gonna come in.", start_time: 1.9, end_time: 2.4 },
    { speaker_name: 'Nikhil Nandagopal', text: "I was cleaning my room, which, as you know, is the task I've been avoiding.", start_time: 2.4, end_time: 9.7 },
    { speaker_name: 'Nikhil Nandagopal', text: 'Okay.', start_time: 14.1, end_time: 14.8 },
    { speaker_name: 'Shobha Managoli', text: 'Okay.', start_time: 20.2, end_time: 20.9 },
    { speaker_name: 'Shobha Managoli', text: 'So today we are starting on the cognitive retraining part of it.', start_time: 20.9, end_time: 24.3 },
  ];
}
const trB = (o = {}) => Object.assign({ id: ID1, title: 'Zoom meeting', dateString: '2026-11-02T03:30:00.000Z', date: Date.parse('2026-11-02T03:30:00.000Z'), privacy: 'link', meeting_link: 'https://meet.google.com/sqs-iyvc-zvp', speakers: [{ name: 'Nikhil Nandagopal' }, { name: 'Shobha Managoli' }], sentences: sentencesB() }, o);
function ffRoute(env, transcripts) { // transcripts: array of full transcripts
  env.ffCalls = [];
  env.route = (c) => {
    if (c.url !== 'https://api.fireflies.ai/graphql') return null;
    env.ffCalls.push(c.body);
    if (env.ffReply) { const r = env.ffReply(c); if (r) return r; }
    if (/transcripts\(/.test(c.body.query)) return { code: 200, body: { data: { transcripts: transcripts.map(t => ({ id: t.id, title: t.title, dateString: t.dateString, date: t.date, privacy: t.privacy, meeting_link: t.meeting_link })) } } };
    const t = transcripts.find(x => x.id === c.body.variables.id);
    return { code: 200, body: { data: { transcript: t || null } } };
  };
}
const ffEnv = (props = {}) => { const e = makeEnv({ props: Object.assign({ FIREFLIES_API_KEY: 'test-key', FIREFLIES_START_DATE: '2026-10-01' }, props) }); e.folder = e.DriveApp.createFolder('Fireflies Meetings'); return e; };
const ffDocs = (env) => Object.values(env.docs).filter(d => env.drive.files[d.id].parent === env.folder.getId());

function part3() {
  console.log('\n[4. Fireflies: what counts as already saved]');
  {
    const env = ffEnv();
    env.newDoc('ChatGPT-style odd name 1', ['Fireflies Transcript — Friday, October 30, 2026 (x)', 'Meeting ID: ' + ID3 + ' Pulled: 2026-10-31', 'more'], { parent: env.folder.getId() });
    env.addFile({ name: 'saved by hand.txt', mime: 'text/plain', parent: env.folder.getId(), desc: 'see meeting ' + ID2 });
    env.props.FF_SAVED_0 = ID1;
    const farDoc = env.newDoc('long doc', ['x'.repeat(400) + ' Meeting ID: ' + ID4], { parent: env.folder.getId() }); // past 300 characters: does NOT count
    const all = [trB({ id: ID1 }), trB({ id: ID2 }), trB({ id: ID3 }), trB({ id: ID4 }), trB({ id: ID5 })];
    ffRoute(env, all);
    env.run('runFireflies');
    const detail = env.ffCalls.filter(b => /transcript\(id/.test(b.query)).map(b => b.variables.id);
    eq(detail.sort(), [ID4, ID5].sort(), 'saved by id list, by description and by Meeting ID in the first 300 characters are skipped; the id past 300 characters is not');
    ok(env.ffCalls.filter(b => /transcripts\(/.test(b.query)).length === 1 && env.ffCalls[0].variables.from === '2026-10-01T08:00:00.000Z', 'first run looks back only to FIREFLIES_START_DATE (midnight in the script time zone)');
    ok(env.props.FF_LAST_CHECK, 'the last check time is remembered');
    const before = env.ffCalls.length; env.run('runFireflies');
    const detail2 = env.ffCalls.slice(before).filter(b => /transcript\(id/.test(b.query));
    ok(detail2.length === 0, 'second run: everything is saved now, no transcript is fetched again');
    const lf = env.ffCalls[before].variables.from;
    ok(Math.abs(Date.parse(lf) - (Date.parse(env.props.FF_LAST_CHECK) - DAY)) < 1000, 'later runs list since the last check, with a 1-day overlap');
  }

  console.log('\n[5. Fireflies: the doc, line for line (sample B)]');
  {
    const env = ffEnv({ FIREFLIES_START_DATE: '2026-10-30' });
    ffRoute(env, [trB()]);
    env.run('runFireflies');
    const d = ffDocs(env)[0];
    const today = env.fmt(new Date(), 'yyyy-MM-dd');
    eq(texts(d), [
      'Fireflies Transcript — Sunday, November 1, 2026 (Session with Dr. Shobha)',
      'Meeting ID: ' + ID1 + ' Pulled: ' + today,
      '',
      'Id: ' + ID1 + ' DateString: 2026-11-02T03:30:00.000Z Privacy: link Speakers: Nikhil Nandagopal, Shobha Managoli Sentences:',
      '[00:01 - 00:01] Nikhil Nandagopal: Give me a sec.',
      "[00:01 - 00:02] Nikhil Nandagopal: I'm just gonna come in.",
      "[00:02 - 00:09] Nikhil Nandagopal: I was cleaning my room, which, as you know, is the task I've been avoiding.",
      '[00:14 - 00:14] Nikhil Nandagopal: Okay.',
      '[00:20 - 00:20] Shobha Managoli: Okay.',
      '[00:20 - 00:24] Shobha Managoli: So today we are starting on the cognitive retraining part of it.',
    ], 'matches sample B: title (UTC Nov 2 03:30 is Nov 1 in Anchorage), Meeting ID line, rule, Id line, one line per sentence');
    ok(d.children[0].heading === 'HEADING1' && d.children.slice(1).every(c => c.heading === 'NORMAL'), 'title is Heading 1, the rest Normal');
    ok(d.children[2].hr === true, 'the third paragraph is a horizontal rule');
    ok(d.children.filter(c => !c.text && !c.hr).length === 0, 'no empty paragraphs (single spacing)');
    ok(d.name === 'Fireflies Transcript 2026-11-01 Session with Dr. Shobha', 'default doc name from the template');
    ok(env.drive.files[d.id].desc.includes(ID1), 'the doc description holds the meeting id');
    ok(env.drive.files[d.id].parent === env.folder.getId(), 'saved in the Fireflies Meetings folder');
    ok(env.log.fetches.every(c => c.url === 'https://api.fireflies.ai/graphql' && c.headers.Authorization === 'Bearer test-key'), 'only Fireflies is called, with the Bearer key from FIREFLIES_API_KEY');
  }
  {
    const env = ffEnv();
    const long = trB({ id: ID2, title: 'Weekly sync', meeting_link: 'https://zoom.us/j/1', speakers: [], sentences: [
      { speaker_name: 'A', text: 'line one\nline two', start_time: 3725.4, end_time: 3730 }, { speaker_name: 'B', text: 'Hi', start_time: 59.9, end_time: 60.1 }] });
    ffRoute(env, [long]);
    env.props.FIREFLIES_DOC_NAME = 'FF {date} - {context}';
    env.run('runFireflies');
    const d = ffDocs(env)[0];
    ok(d.name === 'FF 2026-11-01 - Weekly sync', 'FIREFLIES_DOC_NAME template with {date} and {context}; other links use the Fireflies title');
    eq(texts(d).slice(0, 1), ['Fireflies Transcript — Sunday, November 1, 2026 (Weekly sync)'], 'title uses the Fireflies title for other meetings');
    eq(texts(d).slice(3), ['Id: ' + ID2 + ' DateString: 2026-11-02T03:30:00.000Z Privacy: link Speakers: A, B Sentences:', '[1:02:05 - 1:02:10] A: line one line two', '[00:59 - 01:00] B: Hi'], 'h:mm:ss past an hour, one paragraph per sentence, speakers taken from the sentences when no speaker list');
    env.props.FIREFLIES_DOC_NAME = 'Renamed {date}';
    ffRoute(env, [long]); env.run('runFireflies');
    ok(ffDocs(env).length === 1 && ffDocs(env)[0].name === 'FF 2026-11-01 - Weekly sync', 'changing the template never renames or re-saves an existing doc (saved-or-not is by Meeting ID)');
    const e2 = ffEnv(); ffRoute(e2, [trB({ id: ID3 })]); e2.run('runFireflies');
    ok(ffDocs(e2)[0].name.startsWith('Fireflies Transcript 2026-11-01 '), 'default template when FIREFLIES_DOC_NAME is not set');
  }
  {
    const env = ffEnv({ FIREFLIES_FOLDER_ID: 'foX' });
    env.drive.folders.foX = { id: 'foX', name: 'Somewhere else', parent: 'root' };
    ffRoute(env, [trB({ id: ID4 })]); env.run('runFireflies');
    ok(Object.values(env.docs).some(d => env.drive.files[d.id].parent === 'foX') && ![...Object.values(env.drive.folders)].some(f => f.name === 'Fireflies Meetings' && f.parent === 'root' && f !== env.drive.folders[env.folder.getId()]), 'FIREFLIES_FOLDER_ID overrides the search by name');
    const e2 = makeEnv({ props: { FIREFLIES_API_KEY: 'k', FIREFLIES_START_DATE: '2026-10-01' } });
    ffRoute(e2, [trB({ id: ID4 })]); e2.run('runFireflies');
    ok(Object.values(e2.drive.folders).some(f => f.name === 'Fireflies Meetings') && Object.values(e2.docs).length === 1, 'the Fireflies Meetings folder is created if missing');
  }

  console.log('\n[6. Fireflies: call budget, 429, not ready]');
  {
    const utc = new Date().toISOString().slice(0, 10);
    const env = ffEnv({ FF_CALLS: JSON.stringify({ day: utc, n: 399 }) });
    ffRoute(env, [trB({ id: ID2 }), trB({ id: ID3 })]);
    env.run('runFireflies');
    ok(env.ffCalls.length === 1 && JSON.parse(env.props.FF_CALLS).n === 400 && ffDocs(env).length === 0, 'stops at 400 calls per UTC day (500 free limit x 80%), even mid-run');
    env.run('runFireflies');
    ok(env.ffCalls.length === 1, 'further runs that day make no calls');
    ok(!env.props.FF_LAST_CHECK, 'a stopped run does not move the last-check time');
    env.props.FF_CALLS = JSON.stringify({ day: '2000-01-01', n: 400 });
    env.run('runFireflies');
    ok(env.ffCalls.length > 1 && JSON.parse(env.props.FF_CALLS).day === utc, 'a new UTC day starts the count again');
  }
  {
    const env = ffEnv();
    ffRoute(env, [trB({ id: ID2 })]);
    env.ffReply = (c) => (/transcript\(id/.test(c.body.query) ? { code: 429, body: { errors: [{ code: 'too_many_requests' }] }, headers: { 'Retry-After': '12' } } : null);
    env.run('runFireflies');
    ok(env.log.sleeps.includes(12000) && env.ffCalls.length === 2 && ffDocs(env).length === 0, '429: waits Retry-After seconds, then stops for the run');
    const n = env.ffCalls.length; env.run('runFireflies');
    ok(env.ffCalls.length === n, '...and does not call again while the block lasts');
    const e2 = ffEnv(); ffRoute(e2, [trB({ id: ID2 })]);
    e2.ffReply = (c) => ({ code: 429, body: {}, headers: { 'Retry-After': '3600' } });
    e2.run('runFireflies');
    ok(e2.log.sleeps.includes(30000) && Number(e2.props.FF_BLOCKED_UNTIL) > Date.now() + 3000 * 1000, 'a long Retry-After sleeps at most 30 s but later runs wait out the whole block');
    e2.props.FF_BLOCKED_UNTIL = String(Date.now() - 1000); e2.ffReply = null; ffRoute(e2, [trB({ id: ID2 })]); e2.run('runFireflies');
    ok(ffDocs(e2).length === 1, 'after the block ends it saves normally');
  }
  {
    const env = ffEnv();
    const notReady = trB({ id: ID2, sentences: [] });
    ffRoute(env, [notReady]); env.run('runFireflies');
    ok(ffDocs(env).length === 0, 'transcript not ready (no sentences): no doc made');
    ok(Date.parse(env.props.FF_LAST_CHECK) === Date.parse('2026-11-02T03:30:00.000Z'), '...and the last-check time stays at that meeting, so it is tried again');
    ffRoute(env, [trB({ id: ID2 })]); env.run('runFireflies');
    ok(ffDocs(env).length === 1, 'next run: it is ready and gets saved');
  }
  {
    const env = makeEnv(); ffRoute(env, []); env.run('runFireflies');
    ok(env.log.fetches.length === 0 && env.logRows().some(r => /FIREFLIES_API_KEY/.test(r[5])), 'no API key: no call, the log says why');
  }
}

part1();
part3();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
