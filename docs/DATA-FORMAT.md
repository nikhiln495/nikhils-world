# How Nikhil's World stores data

Everything lives in one Firestore collection, `appdata`, and goes through `window.storage` in
`index.html` (the block between `NW-STORAGE-LAYER START` and `NW-STORAGE-LAYER END`). This page is
for anyone reading that data from outside the app (a Cloud Function, a script, the Firestore REST API)
and for anyone changing the storage layer.

Firestore rejects any doc over **1,048,576 bytes** (field names and overhead included). The app never
writes a doc over **900,000 bytes**. It gets there in two ways: growing data is *sealed* into read-only
parts, and anything else that is too big is *split* into pieces.

## Doc IDs

A key like `practice:log:2026_10_04` is stored at doc ID `practice_log_2026_10_04`: each of
`: / . # $ [ ]` becomes `_`. Every doc keeps the original key in its `key` field.

## A plain doc

| Field | Meaning |
|---|---|
| `key` | the key the app uses |
| `value` | the value, a string (usually JSON) |
| `updatedAt` | when it was last saved (Firestore timestamp) |
| `migratedAt`, `restoredAt` | set by older code and by backup restores; ignore them |

Most docs are only this. The fields below appear only when a doc has grown or is too big.

## Sealed parts (growing data)

"Growing data" is a value whose JSON is one of these shapes:

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
refuses to write it (only a backup restore may).

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

**Reading the whole history** (`window.storage.getAll(key)` does exactly this):

1. Read the active doc. Read every part in its `parts` list, by `n`.
2. Dated: start from `{}`, copy in each part's object in order, then the active doc's object; a date in
   the active doc wins over the same date in a part (it is a later edit). Sort the dates.
3. Array / entries: put the items in time order — part 1, part 2, …, then the active doc (for
   `newest-first`, reverse each list first). If two items have the same `id` field, keep the later
   copy in the earlier position. For `newest-first`, reverse the result. For `entries`, the other fields
   come from the active doc.

A save that repeats items already in a part unchanged (a screen that read the whole history and saves
it back) has those items dropped before it is written, so nothing is sealed twice. Items in a sealed part
can't be deleted or changed in place; an edited copy goes in the active doc and wins when merged.

### Old Kaizen archives

Before this format existed, Kaizen's daily log was archived by hand and by an older rollover. Those docs
stay where they are and are read as sealed parts of `kaizen4:logs` (date-keyed), before its numbered
parts, in doc-ID order:

- `kaizen3_logs` (key `kaizen3:logs`, the frozen first log)
- every doc whose ID starts `kaizen3_logs_archive_`
- every doc whose ID starts `kaizen4_logs_archive_` (one of them has key `kaizen4:logs`)

They are read-only too.

## Split values (any other shape)

If a value that is not growing data would make its doc bigger than 900,000 bytes, the string is cut
into pieces of at most 700,000 bytes (never inside a character) and stored in **piece docs**. A sealed
part with one huge item is split the same way.

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

A save made while the cloud was unreachable waits on the device (see below). When it is uploaded, if
the cloud copy was changed after the device's copy (its `updatedAt` is later than the device's first
waiting save), the cloud copy is kept and the device's version is written beside it:

**Conflict doc** — ID `<doc id>__conflict_<timestamp>` (an ISO time with `:` and `.` as `_`, e.g.
`kaizen4_logs__conflict_2026-10-05T14_30_12_123Z`).

| Field | Meaning |
|---|---|
| `key` | the key |
| `value` | the device's version |
| `conflictOf` | the doc ID it conflicts with |
| `deviceSavedAt`, `cloudUpdatedAt`, `savedAt` | the device's save time, the cloud copy's time, when the copy was written |

The app shows a banner naming it and never reads it on its own. Compare it with the main doc by hand.

## On the device (localStorage)

- Each key's latest value is kept under the key itself, as a backup copy. Best effort: if the device is
  full, the cloud copy is relied on. Sealed parts are never copied to the device.
- `__nw_upload_queue` — saves that only this device has, oldest first: `[{ key, id, at, firstAt, reason, what }]`
  (one per key; the value is the key's device copy). Uploaded when the device comes back online and at
  app start.
- `__nw_last_cloud_save`, `__nw_conflicts`, `__nw_dismissed_sizes` — for the status line and banners.

## Sizes

Bytes are counted the way Firestore counts them: doc name (`appdata` + the doc ID, +1 each, +16), plus
each field name (UTF-8 bytes + 1) and value (strings: UTF-8 bytes + 1; numbers and timestamps 8; true,
false and null 1; maps and arrays: the sum of what they hold), plus 32.

| Constant | Bytes |
|---|---|
| Firestore limit | 1,048,576 |
| SAFE — nothing is written above this | 900,000 |
| a banner names any doc at or above (85% of SAFE) | 765,000 |
| growing data is sealed above | 800,000 |
| …until the active doc is under | 400,000 |
| each new part holds at most about | 600,000 |
| each split piece | 700,000 |

## Recipe: reading over the Firestore REST API

The REST API returns typed fields: a string is `{ "stringValue": "…" }`, an array is
`{ "arrayValue": { "values": [...] } }`, a map is `{ "mapValue": { "fields": {…} } }`. Requests need
the same sign-in and Firestore rules as any other client.

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

// A key's whole history: sealed parts + the active doc (see "Reading the whole history").
// For kaizen4:logs, also read kaizen3_logs and the *_logs_archive_* docs first (list them with
// documents:runQuery on __name__, or by ID if you know them).
async function readAll(key, auth) {
  const id = idOf(key);
  const active = await getDoc(id, auth);
  const value = await readValue(id, auth);
  if (!active || !active.parts || !active.parts.length) return value == null ? null : JSON.parse(value);
  const parts = [];
  for (const p of [...active.parts].sort((a, b) => a.n - b.n)) parts.push(JSON.parse(await readValue(p.id, auth)));
  const now = JSON.parse(value);
  if (active.shape === 'dated') {
    const all = Object.assign({}, ...parts, now);
    return Object.fromEntries(Object.keys(all).sort().map(k => [k, all[k]]));
  }
  const items = (v) => active.shape === 'array' ? v : v.entries;
  const inTime = (list) => active.order === 'newest-first' ? [...list].reverse() : list;
  const out = [], seen = new Map();
  for (const it of [...parts.flatMap(p => inTime(items(p))), ...inTime(items(now))]) {
    const k = it && (typeof it.id === 'string' || typeof it.id === 'number') ? it.id : undefined;
    if (k !== undefined && seen.has(k)) { out[seen.get(k)] = it; continue; }
    if (k !== undefined) seen.set(k, out.length);
    out.push(it);
  }
  if (active.order === 'newest-first') out.reverse();
  return active.shape === 'array' ? out : { ...now, entries: out };
}
```

Skip docs whose ID contains `__part_`, `__split_` or `__conflict_` when listing keys: they belong to
another doc.

**Writing from outside the app:** write only plain docs (`key`, `value`, `updatedAt`) under 900,000
bytes. Never write a part, piece or conflict doc, and never remove `parts` or `split` from a doc that
has them; if a value you need to write is bigger, write it through the app instead.
