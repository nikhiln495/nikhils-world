# Rules for working on Nikhil's World

The app is one file, `index.html` (React via Babel in the browser, Firestore for data). Grep for what
you need; don't read it end to end.

## Two addresses, no build step

The same `main` branch is served at two addresses, and **every change must work at both**:

- **https://nikhils-world.web.app/** — Firebase Hosting, deployed by `.github/workflows/firebase-deploy.yml`
  on every push to `main`. This is the one Nikhil uses.
- **https://nikhiln495.github.io/nikhils-world/** — GitHub Pages, straight from `main`'s root, under the
  `/nikhils-world/` sub-path. There is no build step.

So: every path is relative (`sw.js`, `manifest.webmanifest`, `icons/…` — never a leading `/`), nothing
depends on which host serves the page, and nothing needs a build step. `scripts/sw-test.js` serves the repo
at `/` and at `/nikhils-world/` and checks both.

## Offline

The app opens and saves without internet (`sw.js`, registered at the end of `index.html`):

- The page is network first (a new deploy reaches the device on its next online open); the stored copy is
  used offline, or when the network hasn't answered in 3 seconds.
- Scripts, styles and fonts from other sites are stored on their first load and served from storage after
  that. **Outside scripts use pinned versions in the URL** (`react@18.3.1`, `firebasejs/10.12.2`), so a
  stored copy is never stale. (The one exception is `accounts.google.com/gsi/client`, which Google doesn't
  version; it is never stored.) Firestore, other Google APIs, `accounts.google.com` and
  `cloudfunctions.net` are never stored.
- **Every feature must open and save offline using this device's copy.** Read through `window.storage`
  (offline, `get`/`getAll` answer from this device's copy at once) and never wait on a network call before
  showing the screen. A save offline returns `'device-only'` and uploads when the device is back online.
- The System tab shows the running version: a short hash of the page's scripts. The same file gives the
  same version at both addresses; any code change gives a new one. Nothing to bump by hand.
- **If loading ever breaks because of the service worker**, replace `sw.js` with this and push to `main`
  (both addresses pick it up on their next online open). It removes its stored copies, unregisters itself
  and reloads open tabs from the network. Restore the real `sw.js` once the fix is in.

  ```js
  // sw.js — kill switch: removes the offline copy and unregisters.
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      const ours = (await caches.keys()).filter(k => k.endsWith(':' + self.registration.scope));
      await Promise.all(ours.map(k => caches.delete(k)));
      await self.registration.unregister();
      // Reload open tabs only if there was a copy to remove (the page registers sw.js again on every load,
      // so this keeps it from reloading forever).
      if (ours.length) for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
    })());
  });
  ```

## Data

1. **Every read and write goes through `window.storage`.** No feature calls Firestore
   (`db.collection(...)`) or `localStorage.setItem` itself. The only exceptions are the storage layer
   (between `NW-STORAGE-LAYER START` and `NW-STORAGE-LAYER END`) and the Drive token cache
   (`NW-TOKEN-CACHE`). `scripts/storage-layer-check.js` fails the harness otherwise.
   - `get(key)` → `{ value } | null` — the whole value (for a key in `SEALED_LOG_KEYS`: the active doc).
   - `getAll(key)` → the whole history (sealed parts + active, merged in order, deleted items left out).
     Use it on every screen that shows history.
   - `set(key, value)` → `'cloud' | 'device-only' | false`.
   - `deleteItem(key, { date } | { id } | { index }, { value })`, `restoreItem(key, …)`,
     `deletedItems(key)` — deletes for keys in `SEALED_LOG_KEYS` (see 2).
   - `listPrefix(prefix)`, `exportRawDocs()`, `setDoc(id, fields)`, `setExact(key, value)` (backups only).
2. **Nothing seals unless its key is in `SEALED_LOG_KEYS`** (one constant in the storage layer; today only
   `kaizen4:logs`). Every other key is stored whole: over 900,000 bytes it is split into pieces by itself,
   and a banner warns when a key passes 1.5 MB. Add a key to `SEALED_LOG_KEYS` only for a log that grows
   forever and is read with `getAll`; for those, the oldest items move into read-only sealed parts at
   800,000 bytes. Don't build your own rollover or archive docs, and never write, rewrite or delete a part
   doc.
   **Every item stays editable and deletable.** An edit is saved in the active doc and wins over the copy
   in a part. A delete of an item that has a copy in a part goes through `window.storage.deleteItem`: it
   removes the item from the active doc and adds a deleted marker there; the part keeps the original, and
   `restoreItem` (removing the marker) brings it back. Kaizen's Reflect shows "Deleted days" with Restore.
3. **Every save shows cloud vs device.** Check what `set` returned: say "saved" only for `'cloud'`; for
   `'device-only'` say it is on this device only, not in the cloud yet; for `false` say nothing was
   stored. (A banner on every tab and the status line also report it, but the screen that saved must
   not claim "saved".)
4. How parts, sealed docs, deleted markers, split values and conflict copies are stored, and the backup
   file format: **`docs/DATA-FORMAT.md`**. Read it before touching the storage layer or reading the data
   from outside the app. The Drive backup that runs on its own is `tools/drive-backup.gs`
   (setup: `docs/DRIVE-AUTO-BACKUP.md`); its merge must keep matching `getAll`.

## No secrets

The repo may be public. Never commit secrets: no tokens, passwords, service-account files or private keys.
(The Firebase web config in `index.html` is a public identifier, not a secret; the data is guarded by the
Firestore rules. The Drive token stays in the browser only.) `tools/drive-backup.gs` holds no keys: it runs
as Nikhil's own Google account.

## Tests

5. **New screens get harness tests** (`scripts/p1-test.js` for screens, `scripts/storage-test.js` for
   the storage layer, `scripts/backup-test.js` for backups and Drive, `scripts/sw-test.js` for offline).
   Use the in-memory mock or the fake Firestore in `scripts/p1-check.js` (`openPage({ fakeFirestore })`
   runs the real `window.storage`). Never touch the live Firestore, its rules, the Cloud Functions or
   Google Drive from a test; mock every Google request.
6. **Run the full harness before any PR** and put the result in the PR:
   `NODE_PATH=$(npm root -g) node scripts/harness.js`
   It runs the storage-layer check, the page-load check (no console errors), every screen scenario, the
   storage, backup and offline tests, and checks that `index.html` has no direct `api.anthropic.com` calls.

## Screens

- Sized for a 390-px phone screen; plain, literal words; fewest taps.
