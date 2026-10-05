// Nikhil's World service worker: keeps a copy of the app so it opens without internet.
// Registered by index.html with a relative path, so its scope is the folder it sits in: https://nikhils-world.web.app/
// and https://nikhiln495.github.io/nikhils-world/ each get their own copy (cache names include the scope).
//
// • The page (the scope URL, or index.html in it): network first. If the network fails, or hasn't answered
//   within 3 seconds while a copy is here, the copy is used. Every page that loads from the network
//   replaces the copy, so a new deploy reaches the device on its next online open.
// • Scripts, styles and fonts from other sites (unpkg.com, www.gstatic.com, fonts.googleapis.com,
//   fonts.gstatic.com, and any added later): cached on their first successful load, then served from the
//   cache. There is no list to keep up to date: the page tells this worker which ones it loaded. The page
//   pins their versions in the URL. A response the browser can't read the status of (an "opaque" one) is
//   also fetched again in the background on each online open, so a bad copy fixes itself.
// • Other files next to the page (manifest, icons): network first, cached copy when offline.
// • Never cached: anything that isn't a GET, Firestore and every other Google API (*.googleapis.com except
//   fonts.googleapis.com), accounts.google.com, *.cloudfunctions.net, *.firebaseio.com.
//
// If loading ever breaks because of this file, ship the self-unregistering sw.js in CLAUDE.md.

const SCOPE = self.registration.scope;
const PAGE_CACHE = 'nw-page:' + SCOPE;
const CDN_CACHE = 'nw-cdn:' + SCOPE;
const FILES_CACHE = 'nw-files:' + SCOPE;
const OURS = [PAGE_CACHE, CDN_CACHE, FILES_CACHE];
const PAGE_WAIT_MS = 3000;

// True for responses that must never be stored.
function neverCache(url) {
  const h = url.hostname;
  const under = (d) => h === d || h.endsWith('.' + d);
  if (under('accounts.google.com')) return true;
  if (under('cloudfunctions.net')) return true;
  if (under('firebaseio.com')) return true;
  if (under('googleapis.com') && h !== 'fonts.googleapis.com') return true;
  return false;
}

function isPage(url) {
  const base = new URL(SCOPE);
  return url.origin === base.origin && (url.pathname === base.pathname || url.pathname === base.pathname + 'index.html');
}

// 'page' | 'cdn' | 'file' | null (null: the browser handles it and nothing is stored).
function kindOf(request) {
  if (request.method !== 'GET') return null;
  let url;
  try { url = new URL(request.url); } catch (_) { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (neverCache(url)) return null;
  if (url.origin === self.location.origin) {
    if (isPage(url)) return 'page';
    if (request.mode === 'navigate' || !url.href.startsWith(SCOPE) || url.pathname === new URL(self.location.href).pathname) return null;
    return 'file';
  }
  const d = request.destination;
  return d === 'script' || d === 'style' || d === 'font' ? 'cdn' : null;
}

// A copy of a page response with the time it was saved (shown on the System tab).
async function stamped(r) {
  const headers = new Headers(r.headers);
  headers.set('x-nw-saved-at', new Date().toISOString());
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers });
}
const isHtml = (r) => !!r && r.ok && (r.headers.get('content-type') || '').includes('text/html');

// Fetches the page from the network (never the browser's HTTP cache) and, if it is a good HTML page,
// stores it as the copy.
function pageFromNetwork() {
  return fetch(SCOPE, { cache: 'no-cache', credentials: 'same-origin' }).then(async (r) => {
    if (isHtml(r)) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(SCOPE, await stamped(r.clone()));
    }
    return r;
  });
}

// A response safe to answer a navigation with (a redirected one isn't).
async function plain(r) {
  if (!r.redirected) return r;
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });
}

const NO_COPY = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>Nikhil\'s World</title><body style="background:#0f0f0f;color:#ddd;font:16px system-ui,sans-serif;padding:24px">'
  + '<p>Nikhil\'s World needs the internet the first time it opens on this device. Connect and reload.</p></body>';

function servePage(event) {
  const net = pageFromNetwork();
  event.waitUntil(net.catch(() => {})); // finish saving the new copy even after answering
  return (async () => {
    const copy = await (await caches.open(PAGE_CACHE)).match(SCOPE);
    if (!copy) {
      try { return await plain(await net); }
      catch (_) { return new Response(NO_COPY, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    }
    let timer;
    const late = new Promise((res) => { timer = setTimeout(() => res(null), PAGE_WAIT_MS); });
    const r = await Promise.race([net.catch(() => null), late]);
    clearTimeout(timer);
    return r && r.ok ? plain(r) : copy;
  })();
}

const keepable = (r) => !!r && (r.ok || r.type === 'opaque');

async function serveCdn(event) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(event.request, { ignoreVary: true });
  if (hit) {
    if (hit.type === 'opaque') {
      event.waitUntil(fetch(event.request).then(r => (keepable(r) ? cache.put(event.request, r) : null)).catch(() => {}));
    }
    return hit;
  }
  const r = await fetch(event.request);
  if (keepable(r)) { try { await cache.put(event.request, r.clone()); } catch (_) {} }
  return r;
}

async function serveFile(request) {
  const cache = await caches.open(FILES_CACHE);
  try {
    const r = await fetch(request);
    if (r.ok) { try { await cache.put(request, r.clone()); } catch (_) {} }
    return r;
  } catch (e) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const kind = kindOf(event.request);
  if (kind === 'page') event.respondWith(servePage(event));
  else if (kind === 'cdn') event.respondWith(serveCdn(event));
  else if (kind === 'file') event.respondWith(serveFile(event.request));
});

// The page lists what it loaded before this worker was in charge (its first open): the page itself, and
// the scripts and styles from other sites. Anything not stored yet is fetched and stored now, and so are the
// font files that each stored stylesheet's @font-face rules point to (browsers don't list font files).
async function store(cdn, href) {
  let url;
  try { url = new URL(href); } catch (_) { return; }
  if (neverCache(url) || url.origin === self.location.origin) return;
  if (await cdn.match(url.href, { ignoreVary: true })) return;
  let r = null;
  try { r = await fetch(url.href, { mode: 'cors' }); } catch (_) { r = null; }
  if (!r || !r.ok) { try { r = await fetch(url.href, { mode: 'no-cors' }); } catch (_) { r = null; } }
  if (keepable(r)) { try { await cdn.put(url.href, r); } catch (_) {} }
}
async function keep(urls) {
  const cdn = await caches.open(CDN_CACHE);
  for (const u of urls || []) await store(cdn, u);
  for (const req of await cdn.keys()) {
    const r = await cdn.match(req);
    if (!r || r.type === 'opaque' || !/text\/css/.test(r.headers.get('content-type') || '')) continue;
    const css = await r.text();
    const fonts = (css.match(/@font-face\s*{[^}]*}/g) || []).flatMap(b => (b.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g) || []).map(x => x.replace(/^url\(\s*['"]?|['"]?\s*\)$/g, '')));
    for (const f of fonts) { try { await store(cdn, new URL(f, req.url).href); } catch (_) {} }
  }
}
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type !== 'nw-keep') return;
  const page = (async () => {
    if (!(await (await caches.open(PAGE_CACHE)).match(SCOPE))) await pageFromNetwork().catch(() => {});
  })();
  event.waitUntil(Promise.all([page, keep(d.resources)]).then(() => {
    if (event.source && event.source.postMessage) event.source.postMessage({ type: 'nw-kept' });
  }));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  // Only this scope's own old caches are removed (other apps on the same site keep theirs).
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => /^nw-[a-z]+:/.test(k) && k.slice(k.indexOf(':') + 1) === SCOPE && !OURS.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
