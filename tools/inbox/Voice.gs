// Voice.gs — Part 1: audio dropped in the Voice Inbox folder becomes text in "Transcripts of Voice Recordings".
//
// Facts looked up Nov 4, 2026 (Google docs):
//  - Model: Gemini Flash tier on Vertex AI. "gemini-2.5-flash" is GA and takes audio; newer Flash ids
//    (gemini-3.x-flash) exist: change VERTEX_MODEL to switch, nothing else.
//  - Regions: a regional endpoint (e.g. us-central1) or "global" (https://aiplatform.googleapis.com, location global).
//  - Vertex inline limit: 256 MB per inline part, 500 MiB per request (base64 adds about 33%). Cloud Storage
//    files up to 2 GiB. Audio up to about 8.4 hours per prompt.
//  - Apps Script UrlFetchApp: 50 MB per request and 50 MB per response, 20,000 calls/day (consumer), no published
//    fetch timeout, 6 minutes per execution, 90 minutes/day of trigger time on a gmail.com account.
//    So the Apps Script side, not Vertex, sets the inline limit: INLINE_MAX_MB (default 20 MB of audio, about 27 MB
//    after base64). Bigger files are copied in 8 MiB pieces to a Cloud Storage bucket and sent as gs://.

var NWI_AUDIO_EXT = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/x-aac', webm: 'audio/webm', mp4: 'audio/mp4' };
var NWI_CHUNK = 8 * 1024 * 1024; // multiple of 256 KiB, as Cloud Storage resumable uploads need
var NWI_RUN_BUDGET_MS = 270000;  // stop starting new files after 4.5 of the 6 minutes
var NWI_MAX_TRIES = 3;           // first try + 2 retries on the next 2 runs

var NWI_PROMPT = 'Transcribe this audio recording verbatim. Use light punctuation and break it into paragraphs. ' +
  'Do not summarize. Do not clean up or change any words. Do not add headings or any other text. ' +
  'Only if more than one person speaks, start each speaker\'s turn with "Speaker 1:", "Speaker 2:" and so on. ' +
  'Never guess anyone\'s name. If one person speaks, do not add any speaker label. Output only the transcript.';

function runVoiceInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try { nwiVoiceRun_(); } finally { lock.releaseLock(); }
}

function nwiVoiceRun_() {
  var started = Date.now();
  var folders = nwiVoiceFolders_();
  var files = nwiListAudio_(folders.inbox);
  if (!files.length) return;
  files.sort(function (a, b) { return a.recorded - b.recorded; }); // oldest first, so the newest ends on top of its day
  var docRef;
  try { docRef = nwiTranscriptsDoc_(); } catch (e) { nwiLog_('', '', '', '', 'stopped: ' + e.message); return; }
  for (var i = 0; i < files.length; i++) {
    if (Date.now() - started > NWI_RUN_BUDGET_MS) break;
    var r = nwiVoiceOne_(files[i], folders, docRef);
    if (r === 'cap') break;
  }
}

function nwiListAudio_(inbox) {
  var out = [], it = inbox.getFiles(), now = Date.now();
  while (it.hasNext()) {
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
// "20261103 091400-AB12.m4a" (Voice Memos' own file name) is read in the script time zone; otherwise the file's
// modified time, which iOS keeps from the recording when it saves to Drive.
function nwiRecordedDate_(name, updated) {
  var m = /(\d{4})(\d{2})(\d{2})[ _-](\d{2})(\d{2})(\d{2})/.exec(name);
  if (m) {
    try { return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6], nwiTz_(), 'yyyy-MM-dd HH:mm:ss'); } catch (e) { /* fall through */ }
  }
  return updated;
}

function nwiVoiceOne_(f, folders, docRef) {
  var id = f.id, cap = Number(nwiCfg_('DAILY_CAP_MINUTES')) || 180;
  var today = nwiFmt_(new Date(), 'yyyy-MM-dd');
  var used = nwiJson_('VOICE_USED', {});
  if (used.day !== today) used = { day: today, minutes: 0 };
  var written = nwiGetList_('VOICE_WRITTEN');
  var already = written.indexOf(id) >= 0;
  var est = f.size / (Number(nwiCfg_('AUDIO_KBPS_ESTIMATE')) * 125) / 60;
  if (!already) {
    if (est > cap) { nwiToProblem_(f, folders, 'About ' + Math.round(est) + ' minutes of audio is more than the daily cap of ' + cap + ' minutes. Raise DAILY_CAP_MINUTES and move the file back to the Voice Inbox.'); nwiLog_(f.name, est, '', '', 'problem: longer than daily cap'); return 'problem'; }
    if (used.minutes + est > cap) { nwiLog_(f.name, est, '', '', 'waiting: daily cap of ' + cap + ' minutes reached (' + Math.round(used.minutes) + ' used)'); return 'cap'; }
  }
  var fails = nwiJson_('VOICE_FAILS', {});
  var res = { minutes: 0, inTok: '', outTok: '', text: '' };
  try {
    if (!already) {
      res = nwiTranscribe_(f);
      nwiWriteMemo_(f, res.text, docRef);
      written.push(id);
      nwiSetList_('VOICE_WRITTEN', written.slice(-300));
    }
    var desc = 'Transcribed ' + nwiFmt_(new Date(), "yyyy-MM-dd HH:mm z") + ' with ' + nwiCfg_('VERTEX_MODEL') + ' on Vertex AI (' + nwiCfg_('VERTEX_REGION') + ', project ' + nwiCfg_('GCP_PROJECT') + '). Text is in the Google Doc "' + NWI_TRANSCRIPTS_TITLE + '".';
    f.file.setDescription(desc);
    f.file.moveTo(folders.done);
    used.minutes += res.minutes;
    nwiSet_('VOICE_USED', JSON.stringify(used));
    delete fails[id];
    nwiSet_('VOICE_FAILS', JSON.stringify(fails));
    nwiLog_(f.name, res.minutes, res.inTok, res.outTok, 'done');
    return 'done';
  } catch (e) {
    var n = ((fails[id] && fails[id].n) || 0) + 1;
    var msg = String(e && e.message || e).slice(0, 400);
    if (n >= NWI_MAX_TRIES) {
      nwiToProblem_(f, folders, 'Failed ' + n + ' times. Last error: ' + msg);
      delete fails[id];
      nwiLog_(f.name, '', '', '', 'problem after ' + n + ' tries: ' + msg);
    } else {
      fails[id] = { n: n, err: msg };
      nwiLog_(f.name, '', '', '', 'failed, try ' + n + ' of ' + NWI_MAX_TRIES + ': ' + msg);
    }
    nwiSet_('VOICE_FAILS', JSON.stringify(fails));
    return 'failed';
  }
}
function nwiToProblem_(f, folders, why) {
  f.file.setDescription(nwiFmt_(new Date(), 'yyyy-MM-dd HH:mm z') + ' — ' + why);
  f.file.moveTo(folders.problem);
}

// ── Transcription (Gemini on Vertex AI only) ──
function nwiTranscribe_(f) {
  var part, objName = null, bucket = nwiCfg_('BUCKET_NAME');
  if (f.size <= Number(nwiCfg_('INLINE_MAX_MB')) * 1024 * 1024) {
    part = { inlineData: { mimeType: f.mime, data: Utilities.base64Encode(f.file.getBlob().getBytes()) } };
  } else {
    objName = 'voice-' + f.id + '-' + Date.now() + '.' + (f.name.split('.').pop() || 'audio').toLowerCase();
    nwiGcsUpload_(f, bucket, objName);
    part = { fileData: { mimeType: f.mime, fileUri: 'gs://' + bucket + '/' + objName } };
  }
  try {
    var out = nwiVertex_(part);
    out.minutes = out.audioTokens ? out.audioTokens / 32 / 60 : f.size / (Number(nwiCfg_('AUDIO_KBPS_ESTIMATE')) * 125) / 60; // audio = 32 tokens per second
    return out;
  } finally {
    if (objName) { try { UrlFetchApp.fetch('https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(objName), { method: 'delete', headers: { Authorization: 'Bearer ' + nwiToken_() }, muteHttpExceptions: true }); } catch (e) { /* the 1-day rule removes it */ } }
  }
}
function nwiVertexUrl_() {
  var p = nwiCfg_('GCP_PROJECT'), r = nwiCfg_('VERTEX_REGION'), m = nwiCfg_('VERTEX_MODEL');
  var host = r === 'global' ? 'aiplatform.googleapis.com' : r + '-aiplatform.googleapis.com';
  return 'https://' + host + '/v1/projects/' + p + '/locations/' + r + '/publishers/google/models/' + m + ':generateContent';
}
function nwiVertex_(part) {
  var body = { contents: [{ role: 'user', parts: [part, { text: NWI_PROMPT }] }], generationConfig: { temperature: 0, maxOutputTokens: 65535 } };
  var resp = UrlFetchApp.fetch(nwiVertexUrl_(), { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + nwiToken_() }, payload: JSON.stringify(body), muteHttpExceptions: true });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) throw new Error('Vertex AI answered ' + code + ': ' + text.slice(0, 300));
  var j = JSON.parse(text), cand = (j.candidates || [])[0];
  if (!cand) throw new Error('Vertex AI returned no transcript' + (j.promptFeedback ? ': ' + JSON.stringify(j.promptFeedback).slice(0, 200) : ''));
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('The transcript was cut off (output limit). Nothing was written.');
  var out = ((cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('').trim();
  if (!out) throw new Error('Vertex AI returned an empty transcript (finish: ' + cand.finishReason + ')');
  var u = j.usageMetadata || {}, audio = 0;
  (u.promptTokensDetails || []).forEach(function (d) { if (d.modality === 'AUDIO') audio += d.tokenCount || 0; });
  return { text: out, inTok: u.promptTokenCount || '', outTok: u.candidatesTokenCount || '', audioTokens: audio };
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
  if (id) return DocumentApp.openById(id);
  var me = Session.getEffectiveUser().getEmail(), it = DriveApp.getFilesByName(NWI_TRANSCRIPTS_TITLE);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() === 'application/vnd.google-apps.document' && f.getOwner() && f.getOwner().getEmail() === me) return DocumentApp.openById(f.getId());
  }
  throw new Error('No Google Doc named "' + NWI_TRANSCRIPTS_TITLE + '" owned by you was found. Set TRANSCRIPTS_DOC_ID.');
}
function nwiRollingDoc_() {
  var id = nwiProp_('ROLLING_DOC_ID');
  if (id) { try { return DocumentApp.openById(id); } catch (e) { /* made again below */ } }
  var doc = DocumentApp.create(NWI_ROLLING_TITLE);
  try { DriveApp.getFileById(doc.getId()).moveTo(nwiVoiceFolders_().inbox); } catch (e) { /* stays in My Drive */ }
  nwiSet_('ROLLING_DOC_ID', doc.getId());
  return doc;
}
function nwiWriteMemo_(f, text, docRef) {
  var when = f.recorded;
  var lines = ['(voice memo, ' + nwiFmt_(when, 'h:mm a') + ', auto-transcribed from ' + f.name + ')'];
  text.split(/\n+/).forEach(function (l) { l = l.trim(); if (l) lines.push(l); });
  var heading = nwiFmt_(when, 'EEE, MMM d, yyyy');
  nwiInsertEntry_(docRef, heading, lines); // his doc: if this throws, the file is retried
  try {
    var rolling = nwiRollingDoc_();
    nwiInsertEntry_(rolling, heading, lines);
    nwiTrimRolling_(rolling);
  } catch (e) { nwiLog_(f.name, '', '', '', 'rolling doc not updated: ' + e.message); }
}

function nwiIsH1_(p) { return p.getHeading() === DocumentApp.ParagraphHeading.HEADING1; }

// Adds lines under the date heading. Never reads, edits or moves any existing text.
function nwiInsertEntry_(doc, heading, lines) {
  var body = doc.getBody(), paras = body.getParagraphs(), first = null, i;
  for (i = 0; i < paras.length; i++) if (nwiIsH1_(paras[i])) { first = paras[i]; break; }
  var normalRef = null;
  if (first) for (var j = i + 1; j < paras.length; j++) if (!nwiIsH1_(paras[j]) && paras[j].getText().trim()) { normalRef = paras[j]; break; }
  function styleNormal(p) {
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    if (normalRef) { try { p.setAttributes(normalRef.getAttributes()); } catch (e) { /* keep defaults */ } }
  }
  if (!first) { // no Heading 1: append the heading and the entry at the end
    var onlyEmpty = paras.length === 1 && !paras[0].getText() && body.getNumChildren() === 1;
    var h;
    if (onlyEmpty) { h = paras[0]; h.setText(heading); } else h = body.appendParagraph(heading);
    h.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    lines.forEach(function (l) { styleNormal(body.appendParagraph(l)); });
    return;
  }
  var at = body.getChildIndex(first);
  if (first.getText().trim() !== heading) { // new date: a Heading 1 in the same style directly above the first one
    var nh = body.insertParagraph(at, heading);
    nh.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    try { nh.setAttributes(first.getAttributes()); } catch (e) { /* keep defaults */ }
    nh.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  } // same date: add under the existing heading
  var idx = at + 1;
  lines.forEach(function (l) { styleNormal(body.insertParagraph(idx++, l)); });
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
