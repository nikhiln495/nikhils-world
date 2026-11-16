// NW Inbox — a separate Apps Script project ("NW Inbox"), not part of tools/drive-backup.gs.
// Code.gs: settings, helpers, setupInbox(). Voice.gs: voice memos to text. Fireflies.gs: Fireflies to Drive.
// Secrets are Script Properties. The dedicated transcript destination is pinned below. See INSTALL.md.
// No Anthropic / Claude API is called anywhere here. Transcription is Gemini on Vertex AI only.

var NWI_DEFAULTS = {
  GCP_PROJECT: 'nikhils-world',
  VERTEX_MODEL: 'gemini-3.5-flash-lite', // supported audio/transcription pilot
  VERTEX_REGION: 'global',              // supported global endpoint
  TIME_ZONE: 'America/Anchorage',        // the fallback; TZ_SCHEDULE (below) changes it by date
  DAILY_CAP_MINUTES: '120',
  INLINE_MAX_MB: '20',                   // bigger files go through the Cloud Storage bucket
  AUDIO_KBPS_ESTIMATE: '32',             // low on purpose: guesses a memo longer than it is, so the cap errs safe
  ENABLE_FIREFLIES: 'false',
  ENABLE_ACOUSTIC_NOTES: 'true',
  FIREFLIES_DOC_NAME: 'Fireflies Transcript {date} {context}'
};
var NWI_TRANSCRIPTS_TITLE = 'NW Inbox — Automatic Voice Memo Transcripts';
var NWI_AUTO_DOC_ID = '18IPx6CCBQF9otXvNJt7fbMQ5bNfDSFwcuvey_II6Rxs';
var NWI_ROLLING_TITLE = "Nikhil's World \u2014 Voice, last 7 days";
var NWI_LOG_TITLE = 'NW Inbox log';
var NWI_VOICE_FOLDER = "Nikhil's World Voice Inbox";
var NWI_FF_FOLDER = 'Fireflies Meetings';
var NWI_SHOBHA_LINK = 'sqs-iyvc-zvp';
var NWI_FF_DAILY_LIMIT = 500;
var NWI_FF_STOP_AT = 400; // 80% of the free plan, even during the 14-day trial

function nwiProp_(name) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  return v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim();
}
function nwiSet_(name, value) { PropertiesService.getScriptProperties().setProperty(name, String(value)); }
function nwiCfg_(name) {
  var v = nwiProp_(name);
  if (v !== null) return v;
  if (name === 'BUCKET_NAME') return nwiCfg_('GCP_PROJECT') + '-nw-inbox-temp';
  return NWI_DEFAULTS[name] || '';
}
function nwiJson_(name, fallback) {
  var v = nwiProp_(name);
  if (!v) return fallback;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}
// Script Properties hold 9 KB per value: long id lists are stored in pieces of 8,000 characters.
function nwiGetList_(name) {
  var out = [], i = 0, v;
  while ((v = nwiProp_(name + '_' + i)) !== null) { out = out.concat(v.split(',')); i++; }
  return out.filter(function (x) { return x; });
}
function nwiSetList_(name, arr) {
  var props = PropertiesService.getScriptProperties();
  var text = arr.join(','), i = 0;
  for (; text.length > 0; i++) { props.setProperty(name + '_' + i, text.slice(0, 8000)); text = text.slice(8000); }
  while (props.getProperty(name + '_' + i) !== null) { props.deleteProperty(name + '_' + i); i++; }
}
// Time zone by date (Nov 15): Script Property TZ_SCHEDULE, e.g.
// [{"from":"2026-12-16","tz":"Asia/Kolkata"},{"from":"2027-03-06","tz":"America/Anchorage"}].
// The latest entry whose date is not after today wins; with none (or an unreadable list) it is TIME_ZONE.
function nwiTz_() {
  var base = nwiCfg_('TIME_ZONE');
  var sched = nwiJson_('TZ_SCHEDULE', null);
  if (!sched || !sched.length) return base;
  var today = Utilities.formatDate(new Date(), base, 'yyyy-MM-dd'), pick = null;
  sched.forEach(function (s) {
    if (s && s.tz && /^\d{4}-\d{2}-\d{2}$/.test(s.from || '') && s.from <= today && (!pick || s.from >= pick.from)) pick = s;
  });
  return pick ? pick.tz : base;
}
function nwiFmt_(date, pattern) { return Utilities.formatDate(date, nwiTz_(), pattern); }
function nwiToken_() { return ScriptApp.getOAuthToken(); }

function nwiFolderByName_(name, parent) {
  var it = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed || !f.isTrashed()) return f; }
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}
function nwiVoiceFolders_() {
  var id = nwiProp_('VOICE_INBOX_FOLDER_ID');
  var inbox = id ? DriveApp.getFolderById(id) : nwiFolderByName_(NWI_VOICE_FOLDER, null);
  return { inbox: inbox, done: nwiFolderByName_('Done', inbox), problem: nwiFolderByName_('Problem', inbox) };
}
function nwiFfFolder_() {
  var id = nwiProp_('FIREFLIES_FOLDER_ID');
  return id ? DriveApp.getFolderById(id) : nwiFolderByName_(NWI_FF_FOLDER, null);
}

// ── Log sheet "NW Inbox log": time, file, minutes, input tokens, output tokens, status ──
function nwiLogSheet_() {
  var id = nwiProp_('NW_LOG_SHEET_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    var it = DriveApp.getFilesByName(NWI_LOG_TITLE);
    while (it.hasNext()) { var f = it.next(); if (f.getMimeType() === 'application/vnd.google-apps.spreadsheet') { ss = SpreadsheetApp.openById(f.getId()); break; } }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(NWI_LOG_TITLE);
    ss.getSheets()[0].appendRow(['time', 'file', 'minutes', 'input tokens', 'output tokens', 'status']);
    try { DriveApp.getFileById(ss.getId()).moveTo(nwiVoiceFolders_().inbox); } catch (e) { /* stays in My Drive */ }
  }
  nwiSet_('NW_LOG_SHEET_ID', ss.getId());
  return ss.getSheets()[0];
}
function nwiLog_(file, minutes, inTok, outTok, status) {
  try {
    nwiLogSheet_().appendRow([nwiFmt_(new Date(), 'yyyy-MM-dd HH:mm:ss'), file, minutes === '' ? '' : Math.round(minutes * 10) / 10, inTok, outTok, status]);
  } catch (e) { Logger.log('log sheet failed: ' + e.message); }
}

// ── Setup: safe to run twice ──
function setupInbox() {
  nwiPilotPreflight_();
  if (nwiProp_('RECLY_ROOT_FOLDER_ID') && !nwiProp_('VOICE_IMPORT_AFTER')) nwiSet_('VOICE_IMPORT_AFTER', new Date().toISOString());
  var report = [];
  var folders = nwiVoiceFolders_();
  report.push('Voice Inbox folder, Done and Problem: ready.');
  nwiFfFolder_();
  report.push('Fireflies Meetings folder: ready.');
  nwiLogSheet_();
  report.push('Log sheet "' + NWI_LOG_TITLE + '": ready.');
  try { nwiRollingDoc_(); report.push('Rolling doc: ready.'); } catch (e) { report.push('Rolling doc: FAILED ' + e.message); }
  try { nwiEnsureBucket_(); report.push('Cloud Storage bucket ' + nwiCfg_('BUCKET_NAME') + ' with 1-day delete rule: ready.'); }
  catch (e) { report.push('Cloud Storage bucket: FAILED ' + e.message + ' (turn on the Cloud Storage API, then run setupInbox again. Small memos still work without it.)'); }
  if (!nwiProp_('FIREFLIES_START_DATE')) { nwiSet_('FIREFLIES_START_DATE', nwiFmt_(new Date(), 'yyyy-MM-dd')); report.push('FIREFLIES_START_DATE set to today.'); }
  var missing = [];
  if (!nwiProp_('FIREFLIES_API_KEY')) missing.push('FIREFLIES_API_KEY (required for Fireflies; the Voice Inbox works without it)');
  ['GCP_PROJECT', 'VERTEX_MODEL', 'VERTEX_REGION', 'TIME_ZONE', 'DAILY_CAP_MINUTES', 'FIREFLIES_DOC_NAME', 'BUCKET_NAME', 'TRANSCRIPTS_DOC_ID', 'VOICE_INBOX_FOLDER_ID', 'FIREFLIES_FOLDER_ID'].forEach(function (k) {
    if (!nwiProp_(k)) report.push('Not set (optional, using ' + (k.indexOf('_ID') > 0 ? 'search by name' : 'default "' + nwiCfg_(k) + '"') + '): ' + k);
  });
  missing.forEach(function (m) { report.push('MISSING Script Property: ' + m); });
  nwiSetTriggers_();
  report.push('Voice trigger: every 15 minutes. Fireflies enabled: ' + nwiCfg_('ENABLE_FIREFLIES'));
  Logger.log(report.join('\n'));
  return report;
}
function nwiPilotPreflight_() {
  if (nwiCfg_('VERTEX_MODEL') !== 'gemini-3.5-flash-lite') {
    throw new Error('This pilot is configured for gemini-3.5-flash-lite. Update VERTEX_MODEL in Script Properties; existing properties override defaults.');
  }
  if (nwiCfg_('VERTEX_REGION') !== 'global') {
    throw new Error('Set VERTEX_REGION to global for this pilot.');
  }
  nwiTranscriptsDoc_(); // validate destination before setup changes anything
}
function nwiSetTriggers_() {
  var enabled = nwiCfg_('ENABLE_FIREFLIES') === 'true';
  var want = { runVoiceInbox: function (b) { return b.everyMinutes(15); } };
  if (enabled) want.runFireflies = function (b) { return b.everyHours(2); };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runVoiceInbox' || t.getHandlerFunction() === 'runFireflies') ScriptApp.deleteTrigger(t);
  });
  Object.keys(want).forEach(function (fn) { want[fn](ScriptApp.newTrigger(fn).timeBased()).create(); });
}
function nwiEnsureBucket_() {
  var bucket = nwiCfg_('BUCKET_NAME'), project = nwiCfg_('GCP_PROJECT');
  var region = nwiCfg_('VERTEX_REGION');
  var lifecycle = { rule: [{ action: { type: 'Delete' }, condition: { age: 1 } }] };
  var headers = { Authorization: 'Bearer ' + nwiToken_() };
  var get = UrlFetchApp.fetch('https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(bucket), { headers: headers, muteHttpExceptions: true });
  if (get.getResponseCode() === 404) {
    var make = UrlFetchApp.fetch('https://storage.googleapis.com/storage/v1/b?project=' + encodeURIComponent(project), {
      method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
      payload: JSON.stringify({ name: bucket, location: region === 'global' ? 'US' : region.toUpperCase(), lifecycle: lifecycle, iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } })
    });
    if (make.getResponseCode() >= 300) throw new Error('create bucket ' + make.getResponseCode() + ': ' + make.getContentText().slice(0, 200));
    return;
  }
  if (get.getResponseCode() >= 300) throw new Error('read bucket ' + get.getResponseCode() + ': ' + get.getContentText().slice(0, 200));
  var patch = UrlFetchApp.fetch('https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(bucket), {
    method: 'patch', contentType: 'application/json', headers: headers, muteHttpExceptions: true, payload: JSON.stringify({ lifecycle: lifecycle })
  });
  if (patch.getResponseCode() >= 300) throw new Error('set delete rule ' + patch.getResponseCode() + ': ' + patch.getContentText().slice(0, 200));
}
