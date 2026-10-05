// Nikhil's World — automatic backup to Google Drive (Google Apps Script).
//
// Runs on a timer under Nikhil's own Google account and holds no keys or secrets: it signs in to Firestore
// and Drive as that account (ScriptApp.getOAuthToken()). Setup, in plain steps: docs/DRIVE-AUTO-BACKUP.md.
//
// Each run (runBackup):
//  1. Lists the appdata collection with a field mask (only updatedAt), so a run where nothing changed
//     downloads almost nothing and writes nothing.
//  2. Only when something changed: reads every doc over the Firestore REST API and builds the same
//     backup file as the app's "Sync to Drive" (format 3: one entry per key, each value exactly what the
//     app's window.storage.getAll returns — nwMergeDocs below).
//  3. Uploads it to the "Nikhil's World Backups" folder (the oldest one if there are several), named
//     nikhil-world-backup-<date>-<zone label>.json in the time zone of the device Nikhil last opened the
//     app on (the device-timezone doc; America/Anchorage if it doesn't exist).
//  4. Checks Drive has exactly that content (md5 and size), and only then moves older files with exactly
//     the same name to Drive's trash.
// It never writes to Firestore, and never deletes or trashes anything in Drive except an older copy with
// exactly the same file name, after the new one is confirmed. Folders are never deleted.

const PROJECT_ID = 'nikhils-world';            // the projectId in index.html's firebaseConfig
const INTERVAL_MINUTES = 15;                   // how often the timer runs (Apps Script allows 1, 5, 10, 15 or 30)
const FOLDER_NAME = "Nikhil's World Backups";
const DEFAULT_ZONE = 'America/Anchorage';      // when the device-timezone doc doesn't exist
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/appdata';
const UTC_NAMED = /^nikhil-world-backup-\d{4}-\d{2}-\d{2}(-this-device)?\.json$/; // old backups: never touched

// ── Entry points ─────────────────────────────────────────────────

// One backup now. Safe to run any time; writes nothing if nothing changed since the last backup.
function runBackup() {
  const token = ScriptApp.getOAuthToken();
  const props = PropertiesService.getScriptProperties();
  const light = listDocs_(token, true);
  const signature = digestHex_(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(
    light.map(d => [d.id, d.updateTime || '', d.fields.updatedAt || '']).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))));
  if (props.getProperty('lastSignature') === signature) {
    console.log('No changes since the last backup (' + light.length + ' docs). Nothing written.');
    return { changed: false };
  }
  const docs = listDocs_(token, false);
  const merged = nwMergeDocs(docs);
  const zoneDoc = docs.find(d => d.id === 'device-timezone');
  let zone = DEFAULT_ZONE;
  if (zoneDoc && typeof zoneDoc.fields.value === 'string') {
    try { const z = JSON.parse(zoneDoc.fields.value).zone; if (isZone_(z)) zone = z; } catch (_) {}
  }
  const now = new Date();
  const z = zoneInfo_(now, zone);
  const backup = { format: 3, timestamp: now.toISOString(), source: 'apps-script', zone: z.zone, label: z.label, offset: z.offset, count: merged.entries.length, entries: merged.entries };
  if (merged.conflictCopies.length) backup.conflictCopies = merged.conflictCopies;
  if (merged.unreadable.length) backup.unreadable = merged.unreadable;
  const content = JSON.stringify(backup, null, 2);
  const name = 'nikhil-world-backup-' + z.date + '-' + z.label + '.json';
  const result = uploadConfirmTrash_(token, name, content);
  props.setProperty('lastSignature', signature);
  console.log('Backed up ' + backup.count + ' keys to "' + FOLDER_NAME + '/' + name + '"' + (result.trashed.length ? '; moved ' + result.trashed.length + ' older copy(ies) with the same name to the trash.' : '.'));
  return { changed: true, name: name, fileId: result.fileId, trashed: result.trashed };
}

// Installs the timer once. Running it again never adds a second one.
function setupTrigger() {
  const mine = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runBackup');
  if (mine.length) {
    mine.slice(1).forEach(t => ScriptApp.deleteTrigger(t)); // an extra copy from before, if any
    console.log('The timer was already set up. Triggers for runBackup: 1.');
    return 1;
  }
  ScriptApp.newTrigger('runBackup').timeBased().everyMinutes(INTERVAL_MINUTES).create();
  console.log('Timer set up: runBackup every ' + INTERVAL_MINUTES + ' minutes.');
  return 1;
}

// ── Firestore (read only) ────────────────────────────────────────

// Every doc in appdata: [{ id, fields (plain values), updateTime }]. light: only the updatedAt field.
function listDocs_(token, light) {
  const out = [];
  let pageToken = '';
  do {
    const url = FIRESTORE + '?pageSize=300' + (light ? '&mask.fieldPaths=updatedAt' : '') + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const r = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, 'x-goog-user-project': PROJECT_ID } });
    const code = r.getResponseCode();
    if (code !== 200) throw new Error('Firestore said ' + code + ': ' + r.getContentText().slice(0, 500));
    const body = JSON.parse(r.getContentText() || '{}');
    (body.documents || []).forEach(d => {
      const fields = {};
      Object.keys(d.fields || {}).forEach(k => { fields[k] = plain_(d.fields[k]); });
      out.push({ id: decodeURIComponent(d.name.split('/').pop()), fields: fields, updateTime: d.updateTime || null });
    });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return out;
}

// A Firestore REST value as a plain value (timestamps as ISO strings, like the app's backups).
function plain_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue).toISOString();
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain_);
  if ('mapValue' in v) { const o = {}; Object.keys(v.mapValue.fields || {}).forEach(k => { o[k] = plain_(v.mapValue.fields[k]); }); return o; }
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}

// ── The merge: must give exactly what the app's window.storage.getAll gives ──
// scripts/storage-test.js feeds the same docs to this function and to the app and checks every key.
// Rules (docs/DATA-FORMAT.md): split values are joined from their pieces; a key's sealed parts (and, for
// kaizen4:logs, the old Kaizen archives) are merged with its active doc; deleted markers in the active doc
// of a key in SEALED_LOG_KEYS hide items in its parts.

const SEALED_LOG_KEYS = ['kaizen4:logs'];
const LEGACY_PARTS = { 'kaizen4:logs': { ids: ['kaizen3_logs'], prefixes: ['kaizen3_logs_archive_', 'kaizen4_logs_archive_'] } };
const DATE_KEY = /^\d{4}[-_]\d{2}[-_]\d{2}/;

function nwSanitiseKey(key) { return key.replace(/[:/.#$[\]]/g, '_'); }
function nwIsInternalId(id) { return /__part_\d+$|__split_|__conflict_/.test(id); }
function nwIsLegacyPartId(id) { return id === 'kaizen3_logs' || /^kaizen[34]_logs_archive_/.test(id); }
function nwNotAKey(id, f) { return nwIsInternalId(id) || nwIsLegacyPartId(id) || !!(f && (f.sealed || f.splitOf || f.conflictOf)); }
function nwParse(s) { try { return JSON.parse(s); } catch (_) { return undefined; } }
function nwShapeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v && typeof v === 'object') {
    if (Array.isArray(v.entries)) return 'entries';
    const ks = Object.keys(v);
    if (ks.length && ks.every(k => DATE_KEY.test(k))) return 'dated';
  }
  return null;
}
function nwItemsOf(shape, v) { return shape === 'array' ? v : v.entries; }
function nwIdOf(it) { return it && typeof it === 'object' && (typeof it.id === 'string' || typeof it.id === 'number') ? String(it.id) : null; }
// cyrb53, identical to hashOf in index.html: names an item with no id in a deleted marker.
function nwHashOf(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// One doc's value, with split pieces joined. Throws if a piece is missing.
function nwAssemble(byId, id, f) {
  const sp = f && f.split;
  if (!sp) return f ? f.value : null;
  const ids = Array.isArray(sp.pieces) ? sp.pieces : [];
  if (!ids.length || ids.length !== sp.count) throw new Error(id + ' lists ' + ids.length + ' of ' + sp.count + ' pieces');
  return ids.map((pid, i) => {
    const d = byId[pid];
    if (!d || d.splitOf !== id || d.gen !== sp.gen || d.index !== i || typeof d.value !== 'string') throw new Error('piece ' + (i + 1) + ' of ' + ids.length + ' of ' + id + ' is missing');
    return d.value;
  }).join('');
}

function nwVisibleParts(parts, marks) {
  const dates = {}, ids = {}, pos = {};
  let any = false;
  (marks || []).forEach(m => {
    if (!m || typeof m !== 'object') return;
    if (typeof m.date === 'string') { dates[m.date] = true; any = true; }
    else if (m.id !== undefined && m.id !== null) { ids[String(m.id)] = true; any = true; }
    else if (typeof m.part === 'string' && typeof m.index === 'number') { pos[m.part + '#' + m.index] = String(m.hash); any = true; }
  });
  if (!any) return parts;
  return parts.map(p => {
    if (!p.parsed || typeof p.parsed !== 'object') return p;
    if (p.shape === 'dated' || p.shape === 'empty') {
      const o = {};
      Object.keys(p.parsed).forEach(k => { if (!dates[k]) o[k] = p.parsed[k]; });
      return Object.assign({}, p, { parsed: o });
    }
    if (p.shape === 'array' || p.shape === 'entries') {
      const items = nwItemsOf(p.shape, p.parsed).filter((it, i) => {
        const iid = nwIdOf(it);
        if (iid !== null && ids[iid]) return false;
        const want = pos[p.id + '#' + i];
        return !(want !== undefined && want === nwHashOf(JSON.stringify(it)));
      });
      return Object.assign({}, p, { parsed: p.shape === 'array' ? items : Object.assign({}, p.parsed, { entries: items }) });
    }
    return p;
  });
}

function nwMerge(shape, parts, active, order) {
  const ps = parts.filter(p => p.shape === shape);
  if (shape === 'dated') {
    const all = {};
    ps.forEach(p => Object.assign(all, p.parsed));
    if (active) Object.assign(all, active);
    const o = {};
    Object.keys(all).sort().forEach(k => { o[k] = all[k]; });
    return o;
  }
  const chron = [];
  const add = (items) => (order === 'newest-first' ? items.slice().reverse() : items).forEach(it => chron.push(it));
  ps.forEach(p => add(nwItemsOf(shape, p.parsed)));
  if (active) add(nwItemsOf(shape, active));
  const pos = {}, out = [];
  chron.forEach(it => {
    const iid = nwIdOf(it);
    const k = iid !== null ? 'id:' + iid : null;
    if (k && k in pos) { out[pos[k]] = it; return; }
    if (k) pos[k] = out.length;
    out.push(it);
  });
  if (order === 'newest-first') out.reverse();
  return shape === 'array' ? out : Object.assign({}, active || {}, { entries: out });
}

// A key's whole value (a string), as getAll returns it. null if it has none.
function nwValueOfKey(byId, ids, key) {
  const id = nwSanitiseKey(key);
  const f = byId[id] || null;
  const value = nwAssemble(byId, id, f);
  if (f && f.folding) return value;
  const listed = (f && Array.isArray(f.parts) ? f.parts : []).filter(p => p && typeof p.id === 'string')
    .slice().sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));
  const legacy = LEGACY_PARTS[key];
  if (!listed.length && !legacy) return value;
  const partIds = [];
  if (legacy) {
    const found = [];
    legacy.ids.forEach(lid => { if (byId[lid]) found.push(lid); });
    legacy.prefixes.forEach(pre => ids.filter(x => x.indexOf(pre) === 0 && !byId[x].splitOf && !nwIsInternalId(x)).sort().forEach(x => found.push(x)));
    found.sort().forEach(x => partIds.push(x));
  }
  listed.forEach(p => {
    if (!byId[p.id]) throw new Error('sealed part ' + p.id + ' is missing');
    partIds.push(p.id);
  });
  const parts = partIds.map(pid => {
    const pf = byId[pid];
    const parsed = nwParse(nwAssemble(byId, pid, pf));
    if (parsed === undefined) throw new Error('sealed part ' + pid + ' is not valid JSON');
    const empty = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !Object.keys(parsed).length;
    return { id: pid, parsed: parsed, shape: nwShapeOf(parsed) || (empty ? 'empty' : null), order: pf.order || null };
  });
  if (!parts.length) return value;
  const active = value !== null && value !== undefined ? nwParse(value) : null;
  const firstShape = (parts.find(p => p.shape && p.shape !== 'empty') || {}).shape;
  const shape = (active != null && nwShapeOf(active)) || (f && f.shape) || firstShape;
  if (!shape || shape === 'empty') return value;
  const isEmptyObj = (v) => v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length;
  if (active === undefined || (active != null && nwShapeOf(active) !== shape && !(isEmptyObj(active) && shape === 'dated'))) return value;
  const order = (f && f.order) || (parts.find(p => p.shape === shape && p.order) || {}).order || 'oldest-first';
  const marks = SEALED_LOG_KEYS.indexOf(key) >= 0 && f && Array.isArray(f.deleted) ? f.deleted : [];
  return JSON.stringify(nwMerge(shape, nwVisibleParts(parts, marks), active, order));
}

function nwAsValue(s) {
  if (typeof s !== 'string') return { value: s === undefined ? null : s };
  try { return { value: JSON.parse(s) }; } catch (_) { return { value: s, text: true }; }
}

// docs: [{ id, fields }] with plain values. Returns { entries, conflictCopies, unreadable } exactly as the
// app's backup builds them.
function nwMergeDocs(docs) {
  const byId = {};
  docs.forEach(d => { if (d && typeof d.id === 'string') byId[d.id] = d.fields || {}; });
  const ids = Object.keys(byId).sort();
  const keys = {};
  ids.forEach(id => {
    const f = byId[id];
    if (nwNotAKey(id, f)) return;
    keys[typeof f.key === 'string' && nwSanitiseKey(f.key) === id ? f.key : id] = f;
  });
  if (ids.some(nwIsLegacyPartId) && !keys['kaizen4:logs']) keys['kaizen4:logs'] = {};
  const entries = [], unreadable = [];
  Object.keys(keys).sort().forEach(k => {
    const f = keys[k];
    try {
      const v = nwValueOfKey(byId, ids, k);
      if (v === null || v === undefined) return;
      entries.push(Object.assign({ key: k }, nwAsValue(v), { updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : null }));
    } catch (e) {
      const id = nwSanitiseKey(k);
      unreadable.push({ key: k, reason: String(e && e.message || e), docs: ids.filter(x => x === id || x.indexOf(id + '__') === 0).map(x => ({ id: x, fields: byId[x] })) });
    }
  });
  const conflictCopies = [];
  ids.filter(id => byId[id].conflictOf || /__conflict_/.test(id)).forEach(id => {
    const f = byId[id];
    const base = { id: id, key: f.key === undefined ? null : f.key, conflictOf: f.conflictOf === undefined ? null : f.conflictOf,
      deviceSavedAt: f.deviceSavedAt === undefined ? null : f.deviceSavedAt, cloudUpdatedAt: f.cloudUpdatedAt === undefined ? null : f.cloudUpdatedAt,
      savedAt: f.savedAt === undefined ? null : f.savedAt };
    if (f.split) conflictCopies.push(Object.assign(base, { docs: ids.filter(x => x === id || byId[x].splitOf === id).map(x => ({ id: x, fields: byId[x] })) }));
    else conflictCopies.push(Object.assign(base, nwAsValue(f.value)));
  });
  return { entries: entries, conflictCopies: conflictCopies, unreadable: unreadable };
}

// ── Time zones (the same list and rules as index.html) ───────────

const NW_ZONE_NAMES = {
  'America/Anchorage': ['AKST', 'AKDT'], 'America/Juneau': ['AKST', 'AKDT'], 'America/Sitka': ['AKST', 'AKDT'],
  'America/Nome': ['AKST', 'AKDT'], 'America/Yakutat': ['AKST', 'AKDT'], 'America/Adak': ['HST', 'HDT'], 'Pacific/Honolulu': ['HST', 'HST'],
  'America/Los_Angeles': ['PST', 'PDT'], 'America/Vancouver': ['PST', 'PDT'], 'America/Denver': ['MST', 'MDT'],
  'America/Edmonton': ['MST', 'MDT'], 'America/Boise': ['MST', 'MDT'], 'America/Phoenix': ['MST', 'MST'],
  'America/Chicago': ['CST', 'CDT'], 'America/Winnipeg': ['CST', 'CDT'], 'America/New_York': ['EST', 'EDT'],
  'America/Toronto': ['EST', 'EDT'], 'America/Detroit': ['EST', 'EDT'], 'America/Halifax': ['AST', 'ADT'],
  'Europe/London': ['GMT', 'BST'], 'Europe/Paris': ['CET', 'CEST'], 'Europe/Berlin': ['CET', 'CEST'],
  'Europe/Madrid': ['CET', 'CEST'], 'Europe/Rome': ['CET', 'CEST'], 'Europe/Amsterdam': ['CET', 'CEST'],
  'Europe/Zurich': ['CET', 'CEST'], 'Europe/Vienna': ['CET', 'CEST'], 'Europe/Brussels': ['CET', 'CEST'],
  'Europe/Stockholm': ['CET', 'CEST'], 'Europe/Oslo': ['CET', 'CEST'], 'Europe/Copenhagen': ['CET', 'CEST'],
  'Europe/Prague': ['CET', 'CEST'], 'Europe/Warsaw': ['CET', 'CEST'], 'Europe/Athens': ['EET', 'EEST'],
  'Europe/Helsinki': ['EET', 'EEST'], 'Europe/Bucharest': ['EET', 'EEST'], 'Europe/Kyiv': ['EET', 'EEST'],
  'Asia/Kolkata': ['IST', 'IST'], 'Asia/Calcutta': ['IST', 'IST'], 'Asia/Dubai': ['GST', 'GST'],
  'Asia/Singapore': ['SGT', 'SGT'], 'Asia/Hong_Kong': ['HKT', 'HKT'], 'Asia/Tokyo': ['JST', 'JST'], 'Asia/Seoul': ['KST', 'KST'],
  'Australia/Sydney': ['AEST', 'AEDT'], 'Australia/Melbourne': ['AEST', 'AEDT'], 'Australia/Brisbane': ['AEST', 'AEST'],
  'Australia/Adelaide': ['ACST', 'ACDT'], 'Australia/Perth': ['AWST', 'AWST'], 'Pacific/Auckland': ['NZST', 'NZDT'],
  'UTC': ['UTC', 'UTC'], 'Etc/UTC': ['UTC', 'UTC'],
};
function isZone_(z) { return typeof z === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(z); }
// Minutes east of UTC from Utilities.formatDate's "Z" ("-0800", "+0530").
function offsetMin_(date, zone) {
  const z = Utilities.formatDate(date, zone, 'Z');
  const m = /^([+-])(\d\d)(\d\d)$/.exec(z);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}
function zoneInfo_(date, zone) {
  const offsetMin = offsetMin_(date, zone);
  const y = Number(Utilities.formatDate(date, 'UTC', 'yyyy'));
  const std = Math.min(offsetMin_(new Date(Date.UTC(y, 0, 1)), zone), offsetMin_(new Date(Date.UTC(y, 6, 1)), zone));
  const a = Math.abs(offsetMin);
  const offset = (offsetMin < 0 ? '-' : '+') + ('0' + Math.floor(a / 60)).slice(-2) + ':' + ('0' + (a % 60)).slice(-2);
  const named = NW_ZONE_NAMES[zone];
  const short = Utilities.formatDate(date, zone, 'z');
  const label = named ? named[offsetMin > std ? 1 : 0]
    : (/^[A-Z]{2,5}$/.test(short) && short !== 'GMT') ? short
    : offsetMin === 0 ? 'UTC' : 'UTC' + (offsetMin < 0 ? '-' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + ('0' + (a % 60)).slice(-2) : '');
  return { zone: zone, date: Utilities.formatDate(date, zone, 'yyyy-MM-dd'), label: label, offset: offset };
}

// ── Drive: upload, confirm, then trash older copies with exactly the same name ──

function digestHex_(alg, text) {
  return Utilities.computeDigest(alg, text, Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function backupFolder_() {
  const found = [];
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) found.push(f); }
  if (!found.length) return DriveApp.createFolder(FOLDER_NAME);
  found.sort((a, b) => a.getDateCreated().getTime() - b.getDateCreated().getTime());
  return found[0]; // the oldest; the others are left as they are
}

function uploadConfirmTrash_(token, name, content) {
  const folder = backupFolder_();
  const blob = Utilities.newBlob(content, 'application/json', name);
  const bytes = blob.getBytes().length;
  const file = folder.createFile(blob);
  const id = file.getId();
  // Confirm: Drive's own md5Checksum and size for the new file must match what was sent.
  const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,name,size,md5Checksum',
    { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } });
  let meta = {};
  if (r.getResponseCode() === 200) meta = JSON.parse(r.getContentText() || '{}');
  const md5 = digestHex_(Utilities.DigestAlgorithm.MD5, content);
  const size = meta.size !== undefined ? Number(meta.size) : DriveApp.getFileById(id).getSize();
  const confirmed = (meta.name === undefined || meta.name === name) && size === bytes && (!meta.md5Checksum || meta.md5Checksum === md5);
  if (!confirmed) throw new Error('Drive\'s copy of ' + name + ' does not match what was sent (size ' + size + ' of ' + bytes + '). Older backups were left as they are.');
  const trashed = [];
  if (!UTC_NAMED.test(name)) {
    const same = folder.getFilesByName(name);
    while (same.hasNext()) {
      const f = same.next();
      if (f.getId() === id || f.getName() !== name || f.isTrashed()) continue;
      f.setTrashed(true);
      trashed.push(f.getId());
    }
  }
  return { fileId: id, trashed: trashed };
}
