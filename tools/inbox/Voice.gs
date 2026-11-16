// NW Inbox cloud pipeline. Destination is pinned to the dedicated automatic-transcript Doc.
var NWI_AUDIO_EXT = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/x-aac', webm: 'audio/webm', mp4: 'audio/mp4' };
var NWI_CHUNK = 8 * 1024 * 1024; // multiple of 256 KiB, as Cloud Storage resumable uploads need
var NWI_RUN_BUDGET_MS = 270000;  // stop starting new files after 4.5 of the 6 minutes
var NWI_DEADLINE = 0;

// The transcription rule (Nov 15). It goes with each job in request.json as "prompt"; the Cloud Run worker's own prompt
// must say the same (its source is not in this project). Speaker numbers stay unless the recording itself says a name.
var NWI_PROMPT = 'Transcribe this audio recording verbatim. Use light punctuation and break it into paragraphs. ' +
  'Do not summarize. Do not clean up or change any words. Do not add headings or any other text. ' +
  'Only if more than one person speaks, start each speaker\'s turn on its own line with "Speaker 1:", "Speaker 2:" and so on. ' +
  'Use a person\'s name in place of the number only when the recording itself says it: someone says their own name, ' +
  'is addressed by name, or is named afterwards (for example "that was Corky"). Never guess a name. ' +
  'If one person speaks, do not add any speaker label. ' +
  'If the recording begins with one of these words: task, note, done, wins, joy, coach, geog, stagecraft, life, private, ' +
  'label the person who says that first word "Nikhil:"; everyone else is "Speaker 2:", "Speaker 3:" and so on, unless the recording names them. ' +
  'Output only the transcript.';

// In a memo that begins with a tag word, the speaker who says it is Nikhil (only he starts memos with a tag word, Nov 15).
// Everyone else is "Speaker 2", "Speaker 3"… in the order they first speak, unless the recording names them. Applied here
// as well as asked of the worker, so it holds whatever the worker returned. map: { "<label as written>": "<new label>" }.
function nwiNikhilMap_(lines) {
  var first = NWI_LABEL_RE.exec(String(lines[0] || ''));
  if (!first) return null;
  var map = {}, n = 2;
  map[first[1]] = 'Nikhil';
  lines.forEach(function (l) {
    var m = NWI_LABEL_RE.exec(l);
    if (m && !map[m[1]] && /^Speaker \d+$/.test(m[1])) map[m[1]] = 'Speaker ' + n++;
  });
  return map;
}
function nwiApplyLabels_(lines, map) {
  if (!map) return lines;
  return lines.map(function (l) {
    var m = NWI_LABEL_RE.exec(l);
    return m && map[m[1]] ? map[m[1]] + ': ' + l.slice(m[0].length) : l;
  });
}
// Tag words: a memo that begins with one is copied with "<tag>:" in front. Since Nov 16 every memo goes to the Brain Dump
// (untagged ones as said), except one that begins with "work".
var NWI_TAGS = ['task', 'note', 'done', 'wins', 'joy', 'coach', 'geog', 'stagecraft', 'life', 'private'];
var NWI_LABEL_RE = /^(Speaker \d+|[A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*)?):\s*/;

function runVoiceInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try { nwiPilotPreflight_(); nwiCloudPreflight_(); nwiVoiceRun_(); } finally { lock.releaseLock(); }
}

// Read-only configuration check. Does not install timers, change folders or call Gemini.
function checkVoiceInbox() {
  nwiPilotPreflight_();
  nwiCloudPreflight_();
  var cap = Number(nwiCfg_('DAILY_CAP_MINUTES')), bitrate = Number(nwiCfg_('AUDIO_KBPS_ESTIMATE'));
  if (!(cap > 0) || !isFinite(cap) || !(bitrate > 0) || !isFinite(bitrate)) throw new Error('Daily cap and bitrate estimate must be positive numbers.');
  var manualId = nwiProp_('VOICE_INBOX_FOLDER_ID'), manual;
  if (manualId) manual = DriveApp.getFolderById(manualId);
  else {
    var matches = DriveApp.getFoldersByName(NWI_VOICE_FOLDER);
    if (!matches.hasNext()) throw new Error('Manual Voice Inbox not found. Verify VOICE_INBOX_FOLDER_ID.');
    manual = matches.next();
    if (matches.hasNext()) throw new Error('Multiple Voice Inbox folders exist. Set VOICE_INBOX_FOLDER_ID explicitly.');
  }
  var report = ['Manual input: ' + manual.getName() + ' (' + manual.getId() + ')'];
  var root = nwiProp_('RECLY_ROOT_FOLDER_ID');
  if (root) {
    if (!isFinite(Date.parse(nwiProp_('VOICE_IMPORT_AFTER') || ''))) throw new Error('Set a valid VOICE_IMPORT_AFTER timestamp.');
    var recly = DriveApp.getFolderById(root);
    if (manual.getId() === root) throw new Error('Manual inbox and Recly root must be separate folders.');
    report.push('Recly input: ' + recly.getName() + ' (' + root + ')');
    report.push('Recly import after: ' + nwiProp_('VOICE_IMPORT_AFTER'));
  } else report.push('Recly input disabled: no RECLY_ROOT_FOLDER_ID.');
  report.push('Model: ' + nwiCfg_('VERTEX_MODEL') + '; region: ' + nwiCfg_('VERTEX_REGION'));
  report.push('Daily estimated audio allowance: ' + cap + ' minutes submitted. Section retries are bounded separately. Not a billing hard limit.');
  report.push('Configuration readable. Model access, uploads and transcript quality still require an actual test.');
  Logger.log(report.join('\n'));
  return report;
}

function nwiVoiceRun_() {
  var started = Date.now();
  NWI_DEADLINE = started + NWI_RUN_BUDGET_MS;
  var folders = null;
  try { folders = nwiVoiceFolders_(); }
  catch (e) { nwiLog_('', '', '', '', 'manual inbox unavailable: ' + e.message); }
  var files = nwiCloudPendingFiles_(nwiCollectVoiceFiles_(folders));
  if (!files.length) return;
  files.sort(function (a, b) { return (a.recorded - b.recorded) || a.name.localeCompare(b.name); }); // process recording parts in ascending order
  var docRef;
  try { docRef = nwiTranscriptsDoc_(); } catch (e) { nwiLog_('', '', '', '', 'stopped: ' + e.message); return; }
  for (var i = 0; i < files.length; i++) {
    if (Date.now() - started > NWI_RUN_BUDGET_MS) break;
    try { nwiVoiceOne_(files[i], folders, nwiTranscriptsDoc_()); }
    catch (e) { nwiLog_(files[i].name, '', '', '', 'processing interrupted: ' + e.message); }
    // A file that cannot fit today's remaining allowance must not block smaller files.
  }
}

// Both sources share one lock, queue and daily cap. A source failure does not
// prevent the other source from being processed. Prefer leave-in-place handling
// if the same Drive file is accidentally discovered through both paths.
function nwiCollectVoiceFiles_(folders) {
  var manual = [], recly = [];
  if (folders) {
    try { manual = nwiListAudio_(folders.inbox); }
    catch (e) { nwiLog_('', '', '', '', 'manual scan failed: ' + e.message); }
  }
  if (nwiProp_('RECLY_ROOT_FOLDER_ID')) {
    try { recly = nwiListReclyAudio_(); }
    catch (e) { nwiLog_('', '', '', '', 'Recly scan failed: ' + e.message); }
  }
  var byId = {}, order = [];
  manual.concat(recly).forEach(function (f) {
    if (!Object.prototype.hasOwnProperty.call(byId, f.id)) {
      order.push(f.id);
      byId[f.id] = f;
    } else if (f.keepInPlace) byId[f.id] = f;
  });
  return order.map(function (id) { return byId[id]; });
}

function nwiListAudio_(inbox) {
  var out = [], it = inbox.getFiles(), now = Date.now();
  while (it.hasNext()) {
    if (NWI_DEADLINE && Date.now() > NWI_DEADLINE) break;
    var f = it.next(), name = f.getName();
    var ext = (/\.([A-Za-z0-9]+)$/.exec(name) || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    var mime = f.getMimeType() || '';
    if (!NWI_AUDIO_EXT[ext] && mime.indexOf('audio/') !== 0) continue;
    var updated = f.getLastUpdated();
    if (now - updated.getTime() < 60000) continue; // still uploading
    out.push({ file: f, id: f.getId(), name: name, mime: NWI_AUDIO_EXT[ext] || mime, size: f.getSize(), recorded: nwiRecordedDate_(name, updated) });
  }
  return out;
}
// Recly owns these folders. Scan recursively, process only new settled audio,
// and leave originals in place so the phone app can still find them.
function nwiListReclyAudio_() {
  var root = nwiProp_('RECLY_ROOT_FOLDER_ID');
  var after = Date.parse(nwiProp_('VOICE_IMPORT_AFTER') || '');
  if (!isFinite(after)) throw new Error('Set VOICE_IMPORT_AFTER to an ISO timestamp before importing Recly audio.');
  var pending = nwiReadReclyQueue_();
  if (!pending.length || pending[0].root !== root) pending = [{ root: root, id: root }];
  var out = [], scanned = 0;
  while (pending.length && scanned++ < 100 && out.length < 30) {
    if (NWI_DEADLINE && Date.now() > NWI_DEADLINE) break;
    var next = pending.shift(), folder;
    try { folder = DriveApp.getFolderById(next.id); }
    catch (e) { nwiLog_('Recly folder ' + next.id, '', '', '', 'scan skipped: ' + e.message); continue; }
    nwiListAudio_(folder).forEach(function (f) {
      if (f.file.getDateCreated().getTime() > after && !/^NW Inbox processed:/.test(f.file.getDescription() || '')) {
        f.keepInPlace = true;
        out.push(f);
      }
    });
    var children = folder.getFolders();
    while (children.hasNext()) pending.push({ root: root, id: children.next().getId() });
  }
  nwiSaveReclyQueue_(pending);
  return out;
}

// Keep each queue property below Apps Script's per-value size limit.
function nwiReadReclyQueue_() {
  var count = Number(nwiProp_('RECLY_QUEUE_V2_COUNT'));
  if (!nwiProp_('RECLY_QUEUE_V2_COUNT')) return nwiJson_('RECLY_SCAN_QUEUE', []);
  var out = [];
  for (var i = 0; i < count; i++) out = out.concat(nwiJson_('RECLY_QUEUE_V2_' + i, []));
  return out;
}
function nwiSaveReclyQueue_(pending) {
  var old = Number(nwiProp_('RECLY_QUEUE_V2_COUNT')) || 0, count = 0;
  for (var i = 0; i < pending.length; i += 40) nwiSet_('RECLY_QUEUE_V2_' + count++, JSON.stringify(pending.slice(i, i + 40)));
  nwiSet_('RECLY_QUEUE_V2_COUNT', count);
  var props = PropertiesService.getScriptProperties();
  for (var j = count; j < old; j++) props.deleteProperty('RECLY_QUEUE_V2_' + j);
  props.deleteProperty('RECLY_SCAN_QUEUE');
}

// "20261103 091400-AB12.m4a" (Voice Memos' own file name) is read in the script time zone; otherwise the file's
// modified time, which iOS keeps from the recording when it saves to Drive.
function nwiRecordedDate_(name, updated) {
  var recly = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z_/.exec(name);
  if (recly) return new Date(recly[1] + '-' + recly[2] + '-' + recly[3] + 'T' + recly[4] + ':' + recly[5] + ':' + recly[6] + 'Z');
  var m = /(\d{4})(\d{2})(\d{2})[ _-](\d{2})(\d{2})(\d{2})/.exec(name);
  if (m) {
    try { return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6], nwiTz_(), 'yyyy-MM-dd HH:mm:ss'); } catch (e) { /* fall through */ }
  }
  return updated;
}

// Rejoin raw storage chunks BEFORE splitting IDs: a chunk boundary may cut an ID.
function nwiVoiceWritten_() {
  var text = '', value, i = 0;
  while ((value = nwiProp_('VOICE_WRITTEN_' + i++)) !== null) text += value;
  return text.split(',').filter(function (id) { return !!id; });
}

function nwiVoiceOne_(f, folders, docRef) {
  return nwiCloudVoiceOne_(f, folders, docRef);
}
function nwiToProblem_(f, folders, why) {
  f.file.setDescription(nwiFmt_(new Date(), 'yyyy-MM-dd HH:mm z') + ' — ' + why);
  if (f.keepInPlace) {
    f.file.setDescription('NW Inbox processed: problem — ' + why + ' Review the worker hold before retrying; the original audio is retained.');
  } else f.file.moveTo(folders.problem);
}

// Cloud Storage resumable upload, fed by ranged reads of the Drive file (each piece 8 MiB, far under the 50 MB limits).
function nwiGcsUpload_(f, bucket, objName) {
  var auth = { Authorization: 'Bearer ' + nwiToken_() };
  var init = UrlFetchApp.fetch('https://storage.googleapis.com/upload/storage/v1/b/' + encodeURIComponent(bucket) + '/o?uploadType=resumable&name=' + encodeURIComponent(objName), {
    method: 'post', contentType: 'application/json', payload: '{}', muteHttpExceptions: true,
    headers: { Authorization: auth.Authorization, 'X-Upload-Content-Type': f.mime }
  });
  if (init.getResponseCode() >= 300) throw new Error('Cloud Storage upload start ' + init.getResponseCode() + ': ' + init.getContentText().slice(0, 200));
  var hs = init.getHeaders(), loc = hs.Location || hs.location;
  if (!loc) throw new Error('Cloud Storage gave no upload address');
  for (var start = 0; start < f.size; start += NWI_CHUNK) {
    if (NWI_DEADLINE && Date.now() > NWI_DEADLINE) throw new Error('Run time budget reached during upload; original retained.');
    var end = Math.min(start + NWI_CHUNK, f.size) - 1;
    var piece = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + f.id + '?alt=media&supportsAllDrives=true', { headers: { Authorization: auth.Authorization, Range: 'bytes=' + start + '-' + end }, muteHttpExceptions: true });
    var pc = piece.getResponseCode();
    if (pc !== 206 && !(pc === 200 && f.size <= NWI_CHUNK)) throw new Error('Drive read ' + pc + ' at byte ' + start);
    var put = UrlFetchApp.fetch(loc, { method: 'put', payload: piece.getContent(), muteHttpExceptions: true, headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + f.size } });
    var pcode = put.getResponseCode();
    var last = end === f.size - 1;
    if (!(last ? (pcode === 200 || pcode === 201) : pcode === 308)) throw new Error('Cloud Storage upload ' + pcode + ' at byte ' + start + ': ' + put.getContentText().slice(0, 200));
  }
}

// ── Writing into the Docs ──
function nwiTranscriptsDoc_() {
  var id = nwiProp_('TRANSCRIPTS_DOC_ID');
  if (id !== NWI_AUTO_DOC_ID) throw new Error('Set TRANSCRIPTS_DOC_ID to the dedicated automatic-transcript Doc ID: ' + NWI_AUTO_DOC_ID + '. Legacy Docs are blocked.');
  if (nwiProp_('ROLLING_DOC_ID') === id) throw new Error('ROLLING_DOC_ID must differ from TRANSCRIPTS_DOC_ID.');
  return DocumentApp.openById(id);
}
function nwiRollingDoc_() {
  var id = nwiProp_('ROLLING_DOC_ID');
  if (id) {
    var existing = DocumentApp.openById(id);
    if (existing.getName() !== NWI_ROLLING_TITLE) throw new Error('Unexpected ROLLING_DOC_ID; verify it before continuing.');
    return existing;
  }
  var doc = DocumentApp.create(NWI_ROLLING_TITLE);
  try { DriveApp.getFileById(doc.getId()).moveTo(nwiVoiceFolders_().inbox); } catch (e) { /* stays in My Drive */ }
  nwiSet_('ROLLING_DOC_ID', doc.getId());
  return doc;
}
// One complete entry is inserted in one operation. The source link is its final
// line, so a retry can recover a saved entry even if the tracking property failed.
function nwiSavedMemoBlock_(doc, id) {
  var needle = 'Source audio: https://drive.google.com/file/d/' + id + '/view';
  var match = doc.getBody().findText(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!match) return null;
  var text = match.getElement().getParent().asParagraph().getText();
  return (text.indexOf('(voice memo, ') === 0 || text.indexOf('(continued, part ') === 0) && text.slice(-needle.length) === needle ? text : null;
}
function nwiMemoPara_(doc, id) {
  var needle = 'Source audio: https://drive.google.com/file/d/' + id + '/view';
  var match = doc.getBody().findText(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return match ? match.getElement().getParent().asParagraph() : null;
}
// "2 min 17 s" or "17 s".
function nwiDurText_(sec) {
  if (!(Number(sec) >= 0)) return '';
  var total = Math.round(Number(sec)), m = Math.floor(total / 60), s = total - m * 60;
  return m ? m + ' min ' + s + ' s' : s + ' s';
}
// Recly splits one recording into ..._p001, ..._p002: { base, n } (null for any other name).
function nwiPartOf_(name) {
  var m = /^(.*)_p(\d{2,4})(\.[A-Za-z0-9]+)?$/.exec(name || '');
  return m ? { base: m[1], n: Number(m[2]) } : null;
}
// Under 3 seconds, or nothing but "[inaudible]", "[No intelligible speech]" and the like.
function nwiIsEmptyMemo_(text, seconds) {
  if (seconds !== undefined && seconds !== null && Number(seconds) < 3) return true;
  var rest = String(text || '').split(/\n+/).map(function (l) { return l.replace(NWI_LABEL_RE, '').replace(/\[[^\]]*\]/g, '').replace(/[\s.,…-]+/g, ''); }).join('');
  return !rest;
}
// The tag word a memo starts with (after any speaker label), or null.
function nwiSpokenTag_(lines) {
  var first = String(lines[0] || '').replace(NWI_LABEL_RE, '');
  var m = /^([A-Za-z]+)\b/.exec(first);
  var w = m ? m[1].toLowerCase() : '';
  return NWI_TAGS.indexOf(w) >= 0 ? w : null;
}
// One header line per memo (Nov 15). Parts of one Recly recording become one entry: the first part has the header, a later
// part is added under it as "(continued, part 2, …)". Each part ends with its own source line, so a retry finds it.
function nwiWriteMemo_(f, text, docRef, notes, seconds) {
  var body = [];
  String(text || '').split(/\n+/).forEach(function (l) { l = l.trim(); if (l) body.push(l); });
  var part = nwiPartOf_(f.name), parts = nwiJson_('VOICE_PARTS', {}), first = part ? parts[part.base] : null;
  var later = !!(first && first.id !== f.id), dur = nwiDurText_(seconds);
  var labels = later ? (first.labels || null) : (nwiSpokenTag_(body) ? nwiNikhilMap_(body) : null);
  body = nwiApplyLabels_(body, labels);
  var lines = [later
    ? '(continued, part ' + part.n + (dur ? ', ' + dur : '') + ')'
    : '(voice memo, ' + nwiFmt_(f.recorded, 'h:mm a') + (dur ? ', ' + dur : '') + ', automatic draft, speakers as heard)'];
  body.forEach(function (l) { lines.push(l); });
  if (notes) {
    lines.push('Acoustic observations — AI estimates, separate from spoken words');
    notes.split(/\n+/).forEach(function (l) { if (l.trim()) lines.push(l.trim()); });
  }
  lines.push('Source audio: https://drive.google.com/file/d/' + f.id + '/view');
  // Every memo goes to the Brain Dump (Nov 16: untagged ones too), except one that begins with "work".
  var work = later ? first.tag === 'work' : /^work\b/i.test(String(body[0] || '').replace(NWI_LABEL_RE, ''));
  var tag = later ? (first.tag === 'work' ? null : first.tag) : nwiSpokenTag_(body);
  if (part && !first) {
    parts[part.base] = { id: f.id, tag: work ? 'work' : (tag || ''), labels: labels || null, at: Date.now() };
    var keys = Object.keys(parts).sort(function (a, b) { return parts[b].at - parts[a].at; });
    keys.forEach(function (k, i) { if (i >= 40 || Date.now() - parts[k].at > 3 * 86400000) delete parts[k]; });
    nwiSet_('VOICE_PARTS', JSON.stringify(parts));
  }
  if (later) nwiStoreContinuation_(f, lines.join('\n'), docRef, first.id);
  else nwiStoreMemoBlock_(f, lines.join('\n'), docRef);
  if (!work) {
    try { nwiToBrainDump_(f, tag || '', body, later); }
    catch (e) { nwiLog_(f.name, '', '', '', 'Brain Dump not updated: ' + e.message); }
  }
}
// A later part goes right under its recording's entry (after any parts already there); if that entry is not in the
// doc (e.g. the rolling doc dropped it), it goes under its day like any memo.
function nwiStoreContinuation_(f, block, docRef, firstId) {
  [docRef].concat((function () { try { return [nwiRollingDoc_()]; } catch (e) { return []; } })()).forEach(function (doc, k) {
    if (nwiSavedMemoBlock_(doc, f.id)) return;
    var p = nwiMemoPara_(doc, firstId);
    if (!p) { if (k === 0) nwiStoreMemoBlock_(f, block, doc); return; }
    var body = doc.getBody(), at = body.getChildIndex(p) + 1, paras = body.getParagraphs();
    while (at < paras.length && !nwiIsH1_(paras[at]) && paras[at].getText().indexOf('(continued, part ') === 0) at++;
    var np = at >= body.getNumChildren() ? body.appendParagraph(block) : body.insertParagraph(at, block);
    np.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    doc.saveAndClose();
  });
}

// ── Spoken tags reach the Brain Dump (Nov 15) ──
// This month's "Brain Dump <Mon> <yyyy>" (the app's own doc). Not made here: when it is not found, the log says so.
function nwiBrainDumpDoc_(when) {
  var name = 'Brain Dump ' + nwiFmt_(when, 'MMM yyyy');
  var me = Session.getEffectiveUser().getEmail(), it = DriveApp.getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() === 'application/vnd.google-apps.document' && (!f.getOwner() || f.getOwner().getEmail() === me)) return DocumentApp.openById(f.getId());
  }
  return null;
}
// One paragraph, under the day heading in the app's format ("Sunday, Nov 15, 2026"), at the top of that day like the
// app's own captures. The spoken tag becomes "task:" in front; speaker labels stay on their own lines; it ends
// "(voice, 2:39 AM)". Written once per audio file.
function nwiToBrainDump_(f, tag, lines, later) {
  var written = nwiGetList_('VOICE_BD_WRITTEN');
  if (written.indexOf(f.id) >= 0 || !lines.length) return;
  var doc = nwiBrainDumpDoc_(f.recorded);
  if (!doc) { nwiLog_(f.name, '', '', '', 'Brain Dump not updated: no doc named "Brain Dump ' + nwiFmt_(f.recorded, 'MMM yyyy') + '"'); return; }
  var out = lines.slice();
  var label = (NWI_LABEL_RE.exec(out[0]) || [''])[0];
  if (tag && !later) out[0] = label + out[0].slice(label.length).replace(/^[A-Za-z]+\b[\s,.:;!-]*/, '');
  if (!out[0].slice(label.length).trim()) out.shift(); // the memo was only the tag word on its first line
  var multi = out.some(function (l) { return NWI_LABEL_RE.test(l); });
  // Tagged: "task: …". Untagged: the text as said (Nov 16). Either way speaker labels stay on their own lines.
  var head = tag ? tag + ':' + (later ? ' (continued)' : '') : (later ? '(continued)' : '');
  var text = (head ? head + (multi ? '\n' : ' ') : '') + out.join('\n') + ' (voice, ' + nwiFmt_(f.recorded, 'h:mm a') + ')';
  var heading = Utilities.formatDate(f.recorded, nwiTz_(), 'EEEE, MMM d, yyyy');
  var body = doc.getBody(), paras = body.getParagraphs(), at = -1;
  for (var i = 0; i < paras.length; i++) if (nwiIsH1_(paras[i]) && paras[i].getText().trim() === heading) { at = body.getChildIndex(paras[i]) + 1; break; }
  if (at < 0) { body.insertParagraph(0, heading).setHeading(DocumentApp.ParagraphHeading.HEADING1); at = 1; }
  var p = at >= body.getNumChildren() ? body.appendParagraph(text) : body.insertParagraph(at, text);
  p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  doc.saveAndClose();
  written.push(f.id);
  nwiSetList_('VOICE_BD_WRITTEN', written.slice(-300));
  nwiLog_(f.name, '', '', '', 'Brain Dump: ' + (tag || 'untagged') + ' line added');
}
function nwiStoreMemoBlock_(f, block, docRef) {
  var heading = nwiFmt_(f.recorded, 'EEE, MMM d, yyyy');
  if (!nwiSavedMemoBlock_(docRef, f.id)) nwiInsertEntry_(docRef, heading, [block]);
  docRef.saveAndClose(); // persist main text before any processed marker/file move
  try {
    var rolling = nwiRollingDoc_();
    if (!nwiSavedMemoBlock_(rolling, f.id)) nwiInsertEntry_(rolling, heading, [block]);
    nwiTrimRolling_(rolling);
    rolling.saveAndClose();
  } catch (e) { nwiLog_(f.name, '', '', '', 'rolling doc not updated; main draft saved: ' + e.message); }
}
function nwiIsH1_(p) { return p.getHeading() === DocumentApp.ParagraphHeading.HEADING1; }
function nwiHeadingDateKey_(heading) {
  var m = /^\w{3}, (\w{3}) (\d{1,2}), (\d{4})$/.exec(heading.trim());
  var months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  return m && months[m[1]] ? m[3] + '-' + months[m[1]] + '-' + ('0' + m[2]).slice(-2) : null;
}
// Dates newest first; append entries within their date so p001 precedes p002.
// Existing text is not rearranged. A delayed older part can still arrive out of order.
function nwiInsertEntry_(doc, heading, lines) {
  var body = doc.getBody(), paras = body.getParagraphs(), at = body.getNumChildren();
  var found = false, key = nwiHeadingDateKey_(heading);
  for (var i = 0; i < paras.length; i++) {
    if (!nwiIsH1_(paras[i])) continue;
    if (paras[i].getText().trim() === heading) {
      found = true;
      at = body.getNumChildren();
      for (var j = i + 1; j < paras.length; j++) {
        if (nwiIsH1_(paras[j])) { at = body.getChildIndex(paras[j]); break; }
      }
      break;
    }
    var existingKey = nwiHeadingDateKey_(paras[i].getText());
    if (existingKey && key && existingKey < key && at === body.getNumChildren()) at = body.getChildIndex(paras[i]);
  }
  function insert(text, index) {
    return index === body.getNumChildren() ? body.appendParagraph(text) : body.insertParagraph(index, text);
  }
  if (!found) {
    if (paras.length === 1 && !paras[0].getText() && body.getNumChildren() === 1) {
      paras[0].setText(heading).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      at = 1;
    } else insert(heading, at++).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  }
  lines.forEach(function (line) { insert(line, at++).setHeading(DocumentApp.ParagraphHeading.NORMAL); });
}

// The rolling doc is ours: drop whole days older than 7 days (today and the 6 days before it stay).
function nwiTrimRolling_(doc) {
  var body = doc.getBody(), paras = body.getParagraphs();
  var t = new Date(); t.setTime(t.getTime() - 6 * 86400000);
  var cutoff = nwiFmt_(t, 'yyyy-MM-dd');
  var months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  var sections = [], cur = null;
  paras.forEach(function (p) {
    if (nwiIsH1_(p)) {
      var m = /^\w{3}, (\w{3}) (\d{1,2}), (\d{4})$/.exec(p.getText().trim());
      cur = { key: m ? m[3] + '-' + months[m[1]] + '-' + ('0' + m[2]).slice(-2) : null, paras: [p] };
      sections.push(cur);
    } else if (cur) cur.paras.push(p);
  });
  sections.forEach(function (s) {
    if (s.key && s.key < cutoff) s.paras.slice().reverse().forEach(function (p) { try { p.removeFromParent(); } catch (e) { /* the last paragraph of a doc can't be removed */ } });
  });
}

