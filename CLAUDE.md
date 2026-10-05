# Rules for working on Nikhil's World

The app is one file, `index.html` (React via Babel in the browser, Firestore for data). Grep for what
you need; don't read it end to end.

## Data

1. **Every read and write goes through `window.storage`.** No feature calls Firestore
   (`db.collection(...)`) or `localStorage.setItem` itself. The only exceptions are the storage layer
   (between `NW-STORAGE-LAYER START` and `NW-STORAGE-LAYER END`) and the Drive token cache
   (`NW-TOKEN-CACHE`). `scripts/storage-layer-check.js` fails the harness otherwise.
   - `get(key)` → `{ value } | null` — the active doc.
   - `getAll(key)` → the whole history (sealed parts + active, merged in order). Use it on every screen
     that shows history.
   - `set(key, value)` → `'cloud' | 'device-only' | false`.
   - `listPrefix(prefix)`, `exportRawDocs()`, `setDoc(id, fields)` (backup restore only).
2. **Growing data uses seal-and-continue.** Store anything that keeps growing as an array,
   `{ entries: [...] }`, or an object keyed by date (`YYYY-MM-DD`). `window.storage.set` then moves the
   oldest items into read-only sealed parts by itself when the doc passes 800,000 bytes. Don't build
   your own rollover or archive docs, and don't write sealed parts. Any other value over 900,000 bytes
   is split into pieces automatically; nothing extra to do.
3. **Every save shows cloud vs device.** Check what `set` returned: say "saved" only for `'cloud'`; for
   `'device-only'` say it is on this device only, not in the cloud yet; for `false` say nothing was
   stored. (A banner on every tab and the status line also report it, but the screen that saved must
   not claim "saved".)
4. How parts, sealed docs, split values and conflict copies are stored: **`docs/DATA-FORMAT.md`**.
   Read it before touching the storage layer or reading the data from outside the app.

## Tests

5. **New screens get harness tests** (`scripts/p1-test.js` for screens, `scripts/storage-test.js` for
   the storage layer). Use the in-memory mock or the fake Firestore in `scripts/p1-check.js`
   (`openPage({ fakeFirestore })` runs the real `window.storage`). Never touch the live Firestore, its
   rules or the Cloud Functions from a test.
6. **Run the full harness before any PR** and put the result in the PR:
   `NODE_PATH=$(npm root -g) node scripts/harness.js`
   It runs the storage-layer check, the page-load check (no console errors), every screen scenario and
   the storage tests, and checks that `index.html` has no direct `api.anthropic.com` calls.

## Screens

- Sized for a 390-px phone screen; plain, literal words; fewest taps.
