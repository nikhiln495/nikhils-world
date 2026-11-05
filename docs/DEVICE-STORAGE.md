# What this device keeps, and where

Everything the app keeps on a device lives in the **device store** inside the storage layer
(`dev` in `NW-STORAGE-LAYER`, reached as `window.storage.dev`). Nothing else in `index.html` reads or writes
`localStorage` for app data (the Drive token cache is the one exception, see CLAUDE.md).

## How it works

This covers the device copy of **every** key (the Firestore keys, the upload queue, the Ledger and Brain Dump keys, drafts).

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

## How much room, and the message

- **IndexedDB:** real numbers from `navigator.storage.estimate()` (`usage` and `quota`, refreshed at start and a few seconds
  after writes). The System tab shows "Room used on this device: X of Y (n%)".
- **Fallback (localStorage):** this app's bytes against an estimate of 5 MB. The System tab says "older storage (private
  browsing or blocked)".
- **The message** shows only at 85% of what the browser allows, or when a save did not fit. OK hides it for 24 hours or
  until the percent rises 5 points; a save that does not fit shows it again at once. It says what it is, that it does not
  clear when things upload, and the one thing to do: System tab, Clear caches.
- Kaizen's old `kaizen3:logs` device copy is still tidied at 60% of the 5 MB estimate (bytes kept by the app), as before.

## Numbers from tests

On a 5.4 MB device copy (28 keys) the first screen waited 9 ms for the device copy to be in memory; a plain read of it
from IndexedDB takes about 20 ms (headless Chromium; `scripts/storage-test.js` part 14 prints it each run).

## Persistence

At start the app calls `navigator.storage.persist()` and the System tab shows the answer. A browser that
answers "no" may clear the device store when the device is low on space; the cloud copy is not affected.
