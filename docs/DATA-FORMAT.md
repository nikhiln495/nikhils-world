# How Nikhil's World stores data

Everything lives in one Firestore collection, `appdata`, and goes through `window.storage` in
`index.html` (the block between `NW-STORAGE-LAYER START` and `NW-STORAGE-LAYER END`). This page is
for anyone reading that data from outside the app (a Cloud Function, a script, the Firestore REST API)
and for anyone changing the storage layer.

Firestore rejects any doc over **1,048,576 bytes** (field names and overhead included). The app never
writes a doc over **900,000 bytes**. Anything bigger is *split* into pieces. Only the keys listed in
**`SEALED_LOG_KEYS`** (a constant in the storage layer; today only `kaizen4:logs`) are *sealed* instead:
their oldest items move into read-only parts. **Nothing seals unless its key is in that list, and every
item stays editable and deletable.**

## Doc IDs

A key like `practice:log:2026_10_04` is stored at doc ID `practice_log_2026_10_04`: each of
`: / . # $ [ ]` becomes `_` (other characters, such as `-`, stay). Every doc keeps the original key in its
`key` field.

## A plain doc

| Field | Meaning |
|---|---|
| `key` | the key the app uses |
| `value` | the value, a string (usually JSON) |
| `updatedAt` | when it was last saved (Firestore timestamp) |
| `migratedAt`, `restoredAt` | set by older code and by backup restores; ignore them |

Most docs are only this. The fields below appear only when a doc is big or is a sealed log.

## Sealed parts (keys in `SEALED_LOG_KEYS` only)

A sealed log's value is one of these shapes:

| Shape | Example | What an "item" is |
|---|---|---|
| `array` | `[{…}, {…}]` | one array element |
| `entries` | `{ "date": "…", "entries": [{…}] }` | one element of `entries`; the other fields stay in the active doc |
| `dated` | `{ "2026-10-01": {…}, "2026-10-02": {…} }` (every key starts `YYYY-MM-DD` or `YYYY_MM_DD`) | one date and its value |

When a save would take the doc (the **active doc**) over **800,000 bytes**, the oldest items move into
new **part docs** until the active doc is under **400,000 bytes** (the newest item always stays). Each
part holds at most about 600,000 bytes; a big save can make several parts at once. The order of the
steps is: write each part and wait for Firestore to confirm it, then write the trimmed active doc
together with its updated `parts` list (one write, so the active doc is never trimmed without the
record of its parts).

**Part doc** — ID `<doc id>__part_<n>`, numbered from 1, oldest first. Read-only: `window.storage.set`
refuses to write it (only a backup restore may), and nothing ever rewrites or deletes it.

| Field | Meaning |
|---|---|
| `key` | the key of the data it belongs to (same as the active doc's `key`) |
| `value` | JSON of the items it holds, in the same shape (`entries` parts hold only `{ "entries": [...] }`) |
| `sealed` | `true` |
| `partOf` | the active doc's ID |
| `n` | its number |
| `shape`, `order` | as below |
| `count` | how many items it holds |
| `rangeKind`, `from`, `to` | `"date"` with the first and last date it holds, or `"index"` with the first and last item number in the whole history (0 = oldest) |
| `sealedAt` | when it was sealed |

**Extra fields on the active doc once it has parts:**

| Field | Meaning |
|---|---|
| `parts` | list of `{ id, n, count, rangeKind, from, to, bytes }`, one per part, oldest first. This list is the record of which parts exist. |
| `shape` | `array`, `entries` or `dated` |
| `order` | `oldest-first` (the default, items appended at the end) or `newest-first` (detected when an array's first item has a later date than its last, e.g. a log that adds new items at the front) |
| `deleted` | the deleted markers (below); missing or empty when nothing is deleted |

### Editing and deleting items

Every item stays editable and deletable from the app; a part is never rewritten.

- **Edit:** the edited copy is saved in the active doc. When merged it wins over the copy in a part (same
  date, or same `id`).
- **Delete:** `window.storage.deleteItem(key, target)` removes the item from the active doc and, if a copy
  of it is in a part, adds a **deleted marker** to the active doc's `deleted` list. The marker hides that
  copy; the original stays in its part. `restoreItem` removes the marker and the item shows again.
  `deletedItems(key)` lists the markers with the items they hide. Kaizen's Reflect has "Delete this day"
  and a "Deleted days" list with Restore.

A marker is one of:

| Marker | Hides |
|---|---|
| `{ "date": "2026-09-05", "at": "…" }` | that date in every part (date-keyed logs) |
| `{ "id": "abc", "at": "…" }` | every item in a part whose `id` is `"abc"` (numbers and strings compare as text) |
| `{ "part": "<part doc id>", "index": 3, "hash": "…", "at": "…" }` | the one item at position 3 (from 0, as stored) of that part, but only while the item's JSON still hashes to `hash` (cyrb53 of `JSON.stringify(item)`, hex; `hashOf` in `index.html`). Used for items that have no `id`, so that of two identical items only the one deleted is hidden. |

Markers apply only to parts (and the old Kaizen archives below), never to the active doc's own items:
an item typed in again after it was deleted shows.

### Reading the whole history

`window.storage.getAll(key)` does exactly this (and `tools/drive-backup.gs` has the same steps):

1. Read the active doc. If it has `folding: true` (see below), its value is already whole; stop.
2. Read every part in its `parts` list, by `n` (for `kaizen4:logs`, the old Kaizen archives first).
3. Remove from the parts every item a deleted marker hides.
4. Dated: start from `{}`, copy in each part's object in order, then the active doc's object; a date in
   the active doc wins over the same date in a part (it is a later edit). Sort the dates.
5. Array / entries: put the items in time order — part 1, part 2, …, then the active doc (for
   `newest-first`, reverse each list first). If two items have the same `id` field, keep the later
   copy in the earlier position. For `newest-first`, reverse the result. For `entries`, the other fields
   come from the active doc.

A save that repeats items already in a part unchanged (a screen that read the whole history and saves
it back) has those items dropped before it is written, so nothing is sealed twice (items a marker hides
are not counted, so a deleted item typed in again is kept).

### Old Kaizen archives

Before this format existed, Kaizen's daily log was archived by hand and by an older rollover. Those docs
stay where they are and are read as sealed parts of `kaizen4:logs` (date-keyed), before its numbered
parts, in doc-ID order:

- `kaizen3_logs` (key `kaizen3:logs`, the frozen first log)
- every doc whose ID starts `kaizen3_logs_archive_`
- every doc whose ID starts `kaizen4_logs_archive_` (one of them has key `kaizen4:logs`)

They are read-only too; a `{ date }` marker in `kaizen4_logs` hides a day in them.

## Keys outside `SEALED_LOG_KEYS` that still have parts

Before sealing became opt-in, any growing value could seal. If a key outside the list still has a
`parts` list, the app reads it whole (`get` and `getAll` both return parts + active merged), and the next
save folds it back:

1. The whole value is written (split if needed), keeping the `parts` list and adding `folding: true`, so
   any reader takes the value as whole.
2. Only after Firestore confirms that write, the doc is written again without `parts`, `shape`, `order`
   and `folding`.

The part docs are left where they are (never deleted). If the screen that saved hadn't read the whole
value this session, the parts' items are merged into the value first, so nothing is left out.

## Split values (any other big value)

If a value would make its doc bigger than 900,000 bytes, the string is cut into pieces of at most
700,000 bytes (never inside a character) and stored in **piece docs**. A sealed part with one huge item
is split the same way.

**Piece doc** — ID `<doc id>__split_<gen>_<i>`, where `gen` is new for every save and `i` counts from 0.

| Field | Meaning |
|---|---|
| `key` | the key it belongs to |
| `splitOf` | the main doc's ID |
| `gen`, `index`, `count` | which save it belongs to, its position, how many pieces that save has |
| `value` | its slice of the string |

**The main doc** then has `value: null` and

| Field | Meaning |
|---|---|
| `split` | `{ gen, count, pieces: [piece doc IDs in order], bytes }` |

To read it, fetch the pieces listed in `split.pieces` and join their `value`s in that order. Check that
each piece's `splitOf`, `gen` and `index` match; if any is missing, the value can't be read (the app
then uses the device's copy, or reports an error — it never treats it as empty).

The order of the steps on save: write every new piece (each confirmed), then write the main doc pointing
at them, then delete the previous save's pieces. A save that fails part-way leaves the main doc pointing
at the old, complete pieces; any new pieces it wrote are deleted.

## Conflict copies

A save made while the cloud was unreachable waits on the device (see below). Before it is uploaded, the
cloud copy is read. If it changed since the version this device's copy was based on (its `updatedAt`
differs from the one this device last had; or this device never had a cloud copy of that key and the
values differ), the cloud copy is kept and the device's version is written beside it:

**Conflict doc** — ID `<doc id>__conflict_<timestamp>` (an ISO time with `:` and `.` as `_`, e.g.
`kaizen4_logs__conflict_2026-10-05T14_30_12_123Z`).

| Field | Meaning |
|---|---|
| `key` | the key |
| `value` | the device's version |
| `deleted` | the device's deleted markers (keys in `SEALED_LOG_KEYS` only) |
| `conflictOf` | the doc ID it conflicts with |
| `deviceSavedAt`, `cloudUpdatedAt`, `savedAt` | the device's save time, the cloud copy's time, when the copy was written |

The same check runs when a screen saves a key whose last read came from this device's copy because the
cloud couldn't be reached. The app shows a banner naming the copy and never reads it on its own. Compare
it with the main doc by hand. Backups keep it.

The exception is **drafts and notes docs** (`practice:drafts`, `drafts:<tab>`, `notes:<YYYY_MM_DD>`):
they never get a conflict copy. Every save of them (online or uploaded later) is merged with the cloud
copy first, as described next.

## Drafts and notes (merged, never a conflict copy)

**Drafts** — `practice:drafts` (the Practice tab) and `drafts:<tab>` for the other tabs (`drafts:kaizen`,
`drafts:food`, `drafts:health`, `drafts:roulette`, `drafts:pending`, `drafts:system`). One small doc per tab:

```json
{ "drafts": { "forgot": { "v": "Keys in the car", "at": 1791133209696 },
              "flow:sc-break": { "v": { "practiceId": "sc-break", "i": 1, "before": 7, "notes": { "0": "Tight chest" }, "myNote": "" }, "at": 1791133210000 },
              "tada": { "v": null, "at": 1791133211216 } } }
```

`v` is what is typed (a string, a form object, or a flow's progress); `at` is when it was typed (ms).
`v: null` is a cleared draft (cleared on submit); it is kept so it beats an older copy from another device.
Merge: per draft id, the larger `at` wins. Drafts older than 7 days are dropped; the doc is kept under 50 KB
(cleared drafts are dropped first, then the oldest). A single draft over 20,000 characters isn't kept.

**Notes** — `notes:<YYYY_MM_DD>` (the device's local date):

```json
{ "date": "2026-10-04",
  "notes": [ { "id": "note_mux…", "at": "2026-10-04T17:00:44.866Z", "u": 1791133244866, "tab": "practice",
               "screen": "Guided flow", "practice": "countdown", "step": 1, "text": "…" },
             { "id": "note_…", "at": "…", "u": 1791133250000, "tab": "health", "text": "With breakfast",
               "ref": { "tab": "health", "what": "Taken: Etilaam", "day": "2026-10-04" } },
             { "id": "note_old", "deleted": true, "u": 1791133260000 } ] }
```

`tab` is the app tab (`roulette` = Play, `kaizen`, `food` = Fuel, `health` = Vitals, `practice`, `pending`,
`system`); `screen`, `practice`, `step` say where the Note button was pressed; `ref` names the entry a note
from the Saved bar's "Add note" belongs to, when that entry has no note field of its own (tab, what, and its
id, time or day). Merge: per note id, the larger `u` wins; a removed note stays as `{ id, deleted, u }`.
Notes are listed by `at`.

## Practice log entries (practice:log:<YYYY_MM_DD>)

New entries also carry `id` (for Undo and edits), `at` (ISO time it was logged), and when given `myNote`
(his own note: "Anything else?", the Saved bar's Add note, or an edit) and `stepNotes:
[{ step: <1-based>, text: <step text>, note }]` (only steps with a note; for Waking up, Q1 = 1, Q2 = 2,
steps from 3). `note` keeps its old meaning (e.g. the "Asked Claude" context). An edit of `time` or `myNote`
keeps the old value in `edits: [{ at, field, from }]`. Entries are stored in the order logged; screens show
them in time order (no time last).

## Kaizen tasks

A task or subtask marked done in the app gets `doneAt` (ISO time); reopening it (or Undo) removes it. Tasks
finished before this have no `doneAt`.

## Claude answers (practice:asks:<YYYY_MM_DD>)

Every Claude call saves `{ time, kind, words, prompt, text, tools, sources, model, usage }`; `usage` has
`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Kinds: `stuck`,
`stuck-else`, `coach-me`, `outside`, `draft-shobha` (Practice) and `kaizen-foci` (Kaizen's session-pattern
analysis). The System tab's cost tracker reads this month's docs.

## On the device (localStorage)

- Each key's latest value is kept under the key itself: what this device saved, refreshed from the cloud on
  every read (for a key outside `SEALED_LOG_KEYS` with old parts, the whole value). That is what the app
  shows offline. If a refreshed copy doesn't fit, the old one is removed rather than kept stale. Sealed
  parts and old archives are never copied to the device; offline, the app shows one plain line, "Older
  history loads when you're online".
- `__nw_upload_queue` — saves that only this device has, oldest first:
  `[{ key, id, at, firstAt, base, reason, what, whole? }]` (one per key; the value is the key's device
  copy). `base` is the cloud `updatedAt` (ms; 0 = none) this device's copy was based on, or `null` if it
  never had one. Uploaded when the device comes back online and at app start.
- `__nw_cloud_seen` — `{ docId: { at, parts } }`: the cloud `updatedAt` each device copy matches, and how
  many parts the doc had.
- `__nw_deleted` — `{ key: [markers] }`: this device's copy of each sealed log's `deleted` list.
- `__nw_last_cloud_save`, `__nw_conflicts`, `__nw_dismissed_sizes` — for the status line and banners.
- `__nw_room_notes` — conflict copies made when the old `kaizen3:logs` device copy was tidied (one banner each).
- **Room on this device:** `kaizen3:logs` (the old Kaizen log, only used offline for pre-July history) is
  removed from the device once the device's saved data passes 60% of the 5 MB estimate and the device is
  online: if every day in it matches the cloud's whole Kaizen history, it is removed; if any day is missing
  or different, the whole copy is first written as `kaizen3_logs__conflict_<time>` (fields: `key`, `value`,
  `conflictOf: "kaizen3_logs"`, `deviceCopy: true`, `days`: the days that differed, `savedAt`), read back to
  confirm, and only then removed. Never while something for it (or for `kaizen4:logs`) waits to upload.

## Other docs

- `device-timezone` — `{ "zone": "America/Anchorage", "label": "AKDT", "offset": "-08:00", "at": "…" }`:
  the time zone of the device Nikhil last opened the app on, written when it opens and the zone (or its
  daylight-saving label) changed. Backup file names use it.

## Sizes

Bytes are counted the way Firestore counts them: doc name (`appdata` + the doc ID, +1 each, +16), plus
each field name (UTF-8 bytes + 1) and value (strings: UTF-8 bytes + 1; numbers and timestamps 8; true,
false and null 1; maps and arrays: the sum of what they hold), plus 32.

| Constant | Bytes |
|---|---|
| Firestore limit | 1,048,576 |
| SAFE — nothing is written above this | 900,000 |
| a banner names a doc that is written again, at or above (85% of SAFE) | 765,000 |
| a banner names a key outside `SEALED_LOG_KEYS` whose whole value is at or above | 1,572,864 (1.5 MB) |
| keys in `SEALED_LOG_KEYS` seal above | 800,000 |
| …until the active doc is under | 400,000 |
| each new part holds at most about | 600,000 |
| each split piece | 700,000 |

Docs that are never written again (sealed parts, old archives, pieces, conflict copies) get no banner; the
System tab's size table lists every doc. The System tab also shows this device's saved data (localStorage,
counted at 2 bytes per character) against an estimate of 5 MB (5,242,880 bytes), with a banner at 70%.

## Backup files (format 3)

"Sync to Drive", "Download backup", the silent sync and `tools/drive-backup.gs` all write the same file,
pretty-printed with 2 spaces:

```json
{
  "format": 3,
  "timestamp": "2026-10-05T05:26:00.000Z",
  "source": "firestore",
  "zone": "America/Anchorage",
  "label": "AKDT",
  "offset": "-08:00",
  "count": 31,
  "entries": [
    { "key": "kaizen4:logs", "value": { "2026-07-10": { "highlight": "…" } }, "updatedAt": "2026-10-04T20:00:00.000Z" },
    { "key": "gatekeeper-name", "value": "Gus", "text": true, "updatedAt": null }
  ],
  "conflictCopies": [ { "id": "…__conflict_…", "key": "…", "conflictOf": "…", "value": "…", "savedAt": "…" } ]
}
```

- One entry per key, sorted by key; `value` is exactly what `getAll` returns (parts merged, pieces
  joined, deleted items left out), parsed from JSON. A value that isn't JSON is kept as text with
  `"text": true`. A doc whose `key` field doesn't match its doc ID is kept under its doc ID.
- Old Kaizen archives, sealed parts and pieces are not entries of their own: their items are in the
  entries. Conflict copies are in `conflictCopies`. A key that can't be put together (a missing piece) is
  in `unreadable`, with its raw docs, so nothing is left out.
- `source` is `firestore`, `this-device` (the database couldn't be read; only this device's copy) or
  `apps-script`.
- File name: `nikhil-world-backup-<YYYY-MM-DD>-<label>.json` (plus `-this-device` for a device-only
  copy), the date and label in the device's time zone (`device-timezone` for the Apps Script). The label
  is the common short name (AKDT, AKST, IST, from a built-in list), else the browser's short name if it is
  letters, else the UTC offset (`UTC+5:45`). In Drive, a new file is uploaded and confirmed (md5 or size)
  before older files with exactly the same name are moved to the trash; nothing else is ever deleted.

Restore accepts format 3 (each key through `window.storage.set`; for a sealed log, `setExact` also sets
markers so the history reads back exactly; each key is read back and must match), format 2 (raw docs by
ID) and the older `{ data: { key: value } }` files.

## Recipe: reading over the Firestore REST API

The REST API returns typed fields: a string is `{ "stringValue": "…" }`, an array is
`{ "arrayValue": { "values": [...] } }`, a map is `{ "mapValue": { "fields": {…} } }`. Requests need
the same sign-in and Firestore rules as any other client (or, like `tools/drive-backup.gs`, a Google
account with access to the project).

```js
const BASE = 'https://firestore.googleapis.com/v1/projects/nikhils-world/databases/(default)/documents/appdata/';
const plain = (v) => v == null ? null
  : 'stringValue' in v ? v.stringValue
  : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? v.doubleValue
  : 'booleanValue' in v ? v.booleanValue
  : 'nullValue' in v ? null
  : 'timestampValue' in v ? v.timestampValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]))
  : null;
const getDoc = async (id, auth) => {
  const r = await fetch(BASE + encodeURIComponent(id), { headers: auth });
  if (r.status === 404) return null;
  const d = await r.json();
  return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, plain(v)]));
};
const idOf = (key) => key.replace(/[:/.#$[\]]/g, '_');

// One doc's value, with split pieces joined back together.
async function readValue(id, auth) {
  const f = await getDoc(id, auth);
  if (!f) return null;
  if (!f.split) return f.value;
  const pieces = await Promise.all(f.split.pieces.map(p => getDoc(p, auth)));
  pieces.forEach((p, i) => { if (!p || p.splitOf !== id || p.gen !== f.split.gen || p.index !== i) throw new Error(`piece ${i} of ${id} missing`); });
  return pieces.map(p => p.value).join('');
}

// A key's whole history (see "Reading the whole history"). For kaizen4:logs, also read kaizen3_logs and the
// *_logs_archive_* docs first (list them with documents:runQuery on __name__, or by ID if you know them).
// tools/drive-backup.gs (nwValueOfKey) is a complete version that works from a list of every doc.
async function readAll(key, auth) {
  const id = idOf(key);
  const active = await getDoc(id, auth);
  const value = await readValue(id, auth);
  if (!active || active.folding || !active.parts || !active.parts.length) return value == null ? null : JSON.parse(value);
  const parts = [];
  for (const p of [...active.parts].sort((a, b) => a.n - b.n)) parts.push({ id: p.id, v: JSON.parse(await readValue(p.id, auth)) });
  const marks = active.deleted || [];
  const hiddenDate = new Set(marks.filter(m => m.date).map(m => m.date));
  const hiddenId = new Set(marks.filter(m => m.id != null).map(m => String(m.id)));
  const now = JSON.parse(value);
  if (active.shape === 'dated') {
    const all = Object.assign({}, ...parts.map(p => Object.fromEntries(Object.entries(p.v).filter(([d]) => !hiddenDate.has(d)))), now);
    return Object.fromEntries(Object.keys(all).sort().map(k => [k, all[k]]));
  }
  const items = (v) => active.shape === 'array' ? v : v.entries;
  // { part, index, hash } markers: compare cyrb53(JSON.stringify(item)) with the hash (see hashOf in index.html).
  const visible = (p) => items(p.v).filter((it, i) => !(it && it.id != null && hiddenId.has(String(it.id))) && !marks.some(m => m.part === p.id && m.index === i));
  const inTime = (list) => active.order === 'newest-first' ? [...list].reverse() : list;
  const out = [], seen = new Map();
  for (const it of [...parts.flatMap(p => inTime(visible(p))), ...inTime(items(now))]) {
    const k = it && (typeof it.id === 'string' || typeof it.id === 'number') ? String(it.id) : undefined;
    if (k !== undefined && seen.has(k)) { out[seen.get(k)] = it; continue; }
    if (k !== undefined) seen.set(k, out.length);
    out.push(it);
  }
  if (active.order === 'newest-first') out.reverse();
  return active.shape === 'array' ? out : { ...now, entries: out };
}
```

(The recipe's `{ part, index }` check skips the hash comparison; `tools/drive-backup.gs` does the full one.)

Skip docs whose ID contains `__part_`, `__split_` or `__conflict_` when listing keys: they belong to
another doc.

**Writing from outside the app:** write only plain docs (`key`, `value`, `updatedAt`) under 900,000
bytes. Never write a part, piece or conflict doc, and never remove `parts`, `split` or `deleted` from a doc
that has them; if a value you need to write is bigger, write it through the app instead.
`tools/drive-backup.gs` never writes to Firestore.
