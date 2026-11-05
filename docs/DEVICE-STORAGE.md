# What this device keeps, and where

Everything the app keeps on a device lives in the **device store** inside the storage layer
(`dev` in `NW-STORAGE-LAYER`, reached as `window.storage.dev`). Nothing else in `index.html` reads or writes
`localStorage` for app data (the Drive token cache is the one exception, see CLAUDE.md).

## How it works

- **In memory first.** When the page starts, the whole device store is read from IndexedDB into memory (database
  `nw-device`, object store `kv`, key → string). The first screen is drawn after that, so every read
  (`get`, `getAll`, `nwDev.get`) answers at once, offline too, and stays synchronous.
- **Writes go through.** `setItem` changes memory at once and writes to IndexedDB in the same moment (writes in
  the same tick go in one transaction). `put` is the same but resolves when IndexedDB has it.
- **localStorage only as a fallback.** If IndexedDB can't open or read (private browsing, blocked), the device
  store uses `localStorage` as before, with the old 5 MB estimate. The System tab says so. A marker
  (`__nw_dev_fallback`, in localStorage) records it, so at the next start the localStorage copy wins over an
  older IndexedDB copy.
- **Never moved:** keys that start with `gdrive_token` (the Drive token cache) or `firebase`. They stay in
  localStorage.
- **Moved once.** At start, any app key still in localStorage is moved: copied into IndexedDB (a key IndexedDB
  already has is left alone, and a key written since the page started is never overwritten), read back and
  compared, and only then removed from localStorage. A key that does not read back the same stays in
  localStorage and is tried again at the next start. Nothing waiting to upload is removed before it is
  confirmed in IndexedDB. `__nw_dev_migrated` records when and how much moved.
- **Two tabs.** Both read the same IndexedDB. A write in one tab is announced on a `BroadcastChannel`
  (`nw-device`) and the other tab reads the key again.

## Caches, pending sends, and the offline copy

The System tab meter shows three numbers (each at 2 bytes per character):

| Group | What | Removed by "Clear caches"? |
|---|---|---|
| Caches (can be read again) | `__nw_dump_hist` (Brain Dump history), `__nw_ledger_cache` (last Ledger read), and any key starting `__nw_cache:` | yes, only these |
| Waiting to upload | `__nw_upload_queue`, the device copy of every key in it, `__nw_ledger_pending`, `__nw_dump_queue`, `__nw_dev_draft:*` | never |
| Offline copy of your data | the device copy of every other key (so the app opens offline), the Ledger link, settings | never |

To add a cache: name it `__nw_cache:<name>` and write it with `nwDev.set`. It must be something that is read again
from its source when missing (`nwDev.get(k, fallback)` must be able to start empty).

## When a write does not fit

- `setItem` returns `false` when it can tell at once (the fallback's `QuotaExceededError`, or less room than the
  value needs according to `navigator.storage.estimate()`). `window.storage.set` waits for IndexedDB and returns
  `false` (nothing stored) if the write fails; the screen then says nothing was stored.
- A failure that comes back later (IndexedDB aborts with `QuotaExceededError`) puts the old value back in memory and
  raises the device-full message.

## Persistence

At start the app calls `navigator.storage.persist()` and the System tab shows the answer. A browser that
answers "no" may clear the device store when the device is low on space; the cloud copy is not affected.
