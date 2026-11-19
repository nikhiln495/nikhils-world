// Asynchronous, authenticated Cloud Run Jobs bridge. No public worker endpoint/API key.
var NWI_CLOUD_PIPELINE = 'nw-cloud-v1';
function nwiCloudPreflight_() {
  ['WORKER_BUCKET', 'CLOUD_RUN_JOB', 'CLOUD_RUN_REGION'].forEach(function (key) {
    if (!nwiProp_(key)) throw new Error('Cloud worker not configured: missing ' + key + '. Do not restart the timer until deployment completes.');
  });
  if (nwiProp_('WORKER_BUCKET') === nwiCfg_('BUCKET_NAME')) throw new Error('Use the dedicated worker bucket, not the one-day temporary bucket.');
}
function nwiCloudFetch_(url, options, allowMissing) {
  options = options || {};
  options.headers = { Authorization: 'Bearer ' + nwiToken_() };
  options.muteHttpExceptions = true;
  var response = UrlFetchApp.fetch(url, options), code = response.getResponseCode();
  if (allowMissing && code === 404) return null;
  if (code < 200 || code >= 300) throw new Error('Cloud worker HTTP ' + code + ': ' + response.getContentText().slice(0, 250));
  var text = response.getContentText();
  return text ? JSON.parse(text) : {};
}
function nwiCloudObjectUrl_(key, media) {
  return 'https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(nwiProp_('WORKER_BUCKET')) + '/o/' + encodeURIComponent(key) + (media ? '?alt=media' : '');
}
function nwiCloudRead_(key) { return nwiCloudFetch_(nwiCloudObjectUrl_(key, true), {}, true); }
function nwiCloudWrite_(key, value) {
  return nwiCloudFetch_('https://storage.googleapis.com/upload/storage/v1/b/' + encodeURIComponent(nwiProp_('WORKER_BUCKET')) + '/o?uploadType=media&name=' + encodeURIComponent(key), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(value)
  });
}
function nwiCloudKey_(f) {
  var raw = [NWI_CLOUD_PIPELINE, nwiCfg_('VERTEX_MODEL'), f.id, f.size, f.file.getLastUpdated().getTime()].join(':');
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function nwiCloudStart_(state, prop) {
  state.phase = 'starting';
  state.submittedAt = Date.now();
  state.launches = (state.launches || 0) + 1;
  nwiSet_(prop, JSON.stringify(state)); // an interrupted HTTP request may still start a job
  var url = 'https://run.googleapis.com/v2/projects/' + encodeURIComponent(nwiCfg_('GCP_PROJECT')) + '/locations/' + encodeURIComponent(nwiProp_('CLOUD_RUN_REGION')) + '/jobs/' + encodeURIComponent(nwiProp_('CLOUD_RUN_JOB')) + ':run';
  var operation = nwiCloudFetch_(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({
    overrides: { containerOverrides: [{ env: [{ name: 'JOB_KEY', value: state.key }] }] }
  }) });
  state.phase = 'waiting';
  state.operation = operation.name || '';
  nwiSet_(prop, JSON.stringify(state));
}
function nwiCloudHold_(f, folders, prop, state, reason) {
  state.phase = 'held'; state.reason = reason;
  nwiSet_(prop, JSON.stringify(state));
  nwiToProblem_(f, folders, reason + ' Original retained; worker checkpoints retained temporarily.');
  nwiLog_(f.name, '', '', '', 'cloud worker held: ' + reason);
  return 'problem';
}
function nwiCloudFinalize_(f, folders, state, prop, skipped) {
  var history = nwiVoiceWritten_();
  if (history.indexOf(f.id) < 0) { history.push(f.id); nwiSetList_('VOICE_WRITTEN', history.slice(-300)); }
  f.file.setDescription((f.keepInPlace ? 'NW Inbox processed: ' : '') + (skipped
    ? 'Skipped: under 3 seconds or no intelligible speech. Nothing was written. Source retained.'
    : 'Automatic draft saved by cloud worker. All decoded intervals processed; words/speakers unverified. Source retained.'));
  if (!f.keepInPlace) f.file.moveTo(folders.done);
  PropertiesService.getScriptProperties().deleteProperty(prop);
  nwiLog_(f.name, state.duration_seconds ? state.duration_seconds / 60 : '', '', '', skipped
    ? 'skipped: under 3 seconds or no intelligible speech; nothing written'
    : 'cloud draft saved — audio intervals processed; speech accuracy unverified');
  return skipped ? 'skipped' : 'done';
}
// Poll pending jobs even when the recursive scan is visiting a different folder.
function nwiCloudPendingFiles_(files) {
  var seen = {}, props = PropertiesService.getScriptProperties().getProperties();
  files.forEach(function (f) { seen[f.id] = true; });
  Object.keys(props).forEach(function (key) {
    if (key.indexOf('NWI_CLOUD_') !== 0) return;
    var state;
    try { state = JSON.parse(props[key]); } catch (e) { return; }
    var id = key.slice('NWI_CLOUD_'.length);
    if (state.phase === 'held' || seen[id]) return;
    try {
      var file = DriveApp.getFileById(id);
      if (file.isTrashed()) throw new Error('Source is in Trash');
      files.push({ file: file, id: id, name: state.name || file.getName(), size: state.size,
        mime: file.getMimeType(), keepInPlace: !!state.keepInPlace,
        recorded: state.recorded ? new Date(state.recorded) : file.getLastUpdated() });
      seen[id] = true;
    } catch (e) {
      state.phase = 'held'; state.reason = 'Source unavailable; retained worker result requires review.';
      nwiSet_(key, JSON.stringify(state));
      nwiLog_(state.name || id, '', '', '', 'pending source unavailable: ' + e.message);
    }
  });
  return files;
}

function nwiCloudVoiceOne_(f, folders, docRef) {
  nwiCloudPreflight_();
  var prop = 'NWI_CLOUD_' + f.id, state = nwiJson_(prop, null);
  var block = nwiSavedMemoBlock_(docRef, f.id);
  if (block || nwiVoiceWritten_().indexOf(f.id) >= 0) {
    if (block) nwiStoreMemoBlock_(f, block, docRef);
    return nwiCloudFinalize_(f, folders, state || {}, prop);
  }
  if (state && state.phase === 'held') return 'problem';
  if (!state) {
    var active = PropertiesService.getScriptProperties().getProperties();
    var pending = Object.keys(active).filter(function (key) {
      if (key.indexOf('NWI_CLOUD_') !== 0) return false;
      try { return JSON.parse(active[key]).phase !== 'held'; } catch (e) { return false; }
    }).length;
    if (pending >= 2) return 'pending'; // keep cloud work bounded; existing jobs are still polled
    var cap = Number(nwiCfg_('DAILY_CAP_MINUTES')), kbps = Number(nwiCfg_('AUDIO_KBPS_ESTIMATE'));
    if (!(cap > 0) || !isFinite(cap) || !(kbps > 0) || !isFinite(kbps)) throw new Error('Invalid daily allowance/bitrate estimate');
    var est = f.size / (kbps * 125) / 60, day = nwiFmt_(new Date(), 'yyyy-MM-dd');
    var used = nwiJson_('VOICE_USED', {});
    if (used.day !== day) used = { day: day, minutes: 0 };
    if (f.size <= 0 || f.size > 500 * 1024 * 1024 || est > cap) {
      return nwiCloudHold_(f, folders, prop, {}, 'Input exceeds size or estimated daily allowance; review before retrying.');
    }
    if (used.minutes + est > cap) { nwiLog_(f.name, est, '', '', 'waiting: daily submission allowance'); return 'cap'; }
    // Reserve once per source. Chunk retries have a separate persisted maximum of 3.
    used.minutes += est;
    nwiSet_('VOICE_USED', JSON.stringify(used));
    state = { key: nwiCloudKey_(f), phase: 'uploading', size: f.size, attempts: 0, reservedMinutes: est, reservedDay: day,
      name: f.name, recorded: (f.recorded || new Date()).toISOString(), keepInPlace: !!f.keepInPlace };
    nwiSet_(prop, JSON.stringify(state));
  }
  var prefix = 'jobs/' + state.key;
  if (state.phase === 'uploading') {
    if (state.attempts >= 3) return nwiCloudHold_(f, folders, prop, state, 'Audio upload did not complete after three attempts.');
    state.attempts++;
    nwiSet_(prop, JSON.stringify(state));
    var metadata = nwiCloudFetch_(nwiCloudObjectUrl_(prefix + '/source', false), {}, true);
    if (!metadata || Number(metadata.size) !== state.size) {
      nwiGcsUpload_(f, nwiProp_('WORKER_BUCKET'), prefix + '/source');
      metadata = nwiCloudFetch_(nwiCloudObjectUrl_(prefix + '/source', false));
    }
    state.source_generation = metadata.generation;
    nwiCloudWrite_(prefix + '/request.json', { pipeline: NWI_CLOUD_PIPELINE, source_id: f.id, source_generation: metadata.generation, size: state.size, prompt: NWI_PROMPT });
    state.phase = 'ready';
    nwiSet_(prop, JSON.stringify(state));
  }
  if (state.phase === 'ready') {
    nwiCloudStart_(state, prop);
    nwiLog_(f.name, '', '', '', 'cloud worker queued; original retained until complete');
    return 'pending';
  }
  var result = nwiCloudRead_(prefix + '/result.json');
  if (!result) {
    if (Date.now() - state.submittedAt > 70 * 60000) {
      if (state.launches >= 2) return nwiCloudHold_(f, folders, prop, state, 'No completed result after two worker launches.');
      nwiCloudStart_(state, prop); // lease/checkpoints prevent overlapping work and redoing saved sections
    }
    return 'pending';
  }
  if (result.status !== 'complete') return nwiCloudHold_(f, folders, prop, state, result.error || 'Worker did not finish every section.');
  if (result.pipeline !== NWI_CLOUD_PIPELINE || result.source_id !== f.id || String(result.source_generation) !== String(state.source_generation) ||
      !result.intervals_verified || result.completed_sections !== result.expected_sections || !(result.completed_sections > 0)) {
    return nwiCloudHold_(f, folders, prop, state, 'Worker result does not match this source or has incomplete interval coverage.');
  }
  state.duration_seconds = result.duration_seconds;
  nwiSet_(prop, JSON.stringify(state));
  // Under 3 seconds, or no intelligible speech: nothing is written; the log sheet says so (Nov 15).
  if (nwiIsEmptyMemo_(result.text, result.duration_seconds)) return nwiCloudFinalize_(f, folders, state, prop, true);
  if (!result.text) return nwiCloudHold_(f, folders, prop, state, 'Worker result has no text.');
  nwiWriteMemo_(f, result.text, docRef, null, result.duration_seconds);
  return nwiCloudFinalize_(f, folders, state, prop);
}

// Run once before changing Voice.gs. Only this pipeline's timer is paused.
function pauseVoiceInbox() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runVoiceInbox') ScriptApp.deleteTrigger(trigger);
  });
  Logger.log('Voice timer paused. Existing recordings and transcripts are unchanged.');
}
// Run once after installing BOTH Voice.gs and CloudWorker.gs. Preserves history.
function installCloudInbox() {
  var expected = { VOICE_INBOX_FOLDER_ID: '1eK3WUc2Xzms-BryXZOnI4JPbZkJVmSVl', RECLY_ROOT_FOLDER_ID: '1b1150ALWKLMQssqBl-biUAZS4O7sA_7z' };
  Object.keys(expected).forEach(function (key) {
    var current = nwiProp_(key);
    if (current && current !== expected[key]) throw new Error(key + ' differs from the verified folder. Review before changing it.');
  });
  nwiSet_('WORKER_BUCKET', 'nikhils-world-nw-voice-worker-v1');
  nwiSet_('CLOUD_RUN_JOB', 'nw-voice-worker');
  nwiSet_('CLOUD_RUN_REGION', 'us-central1');
  Object.keys(expected).forEach(function (key) { nwiSet_(key, expected[key]); });
  if (!nwiProp_('VOICE_IMPORT_AFTER')) nwiSet_('VOICE_IMPORT_AFTER', '2026-11-12T03:29:00Z');
  // Set only when missing: a value he chose (e.g. ENABLE_FIREFLIES true) is never switched back off (Nov 15).
  if (nwiProp_('ENABLE_ACOUSTIC_NOTES') === null) nwiSet_('ENABLE_ACOUSTIC_NOTES', 'false');
  if (nwiProp_('ENABLE_FIREFLIES') === null) nwiSet_('ENABLE_FIREFLIES', 'false');
  checkVoiceInbox();
  nwiCloudFetch_('https://storage.googleapis.com/storage/v1/b/' + nwiProp_('WORKER_BUCKET'));
  nwiCloudFetch_('https://run.googleapis.com/v2/projects/' + nwiCfg_('GCP_PROJECT') + '/locations/' + nwiProp_('CLOUD_RUN_REGION') + '/jobs/' + nwiProp_('CLOUD_RUN_JOB'));
  setupInbox();
  Logger.log('Cloud worker connected. Both inputs enabled. One voice timer installed; originals retained.');
}
