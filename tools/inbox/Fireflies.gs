// Fireflies.gs — Part 2: Fireflies transcripts saved verbatim as Google Docs in the Drive folder "Fireflies Meetings".
// Fireflies free plan (docs.fireflies.ai/fundamentals/limits, read Nov 4, 2026): 500 requests/day, 30/minute, reset at
// midnight UTC; the first request starts a 14-day trial at 60/minute and 5,000/day. A 429 carries Retry-After (seconds).
// This script counts its calls per UTC day and stops at 400 (80% of 500), even during the trial.
// Nothing is summarized, edited or sent anywhere else.

var NWI_FF_URL = 'https://api.fireflies.ai/graphql';
var NWI_FF_LIST = 'query($from: DateTime, $limit: Int, $skip: Int) { transcripts(mine: true, fromDate: $from, limit: $limit, skip: $skip) { id title dateString date privacy meeting_link } }';
var NWI_FF_ONE = 'query($id: String!) { transcript(id: $id) { id title dateString date privacy meeting_link speakers { name } sentences { speaker_name text start_time end_time } } }';

function runFireflies() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try { nwiFfRun_(); } finally { lock.releaseLock(); }
}

function nwiStop_(why) { var e = new Error(why); e.nwiStop = true; return e; }

function nwiFfRun_() {
  if (!nwiProp_('FIREFLIES_API_KEY')) { nwiLog_('Fireflies', '', '', '', 'stopped: FIREFLIES_API_KEY is not set'); return; }
  var blocked = Number(nwiProp_('FF_BLOCKED_UNTIL') || 0);
  if (blocked > Date.now()) return;
  var started = new Date();
  var folder = nwiFfFolder_();
  var saved = nwiFfSaved_(folder);
  var notReadyFrom = null, made = 0;
  try {
    var from = nwiFfFrom_();
    var list = nwiFfListAll_(from);
    list.sort(function (a, b) { return new Date(a.dateString || a.date) - new Date(b.dateString || b.date); });
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (saved[t.id]) continue;
      var full = nwiFfCall_(NWI_FF_ONE, { id: t.id }).transcript;
      if (!full || !full.sentences || !full.sentences.length) { // not processed yet: try next run
        var when = new Date(t.dateString || t.date);
        if (!notReadyFrom || when < notReadyFrom) notReadyFrom = when;
        continue;
      }
      nwiFfSaveDoc_(folder, full, saved);
      made++;
    }
    nwiSet_('FF_LAST_CHECK', (notReadyFrom || started).toISOString());
    nwiLog_('Fireflies', '', '', '', 'checked: ' + made + ' saved' + (notReadyFrom ? ', some not ready yet' : ''));
  } catch (e) {
    if (e.nwiStop) { nwiLog_('Fireflies', '', '', '', 'stopped: ' + e.message); return; }
    nwiLog_('Fireflies', '', '', '', 'error: ' + e.message);
    throw e;
  }
}

function nwiFfFrom_() {
  var last = nwiProp_('FF_LAST_CHECK');
  if (last) return new Date(new Date(last).getTime() - 86400000); // 1-day overlap
  var start = nwiProp_('FIREFLIES_START_DATE') || nwiFmt_(new Date(), 'yyyy-MM-dd');
  return Utilities.parseDate(start, nwiTz_(), 'yyyy-MM-dd');
}

function nwiFfListAll_(from) {
  var out = [], skip = 0, limit = 50;
  for (;;) {
    var page = nwiFfCall_(NWI_FF_LIST, { from: from.toISOString(), limit: limit, skip: skip }).transcripts || [];
    out = out.concat(page);
    if (page.length < limit) return out;
    skip += limit;
  }
}

// One GraphQL call: counted per UTC day, stops at 400, honors 429.
function nwiFfCall_(query, variables) {
  var day = nwiFmt2_(new Date(), 'yyyy-MM-dd', 'UTC');
  var c = nwiJson_('FF_CALLS', {});
  if (c.day !== day) c = { day: day, n: 0 };
  if (c.n >= NWI_FF_STOP_AT) throw nwiStop_('call budget reached (' + c.n + ' of ' + NWI_FF_DAILY_LIMIT + ' today, UTC)');
  c.n++;
  nwiSet_('FF_CALLS', JSON.stringify(c));
  var resp = UrlFetchApp.fetch(NWI_FF_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + nwiProp_('FIREFLIES_API_KEY') },
    payload: JSON.stringify({ query: query, variables: variables })
  });
  var code = resp.getResponseCode(), text = resp.getContentText();
  var json = null;
  try { json = JSON.parse(text); } catch (e) { /* handled below */ }
  var tooMany = code === 429 || (json && json.errors && json.errors.some(function (er) { return er.code === 'too_many_requests'; }));
  if (tooMany) {
    var hs = resp.getHeaders() || {}, ra = Number(hs['Retry-After'] || hs['retry-after'] || 60);
    nwiSet_('FF_BLOCKED_UNTIL', Date.now() + ra * 1000); // later runs skip until then
    Utilities.sleep(Math.min(ra, 30) * 1000);             // wait (at most 30 s of this run), then stop
    throw nwiStop_('Fireflies answered 429; waiting ' + ra + ' seconds');
  }
  if (code !== 200 || !json) throw new Error('Fireflies answered ' + code + ': ' + String(text).slice(0, 200));
  if (json.errors && json.errors.length) throw new Error('Fireflies: ' + String(json.errors[0].message || json.errors[0].code).slice(0, 200));
  return json.data || {};
}
function nwiFmt2_(date, pattern, tz) { return Utilities.formatDate(date, tz, pattern); }

// ── What is already saved: the saved-id list, ids in a doc's description, or "Meeting ID: <id>" in the first 300 characters ──
function nwiFfSaved_(folder) {
  var saved = {};
  nwiGetList_('FF_SAVED').forEach(function (id) { saved[id] = true; });
  var scanned = {};
  nwiGetList_('FF_SCANNED').forEach(function (id) { scanned[id] = true; });
  var it = folder.getFiles(), changed = false;
  while (it.hasNext()) {
    var f = it.next();
    (f.getDescription() || '').split(/[^A-Za-z0-9]+/).forEach(function (tok) { if (tok.length >= 12 && !saved[tok]) { saved[tok] = true; changed = true; } });
    if (scanned[f.getId()] || f.getMimeType() !== 'application/vnd.google-apps.document') continue;
    try {
      var head = DocumentApp.openById(f.getId()).getBody().getText().slice(0, 300);
      var m = /Meeting ID:\s*([A-Za-z0-9]+)/.exec(head);
      if (m) { saved[m[1]] = true; changed = true; }
      scanned[f.getId()] = true;
    } catch (e) { /* read next run */ }
  }
  if (changed) nwiPersistSaved_(saved, scanned);
  return saved;
}
function nwiPersistSaved_(saved, scanned) {
  nwiSetList_('FF_SAVED', Object.keys(saved));
  nwiSetList_('FF_SCANNED', Object.keys(scanned));
}

// ── The doc, in his format ──
function nwiMmss_(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = function (n) { return ('0' + n).slice(-2); };
  return h > 0 ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
}
function nwiFfContext_(t) {
  return String(t.meeting_link || '').indexOf(NWI_SHOBHA_LINK) >= 0 ? 'Session with Dr. Shobha' : (t.title || 'Meeting');
}
function nwiFfLines_(t) {
  var when = new Date(t.dateString || t.date), ctx = nwiFfContext_(t);
  var names = (t.speakers || []).map(function (s) { return s && s.name; }).filter(function (n) { return n; });
  if (!names.length) (t.sentences || []).forEach(function (s) { if (s.speaker_name && names.indexOf(s.speaker_name) < 0) names.push(s.speaker_name); });
  var pulled = nwiFmt_(new Date(), 'yyyy-MM-dd');
  var lines = [
    'Fireflies Transcript — ' + nwiFmt_(when, 'EEEE, MMMM d, yyyy') + ' (' + ctx + ')',
    'Meeting ID: ' + t.id + ' Pulled: ' + pulled,
    'Id: ' + t.id + ' DateString: ' + (t.dateString || '') + ' Privacy: ' + (t.privacy || '') + ' Speakers: ' + names.join(', ') + ' Sentences:'
  ];
  t.sentences.forEach(function (s) {
    lines.push('[' + nwiMmss_(s.start_time) + ' - ' + nwiMmss_(s.end_time) + '] ' + (s.speaker_name || 'Unknown') + ': ' + String(s.text || '').replace(/\s*\n\s*/g, ' ').trim());
  });
  return { lines: lines, when: when, ctx: ctx };
}
function nwiFfDocName_(when, ctx) {
  return nwiCfg_('FIREFLIES_DOC_NAME').replace(/\{date\}/g, nwiFmt_(when, 'yyyy-MM-dd')).replace(/\{context\}/g, ctx);
}
function nwiFfSaveDoc_(folder, t, saved) {
  var built = nwiFfLines_(t);
  var doc = DocumentApp.create(nwiFfDocName_(built.when, built.ctx));
  var body = doc.getBody();
  body.setText(built.lines.join('\n')); // one paragraph per line, no empty ones
  body.getParagraphs()[0].setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.insertHorizontalRule(2);
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  file.setDescription('Fireflies meeting ' + t.id + ' saved ' + new Date().toISOString());
  file.moveTo(folder);
  saved[t.id] = true;
  var scanned = {};
  nwiGetList_('FF_SCANNED').forEach(function (id) { scanned[id] = true; });
  scanned[doc.getId()] = true;
  nwiPersistSaved_(saved, scanned);
}
