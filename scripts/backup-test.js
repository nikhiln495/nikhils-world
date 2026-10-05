// Checks for backups: Drive sync never loses a backup (googleapis mocked), file names in the device's time zone,
// the device-timezone doc, and tools/drive-backup.gs (the Apps Script) run in a Node sandbox with every Google
// service mocked — its merge must match the app's window.storage.getAll for every key.
// The live Firestore and Google Drive are never touched.
// Run: NODE_PATH=$(npm root -g) node scripts/backup-test.js [1-4|all]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { openPage } = require('./p1-check');

let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const FOLDER = "Nikhil's World Backups";
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const KL = (h) => ({ brainDump: '', highlight: h, micro: '', done: [], reflection: '' });
const BASE = { kaizen3_projects: { key: 'kaizen3:projects', value: '[]' }, kaizen3_tasks: { key: 'kaizen3:tasks', value: '[]' }, kaizen3_seeded: { key: 'kaizen3:seeded', value: 'true' } };

// ── A fake Google Drive (files, folders, trash) answering the app's REST calls ──
function fakeDrive(files) {
  const state = { files, calls: [], uploadMode: 'ok', nextId: 1 };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-upload-content-type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'access-control-expose-headers': 'Location' };
  const json = (route, o, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
  const meta = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.content == null ? undefined : String(Buffer.byteLength(f.content)), md5Checksum: f.content == null ? undefined : md5(f.content), parents: f.parents });
  const handler = async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    state.calls.push({ m, path: url.pathname, q: url.searchParams.get('q') });
    if (m === 'DELETE') return json(route, {}, 204);
    if (m === 'GET' && url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') || '';
      const name = (/name='((?:[^'\\]|\\.)*)'/.exec(q) || [])[1];
      const unq = name && name.replace(/\\(.)/g, '$1');
      const parent = (/'([^']+)' in parents/.exec(q) || [])[1];
      let out = state.files.filter(f => !f.trashed && f.name === unq && (!/mimeType=/.test(q) || f.mimeType === FOLDER_MIME) && (!parent || (f.parents || []).includes(parent)));
      if (/orderBy=createdTime/.test(req.url())) out = out.slice().sort((a, b) => a.createdTime.localeCompare(b.createdTime));
      return json(route, { files: out.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, createdTime: f.createdTime })) });
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (one && m === 'GET') { const f = state.files.find(x => x.id === decodeURIComponent(one[1])); return f ? json(route, meta(f)) : json(route, { error: { code: 404 } }, 404); }
    if (one && m === 'PATCH') {
      const f = state.files.find(x => x.id === decodeURIComponent(one[1]));
      const body = JSON.parse(req.postData() || '{}');
      if (f && body.trashed === true) f.trashed = true;
      return json(route, f ? meta(f) : {});
    }
    if (m === 'POST' && url.pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart') {
      if (state.uploadMode === 'fail') return json(route, { error: { code: 500, message: 'Backend Error' } }, 500);
      const ct = req.headers()['content-type'] || '';
      const boundary = /boundary="?([^";]+)"?/.exec(ct)[1];
      const parts = req.postData().split('--' + boundary);
      const metaIn = JSON.parse(parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').trim());
      let content = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      if (state.uploadMode === 'short') content = content.slice(0, content.length - 10); // Drive kept only part of it
      const f = { id: 'NEW' + state.nextId++, name: metaIn.name, mimeType: 'application/json', parents: metaIn.parents, createdTime: '2026-10-05T00:00:00Z', content };
      state.files.push(f);
      return json(route, meta(f));
    }
    if (m === 'POST' && url.pathname === '/drive/v3/files') {
      const body = JSON.parse(req.postData() || '{}');
      const f = { id: 'FOLDER' + state.nextId++, name: body.name, mimeType: body.mimeType, parents: [], createdTime: '2026-10-05T00:00:00Z' };
      state.files.push(f);
      return json(route, meta(f));
    }
    return json(route, { error: { code: 404 } }, 404);
  };
  return { state, handler };
}
const driveFixture = () => [
  { id: 'F_OLD', name: FOLDER, mimeType: FOLDER_MIME, createdTime: '2025-01-01T00:00:00Z', parents: [] },
  { id: 'F_NEW', name: FOLDER, mimeType: FOLDER_MIME, createdTime: '2026-01-01T00:00:00Z', parents: [] },
  { id: 'OLD_SAME', name: 'nikhil-world-backup-2026-10-04-AKDT.json', mimeType: 'application/json', parents: ['F_OLD'], createdTime: '2026-10-04T10:00:00Z', content: '{"older":true}' },
  { id: 'UTC_A', name: 'nikhil-world-backup-2026-10-04.json', mimeType: 'application/json', parents: ['F_OLD'], createdTime: '2026-10-04T09:00:00Z', content: '{"utc":1}' },
  { id: 'UTC_B', name: 'nikhil-world-backup-2026-10-05.json', mimeType: 'application/json', parents: ['F_OLD'], createdTime: '2026-10-05T05:26:00Z', content: '{"utc":2}' },
  { id: 'OTHER', name: 'Therapy notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: ['F_OLD'], createdTime: '2026-09-01T00:00:00Z', content: 'notes' },
  { id: 'OTHER_LABEL', name: 'nikhil-world-backup-2026-10-04-IST.json', mimeType: 'application/json', parents: ['F_OLD'], createdTime: '2026-10-04T11:00:00Z', content: '{"ist":1}' },
  { id: 'IN_NEW_FOLDER', name: 'nikhil-world-backup-2026-10-04-AKDT.json', mimeType: 'application/json', parents: ['F_NEW'], createdTime: '2026-10-04T12:00:00Z', content: '{"other folder":1}' },
];

async function syncOnce(page, drive) {
  await page.evaluate(() => localStorage.setItem('gdrive_token_v1', JSON.stringify({ token: 'test-token', expiresAt: Date.now() + 3600 * 1000 })));
  const n = drive.state.calls.length;
  await page.getByRole('button', { name: /SYNC TO GOOGLE DRIVE/ }).click();
  await page.waitForFunction(() => /Synced to Drive|failed|❌/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  const text = await page.locator('body').innerText();
  return { text, calls: drive.state.calls.slice(n) };
}

// ── 1. Drive sync can't lose backups ──────────────────────────────
async function part1() {
  console.log('\n[1. Drive sync: upload, confirm, then trash only older copies with exactly the same name]');
  const drive = fakeDrive(driveFixture());
  const ctx = await openPage({ fakeFirestore: { ...BASE, test_note: { key: 'test:note', value: '"hello"' } }, now: '2026-10-04T21:26:00', timezoneId: 'America/Anchorage' });
  const { page } = ctx;
  await page.waitForTimeout(3000);
  await page.route('https://www.googleapis.com/**', drive.handler);
  await page.getByRole('button', { name: 'System', exact: true }).click();
  const byId = (id) => drive.state.files.find(f => f.id === id);

  drive.state.uploadMode = 'fail';
  let r = await syncOnce(page, drive);
  ok(/❌ Upload failed/.test(r.text) && !byId('OLD_SAME').trashed && !r.calls.some(c => c.m === 'PATCH' || c.m === 'DELETE'), 'a failed upload: an error is shown and the older same-name file is left in place (nothing trashed or deleted)');
  drive.state.uploadMode = 'short';
  await page.waitForTimeout(6500);
  r = await syncOnce(page, drive);
  const shortCopy = drive.state.files.find(f => /^NEW/.test(f.id));
  ok(/❌ Upload failed: Drive's copy doesn't match/.test(r.text) && !byId('OLD_SAME').trashed && shortCopy && !shortCopy.trashed && !r.calls.some(c => c.m === 'PATCH' || c.m === 'DELETE'), "an upload Drive didn't keep whole (md5 and size differ): nothing older is touched, and the bad copy itself isn't removed either → " + (r.text.match(/❌[^\n]*/) || [''])[0]);
  drive.state.uploadMode = 'ok';
  await page.waitForTimeout(6500);
  r = await syncOnce(page, drive);
  const fresh = drive.state.files.filter(f => /^NEW/.test(f.id) && !f.trashed);
  const good = fresh.find(f => f.name === 'nikhil-world-backup-2026-10-04-AKDT.json' && JSON.parse(f.content).format === 3);
  ok(/✅ Synced to Drive → "Nikhil's World Backups\/nikhil-world-backup-2026-10-04-AKDT\.json"/.test(r.text) && good && good.parents[0] === 'F_OLD', 'a confirmed upload at 9:26 PM AKDT on Oct 4 is named nikhil-world-backup-2026-10-04-AKDT.json (local date, not UTC) and goes to the oldest folder');
  ok(byId('OLD_SAME').trashed === true && r.calls.filter(c => c.m === 'PATCH').length >= 1, 'after the upload is confirmed, the older copy with exactly the same name is moved to the trash');
  const patchIdx = r.calls.findIndex(c => c.m === 'PATCH'), upIdx = r.calls.findIndex(c => c.m === 'POST' && /upload/.test(c.path));
  ok(upIdx >= 0 && patchIdx > upIdx, 'order: upload first, then the older copy');
  const untouched = ['F_OLD', 'F_NEW', 'UTC_A', 'UTC_B', 'OTHER', 'OTHER_LABEL', 'IN_NEW_FOLDER'].every(id => !byId(id).trashed);
  ok(untouched && !drive.state.calls.some(c => c.m === 'DELETE'), 'no folder is deleted or trashed (two folders with the same name: the oldest is used); no file with another name, no UTC-named backup and nothing in the other folder is touched; nothing is ever permanently deleted');
  const trashedIds = drive.state.files.filter(f => f.trashed).map(f => f.id).sort();
  ok(JSON.stringify(trashedIds) === JSON.stringify(['OLD_SAME', shortCopy.id].sort()) && drive.state.files.length === driveFixture().length + 2, 'only older copies with exactly that name went to the trash (the earlier copy and the bad partial one); every file is still in Drive');
  ok(ctx.errors.length === 0, '1: no console errors' + (ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''));
  await ctx.browser.close();

  console.log('\n[1. A time zone change on the same date keeps both files and deletes neither]');
  const ctx2 = await openPage({ fakeFirestore: { ...BASE, test_note: { key: 'test:note', value: '"hello"' } }, now: '2026-10-04T23:00:00', timezoneId: 'America/Los_Angeles' });
  await ctx2.page.waitForTimeout(3000);
  await ctx2.page.route('https://www.googleapis.com/**', drive.handler);
  await ctx2.page.getByRole('button', { name: 'System', exact: true }).click();
  const before = drive.state.files.filter(f => f.trashed).length;
  r = await syncOnce(ctx2.page, drive);
  const pdt = drive.state.files.find(f => f.name === 'nikhil-world-backup-2026-10-04-PDT.json' && !f.trashed);
  ok(/✅ Synced to Drive/.test(r.text) && pdt && good && !good.trashed && drive.state.files.filter(f => f.trashed).length === before, 'the same date in another zone writes nikhil-world-backup-2026-10-04-PDT.json; the AKDT file stays (neither is trashed)');
  await ctx2.browser.close();
}

// ── 2. File names in the device's time zone; the device-timezone doc ──
async function part2() {
  console.log("\n[2. Backup file names use this device's date and zone label]");
  const cases = [
    ['America/Anchorage', '2026-10-04T21:26:00', 'nikhil-world-backup-2026-10-04-AKDT.json', 'AKDT', '-08:00'],
    ['America/Anchorage', '2026-12-10T21:26:00', 'nikhil-world-backup-2026-12-10-AKST.json', 'AKST', '-09:00'],
    ['Asia/Kolkata', '2026-11-10T09:00:00', 'nikhil-world-backup-2026-11-10-IST.json', 'IST', '+05:30'],
    ['Asia/Kathmandu', '2026-11-10T09:00:00', 'nikhil-world-backup-2026-11-10-UTC+5:45.json', 'UTC+5:45', '+05:45'],
  ];
  for (const [tz, now, name, label, offset] of cases) {
    const ctx = await openPage({ seed: {}, now, timezoneId: tz });
    const z = await ctx.page.evaluate(() => ({ z: window.nwZoneInfo(), name: window.nwBackupFileName(window.nwZoneInfo()) }));
    ok(z.name === name && z.z.zone === tz && z.z.label === label && z.z.offset === offset, `device in ${tz} at ${now} local → ${z.name} (zone ${z.z.zone}, offset ${z.z.offset})`);
    await ctx.browser.close();
  }
  const ctx = await openPage({ seed: {}, now: '2026-10-04T12:00:00' });
  const more = await ctx.page.evaluate(() => [['Europe/London', '2026-07-01T12:00:00Z'], ['Europe/London', '2026-01-10T12:00:00Z'], ['Pacific/Chatham', '2026-01-10T12:00:00Z'], ['America/Regina', '2026-07-01T12:00:00Z'], ['UTC', '2026-07-01T12:00:00Z']].map(([z, t]) => window.nwZoneInfo(t, z).label));
  ok(JSON.stringify(more) === JSON.stringify(['BST', 'GMT', 'UTC+13:45', 'CST', 'UTC']), 'London BST/GMT from the built-in list; Chatham (no short name) uses its offset; a zone the browser names (Regina → CST) uses that; UTC → ' + more.join(', '));
  await ctx.browser.close();

  console.log('\n[2. The app saves this device\'s zone to device-timezone when it opens and the zone changed]');
  {
    const c1 = await openPage({ fakeFirestore: { ...BASE }, now: '2026-10-04T12:00:00', timezoneId: 'Asia/Kolkata' });
    await c1.page.waitForTimeout(3000);
    const d1 = await c1.page.evaluate(() => { const d = window.__fakeDocs.get('device-timezone'); return d && JSON.parse(d.value); });
    ok(d1 && d1.zone === 'Asia/Kolkata' && d1.label === 'IST' && d1.offset === '+05:30' && typeof d1.at === 'string' && Object.keys(d1).sort().join(',') === 'at,label,offset,zone', 'no device-timezone doc yet: it is written as { zone, label, offset, at } → ' + JSON.stringify(d1));
    await c1.browser.close();
    const same = { 'device-timezone': { key: 'device-timezone', value: JSON.stringify({ zone: 'Asia/Kolkata', label: 'IST', offset: '+05:30', at: '2026-10-01T00:00:00.000Z' }) } };
    const c2 = await openPage({ fakeFirestore: { ...BASE, ...same }, now: '2026-10-04T12:00:00', timezoneId: 'Asia/Kolkata' });
    await c2.page.waitForTimeout(3000);
    const w2 = await c2.page.evaluate(() => window.__fakeOrder.filter(o => o === 'set device-timezone').length);
    ok(w2 === 0, 'the same zone: nothing is written');
    await c2.browser.close();
    const c3 = await openPage({ fakeFirestore: { ...BASE, ...same }, now: '2026-10-04T12:00:00', timezoneId: 'America/Anchorage' });
    await c3.page.waitForTimeout(3000);
    const d3 = await c3.page.evaluate(() => JSON.parse(window.__fakeDocs.get('device-timezone').value));
    ok(d3.zone === 'America/Anchorage' && d3.label === 'AKDT' && d3.offset === '-08:00', 'a new zone: the doc is updated → ' + JSON.stringify(d3));
    ok(c1.errors.length + c2.errors.length + c3.errors.length === 0, '2: no console errors');
    await c3.browser.close();
  }
}

// ── The Apps Script in a sandbox ───────────────────────────────────
const GS = fs.readFileSync(path.join(__dirname, '..', 'tools', 'drive-backup.gs'), 'utf8');
// Firestore REST typed values from plain ones (ISO times in time fields become timestampValue).
const TIME_FIELDS = /^(updatedAt|sealedAt|savedAt|deviceSavedAt|cloudUpdatedAt|restoredAt|migratedAt)$/;
const typed = (v, k) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return TIME_FIELDS.test(k || '') && !isNaN(Date.parse(v)) ? { timestampValue: v } : { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(x => typed(x)) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, typed(x, kk)])) } };
};
let sandboxes = 0;
function gasSandbox({ docs, now, driveFiles }) {
  const log = { fetches: [], created: [], trashed: [], props: {}, propWrites: 0, logs: [], triggers: [], drivePatches: 0 };
  const FIXED = new Date(now).getTime();
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } }
  const fmt = (date, tz, f) => {
    const parts = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
    if (f === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
    if (f === 'yyyy') return parts.year;
    if (f === 'z') return parts.timeZoneName;
    if (f === 'Z') {
      const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
      const min = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
      const a = Math.abs(min);
      return (min < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + String(a % 60).padStart(2, '0');
    }
    throw new Error('format ' + f);
  };
  const files = driveFiles || [];
  let n = ++sandboxes * 1000; // file IDs unique across sandboxes that share a Drive
  const fileObj = (f) => ({ getId: () => f.id, getName: () => f.name, getSize: () => Buffer.byteLength(f.content || ''), isTrashed: () => !!f.trashed, setTrashed: (t) => { f.trashed = t; log.trashed.push(f.id); }, getDateCreated: () => new Date(f.createdTime) });
  const iter = (list) => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const folderObj = (f) => ({ ...fileObj(f),
    createFile: (blob) => { const nf = { id: 'GAS' + n++, name: blob.getName(), content: blob.getDataAsString(), parents: [f.id], createdTime: new FakeDate().toISOString() }; files.push(nf); log.created.push(nf.name); return fileObj(nf); },
    getFilesByName: (name) => iter(files.filter(x => x.mimeType !== FOLDER_MIME && x.name === name && (x.parents || []).includes(f.id)).map(fileObj)),
  });
  const restDocs = docs.map(d => ({ name: 'projects/nikhils-world/databases/(default)/documents/appdata/' + encodeURIComponent(d.id), fields: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, typed(v, k)])), updateTime: d.updateTime || '2026-10-01T00:00:00.000000Z' }));
  const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const ctx = {
    console: { log: (...a) => log.logs.push(a.join(' ')), warn: (...a) => log.logs.push(a.join(' ')), error: (...a) => log.logs.push(a.join(' ')) },
    Date: FakeDate,
    UrlFetchApp: { fetch: (url, params) => {
      log.fetches.push({ url, method: (params || {}).method || 'get', headers: (params || {}).headers || {} });
      if (url.startsWith('https://firestore.googleapis.com/')) {
        if (ctx.__firestoreError) return resp(403, ctx.__firestoreError);
        const masked = /mask\.fieldPaths=updatedAt/.test(url);
        const page = /pageToken=2/.test(url) ? 2 : 1;
        const all = restDocs.map(d => (masked ? { ...d, fields: d.fields.updatedAt ? { updatedAt: d.fields.updatedAt } : {} } : d));
        const half = Math.ceil(all.length / 2);
        return resp(200, page === 1 ? { documents: all.slice(0, half), nextPageToken: '2' } : { documents: all.slice(half) });
      }
      const m = /drive\/v3\/files\/([^?]+)\?/.exec(url);
      if (m) { const f = files.find(x => x.id === decodeURIComponent(m[1])); return f ? resp(200, { id: f.id, name: f.name, size: String(Buffer.byteLength(f.content)), md5Checksum: ctx.__badMd5 ? 'x' : md5(f.content) }) : resp(404, {}); }
      return resp(404, {});
    } },
    DriveApp: {
      getFoldersByName: (name) => iter(files.filter(f => f.mimeType === FOLDER_MIME && f.name === name).map(folderObj)),
      createFolder: (name) => { const f = { id: 'GASFOLDER' + n++, name, mimeType: FOLDER_MIME, createdTime: new FakeDate().toISOString() }; files.push(f); log.created.push('folder:' + name); return folderObj(f); },
      getFileById: (id) => fileObj(files.find(f => f.id === id)),
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...crypto.createHash(alg).update(s, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      newBlob: (data, type, name) => ({ getBytes: () => [...Buffer.from(data, 'utf8')], getDataAsString: () => data, getName: () => name, getContentType: () => type }),
      formatDate: fmt,
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in log.props ? log.props[k] : null), setProperty: (k, v) => { log.propWrites++; log.props[k] = v; } }) },
    ScriptApp: {
      getOAuthToken: () => 'gas-token',
      getProjectTriggers: () => log.triggers.slice(),
      deleteTrigger: (t) => { log.triggers = log.triggers.filter(x => x !== t); },
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (mins) => ({ create: () => { const t = { getHandlerFunction: () => fn, mins }; log.triggers.push(t); return t; } }) }) }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(GS, ctx, { filename: 'drive-backup.gs' });
  return { ctx, log, files };
}

// Docs for the merge check: old Kaizen archives, a split value, a sealed part with a deleted marker and an
// edit, a conflict copy, a text value, a key outside SEALED_LOG_KEYS that still has parts, a folding key.
function mergeFixture() {
  const docs = {};
  docs.kaizen3_logs = { key: 'kaizen3:logs', value: JSON.stringify({ '2026-05-01': KL('kaizen3 day'), '2026-05-02': KL('kaizen3 day two') }) };
  docs['kaizen3_logs_archive_2026-06-14'] = { key: 'kaizen3:logs', value: JSON.stringify({ '2026-06-14': KL('June archive day') }), archivedAt: '2026-06-14' };
  docs.kaizen4_logs_archive_2026_07_06 = { key: 'kaizen4:logs', value: JSON.stringify({ '2026-07-06': KL('Rescue day'), '2026-05-02': KL('kaizen3 day two, newer copy') }) };
  docs.kaizen4_logs__part_1 = { key: 'kaizen4:logs', value: JSON.stringify({ '2026-09-01': KL('Sealed one'), '2026-09-02': KL('Sealed two (to delete)'), '2026-09-03': KL('Sealed three (edited)') }), sealed: true, partOf: 'kaizen4_logs', n: 1, shape: 'dated', order: 'oldest-first', count: 3, rangeKind: 'date', from: '2026-09-01', to: '2026-09-03', sealedAt: '2026-09-30T00:00:00.000Z' };
  docs.kaizen4_logs = { key: 'kaizen4:logs', value: JSON.stringify({ '2026-09-03': KL('Edited in the active doc'), '2026-10-01': KL('Active day') }), parts: [{ id: 'kaizen4_logs__part_1', n: 1, count: 3, rangeKind: 'date', from: '2026-09-01', to: '2026-09-03', bytes: 300 }], shape: 'dated', order: 'oldest-first', deleted: [{ date: '2026-09-02', at: '2026-10-02T00:00:00.000Z' }, { date: '2026-05-01', at: '2026-10-02T00:00:00.000Z' }], updatedAt: '2026-10-02T00:00:00.000Z' };
  const blob = JSON.stringify({ note: 'é漢😀 '.repeat(130000) });
  const pieces = []; let start = 0;
  while (start < blob.length) { let end = Math.min(blob.length, start + 200000); if (/[\uD800-\uDBFF]/.test(blob[end - 1])) end--; pieces.push(blob.slice(start, end)); start = end; }
  docs.big_blob = { key: 'big:blob', value: null, split: { gen: 'gx', count: pieces.length, pieces: pieces.map((_, i) => `big_blob__split_gx_${i}`), bytes: Buffer.byteLength(blob) }, updatedAt: '2026-10-03T00:00:00.000Z' };
  pieces.forEach((p, i) => { docs[`big_blob__split_gx_${i}`] = { key: 'big:blob', splitOf: 'big_blob', gen: 'gx', index: i, count: pieces.length, value: p }; });
  docs['size_note__conflict_2026-10-04T10_00_00_000Z'] = { key: 'size:note', value: '"device version"', conflictOf: 'size_note', deviceSavedAt: '2026-10-04T09:00:00.000Z', cloudUpdatedAt: '2026-10-04T08:00:00.000Z', savedAt: '2026-10-04T10:00:00.000Z' };
  docs.size_note = { key: 'size:note', value: '"cloud version"', updatedAt: '2026-10-04T11:00:00.000Z' };
  docs['gatekeeper-name'] = { key: 'gatekeeper-name', value: 'Gus' };
  docs.old_list__part_1 = { key: 'old:list', value: JSON.stringify([{ id: 1, t: 'a' }, { t: 'no id' }]), sealed: true, partOf: 'old_list', n: 1, shape: 'array', order: 'oldest-first', count: 2, rangeKind: 'index', from: 0, to: 1 };
  docs.old_list = { key: 'old:list', value: JSON.stringify([{ id: 1, t: 'a, edited' }, { t: 'new' }]), parts: [{ id: 'old_list__part_1', n: 1, count: 2, rangeKind: 'index', from: 0, to: 1, bytes: 40 }], shape: 'array', order: 'oldest-first' };
  docs.half_list = { key: 'half:list', value: JSON.stringify([{ n: 1 }, { n: 2 }]), folding: true, parts: [{ id: 'half_list__part_1', n: 1, count: 1 }], shape: 'array', order: 'oldest-first' };
  docs.half_list__part_1 = { key: 'half:list', value: JSON.stringify([{ n: 1 }]), sealed: true, partOf: 'half_list', n: 1, shape: 'array', order: 'oldest-first', count: 1 };
  docs['device-timezone'] = { key: 'device-timezone', value: JSON.stringify({ zone: 'Asia/Kolkata', label: 'IST', offset: '+05:30', at: '2026-10-01T00:00:00.000Z' }) };
  return docs;
}

// ── 3. The Apps Script's merge matches getAll ──────────────────────
async function part3() {
  console.log('\n[3. tools/drive-backup.gs: its merge gives exactly what getAll gives, for every key]');
  const fake = mergeFixture();
  const docs = Object.entries(fake).map(([id, fields]) => ({ id, fields }));
  const { ctx: gas } = gasSandbox({ docs, now: '2026-10-05T05:26:00Z' });
  const merged = JSON.parse(JSON.stringify(gas.nwMergeDocs(docs)));
  const ctx = await openPage({ fakeFirestore: { ...BASE, ...fake }, now: '2026-10-04T12:00:00', timezoneId: 'Asia/Kolkata' });
  const { page } = ctx;
  await page.waitForTimeout(3000);
  const app = await page.evaluate(async (keys) => {
    const out = {};
    for (const k of keys) out[k] = (await window.storage.getAll(k)).value;
    const { backup } = await window.nwGatherBackup();
    return { out, backup };
  }, merged.entries.map(e => e.key));
  const keysGas = merged.entries.map(e => e.key);
  // The app's backup also has the keys the app itself wrote after it opened (Kaizen's, Play's); every key in
  // the fixture must be in both.
  const appKeys = app.backup.entries.map(e => e.key);
  const mismatched = merged.entries.filter(e => {
    const v = app.out[e.key];
    return e.text ? v !== e.value : JSON.stringify(JSON.parse(v)) !== JSON.stringify(e.value);
  }).map(e => e.key);
  ok(['kaizen4:logs', 'big:blob', 'size:note', 'gatekeeper-name', 'old:list', 'half:list', 'device-timezone'].every(k => keysGas.includes(k)) && !keysGas.some(k => /^kaizen3:logs$|archive|__/.test(k)), 'the script finds one entry per key (archives, parts, pieces and conflict copies are not keys) → ' + keysGas.join(', '));
  ok(mismatched.length === 0, `every key matches getAll (${merged.entries.length} keys)` + (mismatched.length ? ' → differ: ' + mismatched.join(', ') : ''));
  const k4 = merged.entries.find(e => e.key === 'kaizen4:logs').value;
  ok(JSON.stringify(Object.keys(k4)) === JSON.stringify(['2026-05-02', '2026-06-14', '2026-07-06', '2026-09-01', '2026-09-03', '2026-10-01']) && k4['2026-09-03'].highlight === 'Edited in the active doc' && k4['2026-05-02'].highlight === 'kaizen3 day two, newer copy', 'kaizen4:logs: old archives merged in order, deleted days left out (one in a sealed part, one in an old archive), the edit wins');
  ok(merged.entries.find(e => e.key === 'big:blob').value.note.length === 'é漢😀 '.length * 130000, 'the split value is joined from its pieces');
  ok(merged.conflictCopies.length === 1 && merged.conflictCopies[0].value === 'device version' && JSON.stringify(merged.conflictCopies) === JSON.stringify(app.backup.conflictCopies), 'the conflict copy is kept beside the entries, the same as in the app\'s backup');
  const sameEntries = JSON.stringify(merged.entries) === JSON.stringify(app.backup.entries.filter(e => keysGas.includes(e.key)));
  if (!sameEntries) merged.entries.forEach((e, i) => { const a = app.backup.entries.find(x => x.key === e.key); if (JSON.stringify(a) !== JSON.stringify(e)) console.log('    differs:', e.key, JSON.stringify(e).slice(0, 200), '|', JSON.stringify(a).slice(0, 200)); });
  ok(sameEntries && keysGas.every(k => appKeys.includes(k)), "the script's entries are identical to the app's backup entries for those keys (key, value, updatedAt)");
  ok(ctx.errors.length === 0, '3: no console errors' + (ctx.errors.length ? ' → ' + ctx.errors.join(' | ') : ''));
  await ctx.browser.close();
}

// ── 4. runBackup and setupTrigger ──────────────────────────────────
async function part4() {
  console.log('\n[4. tools/drive-backup.gs: runBackup and setupTrigger with every Google service mocked]');
  const fake = mergeFixture();
  const docs = Object.entries(fake).map(([id, fields]) => ({ id, fields }));
  const driveFiles = driveFixture().map(f => (f.name === 'nikhil-world-backup-2026-10-04-AKDT.json' ? { ...f, name: 'nikhil-world-backup-2026-10-05-IST.json' } : f));
  const { ctx: gas, log, files } = gasSandbox({ docs, now: '2026-10-05T05:26:00Z', driveFiles });
  const r1 = gas.runBackup();
  const first = log.fetches[0];
  ok(/mask\.fieldPaths=updatedAt/.test(first.url) && first.headers['x-goog-user-project'] === 'nikhils-world' && first.headers.Authorization === 'Bearer gas-token', 'each run first lists appdata with a field mask (updatedAt only), signed in as the account, with x-goog-user-project: nikhils-world');
  const made = files.find(f => /^GAS/.test(f.id));
  ok(r1.changed && r1.name === 'nikhil-world-backup-2026-10-05-IST.json' && made && made.parents[0] === 'F_OLD', 'the file is named with the date and label of the zone in device-timezone (Asia/Kolkata → 2026-10-05-IST) and goes to the oldest folder');
  const body = JSON.parse(made.content);
  const merged = JSON.parse(JSON.stringify(gas.nwMergeDocs(docs)));
  ok(body.format === 3 && body.zone === 'Asia/Kolkata' && body.offset === '+05:30' && body.label === 'IST' && JSON.stringify(body.entries) === JSON.stringify(merged.entries) && made.content.includes('\n  "entries": [\n'), 'it holds the format-3 backup (pretty-printed), the full zone name and the offset');
  const sameName = files.filter(f => f.name === r1.name && (f.parents || []).includes('F_OLD'));
  ok(sameName.length === 2 && files.find(f => f.id === 'OLD_SAME').trashed === true && JSON.stringify(log.trashed) === '["OLD_SAME"]', 'after Drive confirms it (md5 and size), only the older copy with exactly the same name, in that folder, is moved to the trash');
  ok(['F_OLD', 'F_NEW', 'UTC_A', 'UTC_B', 'OTHER', 'OTHER_LABEL', 'IN_NEW_FOLDER'].every(id => !files.find(f => f.id === id).trashed), 'no folder, no other file, nothing in the other folder and no UTC-named backup is touched');
  ok(/^Backed up \d+ keys to "Nikhil's World Backups\/nikhil-world-backup-2026-10-05-IST\.json"; moved 1 older copy/.test(log.logs[log.logs.length - 1]), 'the run log says what was saved → ' + log.logs[log.logs.length - 1]);
  // Unchanged: writes nothing, downloads only the masked list.
  const nF = log.fetches.length, nC = log.created.length, nP = log.propWrites, nT = log.trashed.length;
  const r2 = gas.runBackup();
  ok(r2.changed === false && log.fetches.length - nF === 2 && log.fetches.slice(nF).every(f => /mask\.fieldPaths=updatedAt/.test(f.url)) && log.created.length === nC && log.propWrites === nP && log.trashed.length === nT && /No changes since the last backup/.test(log.logs[log.logs.length - 1]), 'an unchanged run reads only the masked list (both pages) and writes nothing: no file, no trash, no property');
  // Something changes → a new backup.
  docs.find(d => d.id === 'size_note').updateTime = '2026-10-05T05:00:00.000000Z';
  // (the sandbox's REST docs are built when it starts: a new sandbox sharing the same properties sees the change)
  const s3 = gasSandbox({ docs, now: '2026-10-05T05:40:00Z', driveFiles: files });
  s3.log.props = log.props;
  const r3 = s3.ctx.runBackup();
  ok(r3.changed === true && files.filter(f => f.name === r3.name && !f.trashed && (f.parents || []).includes('F_OLD')).length === 1, 'when a doc changed, the next run backs up again and keeps one file of that name (the earlier one goes to the trash)');
  // No device-timezone doc → America/Anchorage.
  const noZone = docs.filter(d => d.id !== 'device-timezone');
  const s4 = gasSandbox({ docs: noZone, now: '2026-10-05T05:26:00Z', driveFiles: [] });
  const r4 = s4.ctx.runBackup();
  ok(r4.name === 'nikhil-world-backup-2026-10-04-AKDT.json' && s4.log.created.includes('folder:' + FOLDER), 'with no device-timezone doc it uses America/Anchorage (Oct 4, 9:26 PM AKDT → 2026-10-04-AKDT); with no folder it creates one');
  const s5 = gasSandbox({ docs: noZone, now: '2026-12-10T12:00:00Z', driveFiles: [] });
  ok(s5.ctx.runBackup().name === 'nikhil-world-backup-2026-12-10-AKST.json', 'in winter the label is AKST');
  // Drive's md5 doesn't match → nothing is trashed, and the next run tries again.
  const s6 = gasSandbox({ docs: noZone, now: '2026-10-05T05:26:00Z', driveFiles: [{ id: 'F1', name: FOLDER, mimeType: FOLDER_MIME, createdTime: '2025-01-01T00:00:00Z' }, { id: 'PREV', name: 'nikhil-world-backup-2026-10-04-AKDT.json', parents: ['F1'], content: '{}', createdTime: '2026-10-04T00:00:00Z' }] });
  s6.ctx.__badMd5 = true;
  let threw = '';
  try { s6.ctx.runBackup(); } catch (e) { threw = e.message; }
  ok(/does not match/.test(threw) && !s6.files.find(f => f.id === 'PREV').trashed && !('lastSignature' in s6.log.props), "if Drive's copy doesn't match, nothing older is trashed and the run is retried next time");
  // A Firestore error is reported plainly.
  const s7 = gasSandbox({ docs: noZone, now: '2026-10-05T05:26:00Z', driveFiles: [] });
  s7.ctx.__firestoreError = { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } };
  try { s7.ctx.runBackup(); threw = ''; } catch (e) { threw = e.message; }
  ok(/^Firestore said 403: .*PERMISSION_DENIED/.test(threw) && s7.log.created.length === 0, 'a Firestore permission error stops the run with "Firestore said 403 …" and writes nothing');
  // The script never writes to Firestore.
  const methods = (GS.match(/method:\s*'(\w+)'/g) || []).map(m => m.split("'")[1]);
  ok([log, s3.log, s4.log, s5.log, s6.log].every(l => l.fetches.every(f => f.method === 'get')) && methods.length >= 2 && methods.every(m => m === 'get'), 'it never writes to Firestore: every request it makes is a GET');
  // setupTrigger: one timer, never a duplicate.
  const t = gasSandbox({ docs: [], now: '2026-10-05T05:26:00Z', driveFiles: [] });
  t.ctx.setupTrigger(); t.ctx.setupTrigger();
  ok(t.log.triggers.length === 1 && t.log.triggers[0].getHandlerFunction() === 'runBackup' && t.log.triggers[0].mins === 15, 'setupTrigger installs one 15-minute timer for runBackup; running it again adds none');
  const gsSrc = GS + fs.readFileSync(path.join(__dirname, '..', 'tools', 'appsscript.json'), 'utf8');
  ok(/const INTERVAL_MINUTES = 15;/.test(GS) && /const PROJECT_ID = 'nikhils-world';/.test(GS) && !/AIza|client_secret|private_key|BEGIN [A-Z ]*KEY/.test(gsSrc), 'the interval is one constant (15); the project ID matches index.html; no keys or secrets in the script');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(idx.includes('projectId: "nikhils-world"'), "index.html's projectId is nikhils-world");
}

(async () => {
  const which = process.argv[2] || 'all';
  const run = (n) => which === 'all' || which === String(n);
  if (run(1)) await part1();
  if (run(2)) await part2();
  if (run(3)) await part3();
  if (run(4)) await part4();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
