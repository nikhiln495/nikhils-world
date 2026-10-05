// Checks that the app opens without internet: the repo is served over localhost twice, at / (like
// https://nikhils-world.web.app/) and at /nikhils-world/ (like https://nikhiln495.github.io/nikhils-world/).
// At each address: open online, go offline, reload — the page comes from the service worker with no request
// reaching the network, shows this device's data, and a save is device-only; back online it uploads. After
// index.html (or sw.js) changes, the next online load runs the new version. The service worker never stores
// a Firestore, Google API, accounts.google.com or cloudfunctions.net response. Also: the manifest, icons and
// Apple tags, and sw.js's rules checked directly.
// The live Firestore is never touched (the page gets the fake Firestore from p1-check.js) and every Google
// request is answered locally. Run: NODE_PATH=$(npm root -g) node scripts/sw-test.js
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'; // lets the test answer the worker's own requests
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { openPage, pageInit, cdnFulfill, FONTS } = require('./p1-check');

const ROOT = path.join(__dirname, '..');
let failures = 0, passes = 0;
const ok = (cond, label) => { if (cond) { passes++; console.log('  ✓', label); } else { failures++; console.log('  ✗', label); } };
const NEVER = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|cloudfunctions\.net|firebaseio\.com)\/|^https:\/\/accounts\.google\.com\//;
const neverCached = (u) => NEVER.test(u) && !/^https:\/\/fonts\.googleapis\.com\//.test(u);

// The running version, computed the way the page does (every <script> in <body>, in order).
// HTML comments are skipped (one in <body> mentions a <script> tag in words).
function versionOf(html) {
  const body = html.slice(html.indexOf('<body>'));
  const parts = [];
  let i = 0;
  for (;;) {
    const c = body.indexOf('<!--', i), t = body.indexOf('<script', i);
    if (t < 0) break;
    if (c >= 0 && c < t) { i = body.indexOf('-->', c) + 3; continue; }
    const open = body.indexOf('>', t), close = body.indexOf('</script>', open);
    const src = /\ssrc="([^"]*)"/.exec(body.slice(t, open));
    parts.push(src ? 'src:' + src[1] : 'inline:' + body.slice(open + 1, close));
    i = close + 9;
  }
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 7);
}

// The repo over HTTP at / and at /nikhils-world/. `override` replaces a file's content (a new deploy).
function serve() {
  const state = { hits: [], override: {} };
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    state.hits.push(p);
    if (p.startsWith('/nikhils-world/')) p = p.slice('/nikhils-world'.length);
    else if (p === '/nikhils-world') { res.writeHead(301, { Location: '/nikhils-world/' }); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const rel = p.replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (rel.includes('..') || (!state.override[rel] && !(fs.existsSync(file) && fs.statSync(file).isFile()))) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(state.override[rel] !== undefined ? state.override[rel] : fs.readFileSync(file));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, state, port: server.address().port })));
}

async function oneAddress(browser, port, state, mount) {
  const base = `http://localhost:${port}${mount}`;
  console.log(`\n[Offline at ${base}]`);
  state.override = {};
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Anchorage' });
  let offline = false;
  const seen = [];
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    seen.push({ url, offline });
    if (offline) return route.abort('internetdisconnected');
    if (url.startsWith(`http://localhost:${port}/`)) return route.continue();
    if (/^https:\/\/unpkg\.com\//.test(url) || FONTS.test(url)) return cdnFulfill(route);
    if (/^https:\/\/www\.gstatic\.com\//.test(url) || /^https:\/\/accounts\.google\.com\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub */' });
    if (NEVER.test(url)) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{"stub":true}' });
    return route.abort();
  });
  // Kaizen needs its first-run flag; nothing else is seeded, so what shows offline can only be this device's copy.
  await context.addInitScript(pageInit, { fakeFirestore: { kaizen3_seeded: { key: 'kaizen3:seeded', value: 'true' }, kaizen3_projects: { key: 'kaizen3:projects', value: '[]' }, kaizen3_tasks: { key: 'kaizen3:tasks', value: '[]' } }, now: '2026-10-04T12:00:00' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push({ text: m.text(), url: (m.location() || {}).url || '' }); });
  page.on('pageerror', e => errors.push({ text: 'pageerror: ' + e.message, url: '' }));
  const navReady = () => page.waitForFunction(() => document.querySelector('nav button') && window.storage && window.storage.status, null, { timeout: 90000 });

  // 1. Online: the page loads, the worker takes over and stores what the page loaded.
  let t0 = Date.now();
  await page.goto(base);
  await navReady();
  const onlineMs = Date.now() - t0;
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    await document.fonts.ready;
    if (!navigator.serviceWorker.controller) await new Promise(res => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }));
    // Ask it to store everything loaded so far (the page does this too, at load and 10 seconds later).
    const done = new Promise(res => navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'nw-kept') res(true); }));
    const loaded = performance.getEntriesByType('resource').filter(e => /^(script|link|css)$/.test(e.initiatorType)).map(e => e.name);
    r.active.postMessage({ type: 'nw-keep', resources: loaded });
    await done;
    return { scope: r.scope, controlled: !!navigator.serviceWorker.controller };
  });
  ok(reg.scope === base && reg.controlled, `the service worker is registered with a relative path; its scope is ${reg.scope}`);
  const v1 = await page.evaluate(() => window.nwRunningVersion());
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-nw-version]') && /^[0-9a-f]{7}$/.test(document.querySelector('[data-nw-version]').textContent), null, { timeout: 10000 }).catch(() => {});
  const shownV1 = await page.locator('[data-nw-version]').textContent();
  ok(v1 === versionOf(html) && shownV1 === v1 && (await page.locator('[data-nw-offline]').textContent()) === 'yes', `the System tab shows the running version (${shownV1}, the hash of this index.html) and "Opens offline: yes"`);
  // Save on this device while online, through Kaizen.
  await page.getByRole('button', { name: 'Kaizen', exact: true }).click();
  await page.getByPlaceholder('If only one thing happens, what makes today a win?').fill('Online win');
  await page.waitForTimeout(1500);
  // Requests the worker must never store.
  await page.evaluate(async () => {
    for (const u of ['https://firestore.googleapis.com/v1/projects/nikhils-world/databases/(default)/documents/appdata/x', 'https://www.googleapis.com/drive/v3/files?q=x', 'https://oauth2.googleapis.com/tokeninfo', 'https://us-central1-nikhils-world.cloudfunctions.net/anthropic', 'https://accounts.google.com/gsi/client']) {
      try { await fetch(u); } catch (_) {}
    }
  });
  const cached = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map(r => r.url);
    return out;
  });
  const all = Object.values(cached).flat();
  ok(Object.keys(cached).sort().join('|') === [`nw-cdn:${base}`, `nw-files:${base}`, `nw-page:${base}`].filter(k => cached[k]).sort().join('|') && (cached[`nw-page:${base}`] || []).join() === base, 'caches are named for this address only; the page is stored under its own address');
  ok(['https://unpkg.com/react@18.3.1/umd/react.development.js', 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'].every(u => all.includes(u)) && all.some(u => /^https:\/\/fonts\.googleapis\.com\/css2/.test(u)) && all.some(u => /^https:\/\/fonts\.gstatic\.com\/.*\.woff2$/.test(u)), `scripts, styles and fonts from unpkg.com, www.gstatic.com, fonts.googleapis.com and fonts.gstatic.com are stored after their first load (${all.length} entries)`);
  ok(!all.some(neverCached), 'nothing from Firestore, another Google API, accounts.google.com or cloudfunctions.net is stored → ' + JSON.stringify(all.filter(neverCached)));

  // 2. Offline: reload. Everything comes from the worker; nothing reaches the network.
  offline = true;
  await context.setOffline(true);
  const hitsBefore = state.hits.length;
  const seenBefore = seen.length;
  errors.length = 0;
  t0 = Date.now();
  await page.reload();
  await navReady();
  const offlineMs = Date.now() - t0;
  // Everything that loaded while online must come from the worker. (A font file for characters the online
  // screens never used was never loaded, so it can't be stored yet; it is stored the first time it loads.)
  const loadedOnline = new Set(seen.slice(0, seenBefore).filter(x => !x.offline).map(x => x.url));
  const tried = seen.slice(seenBefore).filter(x => !neverCached(x.url) && !x.url.startsWith(`http://localhost:${port}/`));
  const reachedNet = tried.filter(x => loadedOnline.has(x.url));
  const neverLoaded = tried.filter(x => !loadedOnline.has(x.url) && /^https:\/\/fonts\.gstatic\.com\//.test(x.url)).length;
  ok(state.hits.length === hitsBefore && reachedNet.length === 0 && tried.length === neverLoaded, `offline, the page and every script, style and font it loaded online come from the service worker (the server got ${state.hits.length - hitsBefore} requests; ${reachedNet.length} stored files tried the network; ${neverLoaded} font files never loaded online)` + (reachedNet.length ? ' → ' + reachedNet.map(x => x.url).join(', ') : ''));
  ok(offlineMs <= onlineMs + 3000, `no network wait: offline load ${offlineMs} ms vs online ${onlineMs} ms`);
  const reads = await page.evaluate(async () => {
    const t = Date.now();
    await window.__dbReady;
    const r = await window.storage.get('kaizen4:logs');
    return { ms: Date.now() - t, online: navigator.onLine, today: r && JSON.parse(r.value)['2026-10-04'] };
  });
  await page.getByRole('button', { name: 'Kaizen', exact: true }).click();
  const win = await page.getByPlaceholder('If only one thing happens, what makes today a win?').inputValue();
  ok(!reads.online && reads.ms < 1000 && win === 'Online win', `offline, reads use this device's copy at once (${reads.ms} ms): Kaizen shows "${win}"`);
  await page.getByPlaceholder('If only one thing happens, what makes today a win?').fill('Offline win');
  await page.waitForTimeout(1500);
  const off = await page.evaluate(async () => ({ direct: await window.storage.set('swtest:offline', 'typed offline'), status: window.storage.status(), banner: (document.querySelector('[data-nw-banner="device-only"]') || {}).textContent || '' }));
  const pill = await page.locator('body').innerText();
  ok(off.direct === 'device-only' && off.status.waiting >= 2 && /saved on this device only, not in the cloud\. Reason: the device is offline\./.test(off.banner) && pill.includes('This device only'), 'a save while offline is device-only (Kaizen says "This device only"; the banner says the device is offline)');
  const badErrors = errors.filter(e => !(/Failed to load resource/.test(e.text) && (neverCached(e.url) || e.url === '' || (/^https:\/\/fonts\.gstatic\.com\//.test(e.url) && !loadedOnline.has(e.url)))));
  ok(badErrors.length === 0, 'offline: no console errors except failed requests to never-stored Google addresses (and font files never loaded online)' + (badErrors.length ? ' → ' + JSON.stringify(badErrors.slice(0, 3)) : ''));

  // 3. Back online: the waiting saves upload.
  offline = false;
  await context.setOffline(false);
  await page.waitForFunction(() => window.storage.status().waiting === 0, null, { timeout: 20000 }).catch(() => {});
  const up = await page.evaluate(() => ({ waiting: window.storage.status().waiting, logs: window.__fakeDocs.get('kaizen4_logs'), note: window.__fakeDocs.get('swtest_offline') }));
  ok(up.waiting === 0 && up.logs && JSON.parse(up.logs.value)['2026-10-04'].highlight === 'Offline win' && up.note && up.note.value === 'typed offline', 'back online, both waiting saves upload to the cloud');

  // 4. A new deploy: changed index.html (and sw.js) reach the device on the next online load.
  const html2 = html.replace('function App() {', 'function App() {\n  // deploy check: a new version');
  state.override['index.html'] = html2;
  // The new worker answers a test message, so the page can tell which worker is in charge.
  state.override['sw.js'] = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
    + "\n// deploy check: a new worker\nself.addEventListener('message', (e) => { if (e.data && e.data.type === 'nw-test-version' && e.source) e.source.postMessage({ type: 'nw-test-version', v: 2 }); });\n";
  await page.reload();
  await navReady();
  const v2 = await page.evaluate(() => window.nwRunningVersion());
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.waitForFunction((v) => (document.querySelector('[data-nw-version]') || {}).textContent === v, v2, { timeout: 10000 }).catch(() => {});
  const shownV2 = await page.locator('[data-nw-version]').textContent();
  ok(v2 === versionOf(html2) && v2 !== v1 && shownV2 === v2, `after index.html changes, the next online load runs it: the System tab shows ${shownV2} (was ${v1})`);
  const swTook = await page.evaluate(async () => {
    const ask = () => new Promise((res) => {
      const c = navigator.serviceWorker.controller;
      if (!c) return res(false);
      const on = (e) => { if (e.data && e.data.type === 'nw-test-version') { navigator.serviceWorker.removeEventListener('message', on); res(e.data.v === 2); } };
      navigator.serviceWorker.addEventListener('message', on);
      c.postMessage({ type: 'nw-test-version' });
      setTimeout(() => { navigator.serviceWorker.removeEventListener('message', on); res(false); }, 1000);
    });
    for (let i = 0; i < 30; i++) { if (await ask()) return true; await new Promise(r => setTimeout(r, 1000)); }
    return false;
  });
  ok(swTook, 'a changed sw.js installs and takes over by itself (nothing cleared by hand)');
  const cachedPage = await page.evaluate(async (base) => (await (await (await caches.open('nw-page:' + base)).match(base)).text()).includes('deploy check: a new version'), base);
  ok(cachedPage, 'the stored offline copy is now the new version');

  // 5. Manifest, icons and Apple tags (relative paths, so they work at this address).
  const man = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const r = await fetch(link.href);
    const m = await r.json();
    const icons = await Promise.all(m.icons.map(async i => { const x = await fetch(new URL(i.src, link.href)); return x.status; }));
    const touch = document.querySelector('link[rel="apple-touch-icon"]');
    return { href: link.href, status: r.status, m, icons, touch: touch && (await fetch(touch.href)).status, start: new URL(m.start_url, link.href).href, scope: new URL(m.scope, link.href).href,
      meta: ['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-mobile-web-app-title', 'mobile-web-app-capable', 'theme-color'].map(n => (document.querySelector(`meta[name="${n}"]`) || {}).content) };
  });
  ok(man.status === 200 && man.href === base + 'manifest.webmanifest' && man.start === base && man.scope === base && man.m.display === 'standalone', `the manifest loads from ${man.href}; start_url and scope resolve to ${man.start}; display standalone`);
  ok(man.icons.every(s => s === 200) && man.m.icons.some(i => i.sizes === '192x192') && man.m.icons.some(i => i.sizes === '512x512') && man.m.icons.some(i => i.purpose === 'maskable') && man.touch === 200, 'the icons (192, 512, maskable, Apple 180) load at this address');
  ok(JSON.stringify(man.meta) === JSON.stringify(['yes', 'black-translucent', "Nikhil's World", 'yes', '#0f0f0f']), 'Apple tags for "Add to Home Screen" full screen: ' + man.meta.join(', '));

  // 6. The kill switch in CLAUDE.md: removes the stored copy, unregisters, and doesn't reload forever.
  const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const kill = (/```js\n(\/\/ sw\.js — kill switch[\s\S]*?)```/.exec(claude.replace(/^  /gm, '')) || [])[1];
  state.override['sw.js'] = kill;
  let loads = 0;
  page.on('load', () => { loads++; });
  await page.reload();
  await navReady();
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++) {
    // The kill switch reloads the tab once, so a check can be cut short; just try again.
    gone = await page.evaluate(async (base) => !(await navigator.serviceWorker.getRegistration()) && !(await caches.keys()).some(k => k.endsWith(':' + base)), base).catch(() => false);
    if (!gone) await page.waitForTimeout(500);
  }
  await page.waitForTimeout(8000);
  const loadsAfter = loads;
  await page.waitForTimeout(6000);
  await navReady();
  ok(!!kill && gone && loads === loadsAfter && loads <= 3, `the kill-switch sw.js from CLAUDE.md removes the stored copy and unregisters; the page reloads ${loads} time(s), then stops, and still opens from the network`);
  await context.close();
  return v1;
}

// sw.js's rules, checked directly (no browser).
function rules() {
  console.log('\n[sw.js rules]');
  const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const sandbox = { self: { registration: { scope: 'https://nikhiln495.github.io/nikhils-world/' }, location: { origin: 'https://nikhiln495.github.io', href: 'https://nikhiln495.github.io/nikhils-world/sw.js' }, addEventListener() {} }, URL, Headers: function () {}, Response: function () {}, caches: {}, fetch() {}, setTimeout, clearTimeout, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const k = (url, destination = '', mode = 'cors', method = 'GET') => sandbox.kindOf({ url, destination, mode, method });
  const cases = [
    ['https://nikhiln495.github.io/nikhils-world/', 'document', 'navigate', 'page'],
    ['https://nikhiln495.github.io/nikhils-world/index.html', 'document', 'navigate', 'page'],
    ['https://nikhiln495.github.io/other-repo/', 'document', 'navigate', null],
    ['https://nikhiln495.github.io/nikhils-world/icons/icon-192.png', 'image', 'no-cors', 'file'],
    ['https://nikhiln495.github.io/nikhils-world/docs/DATA-FORMAT.md', 'document', 'navigate', null],
    ['https://unpkg.com/react@18.3.1/umd/react.development.js', 'script', 'cors', 'cdn'],
    ['https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'script', 'no-cors', 'cdn'],
    ['https://fonts.googleapis.com/css2?family=DM+Sans', 'style', 'no-cors', 'cdn'],
    ['https://fonts.gstatic.com/s/dmsans/v17/x.woff2', 'font', 'cors', 'cdn'],
    ['https://cdn.example.org/lib@1.2.3/lib.min.js', 'script', 'cors', 'cdn'],
    ['https://cdn.example.org/data.json', '', 'cors', null],
    ['https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel', '', 'cors', null],
    ['https://www.googleapis.com/drive/v3/files', '', 'cors', null],
    ['https://apis.googleapis.com/x.js', 'script', 'no-cors', null],
    ['https://accounts.google.com/gsi/client', 'script', 'no-cors', null],
    ['https://us-central1-nikhils-world.cloudfunctions.net/anthropic', '', 'cors', null],
    ['https://nikhils-world-default-rtdb.firebaseio.com/x.js', 'script', 'no-cors', null],
  ];
  const wrong = cases.filter(([u, d, m, want]) => k(u, d, m) !== want).map(([u, , , want]) => `${u} → ${k(u)} (want ${want})`);
  ok(wrong.length === 0, 'page / files / scripts, styles and fonts from any other site are handled; Firestore, other Google APIs, accounts.google.com, cloudfunctions.net and firebaseio.com never are' + (wrong.length ? ' → ' + wrong.join('; ') : ''));
  ok(k('https://unpkg.com/x.js', 'script', 'cors', 'POST') === null, 'only GET requests are ever stored');
}

(async () => {
  rules();
  // Make sure the CDN files are in the harness's disk cache (the browser below has no proxy, so localhost is reachable).
  const warm = await openPage({ seed: {} });
  await warm.browser.close();
  const { server, state, port } = await serve();
  const browser = await chromium.launch();
  try {
    const a = await oneAddress(browser, port, state, '/');
    const b = await oneAddress(browser, port, state, '/nikhils-world/');
    ok(a === b, `the same index.html shows the same version at both addresses (${a})`);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
