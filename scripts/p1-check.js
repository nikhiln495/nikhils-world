// Local check harness for the Practice tab (Spec P1).
// Loads index.html in headless Chromium with window.storage replaced by an
// in-memory mock, and every Firebase / Firestore / Google request aborted, so
// the live database is never read or written. The AI proxy is answered by a
// local fake. Run: NODE_PATH=$(npm root -g) node scripts/p1-check.js [scenario]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ORIGIN = 'https://nikhils-world.web.app';
const os = require('os');
const crypto = require('crypto');
// CDN scripts (React, Babel, lucide, recharts) are cached on disk between runs.
const CACHE_DIR = process.env.P1_CDN_CACHE || path.join(os.tmpdir(), 'p1-cdn-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const BLOCK = [
  /firestore\.googleapis\.com/, /firebase/i, /gstatic\.com/, /accounts\.google\.com/,
  /googleapis\.com/, /api\.anthropic\.com/,
];
const isBlocked = (url) => !FONTS.test(url) && BLOCK.some(re => re.test(url));

// Answers a GET to unpkg.com or Google Fonts from the disk cache (fetched once through the proxy).
async function cdnFulfill(route) {
  const url = route.request().url();
  const f = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex'));
  if (fs.existsSync(f)) {
    const c = JSON.parse(fs.readFileSync(f + '.json', 'utf8'));
    return route.fulfill({ status: 200, headers: c.headers, body: fs.readFileSync(f) });
  }
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await route.fetch({ timeout: 30000 });
      if (resp.status() === 200) {
        const body = await resp.body();
        const headers = { 'content-type': resp.headers()['content-type'] || 'application/javascript', 'access-control-allow-origin': '*' };
        fs.writeFileSync(f, body); fs.writeFileSync(f + '.json', JSON.stringify({ headers }));
        return route.fulfill({ status: 200, headers, body });
      }
    } catch (_) {}
  }
  return route.abort();
}

// Runs in the page before its own scripts: the fixed clock, offline, and either the in-memory window.storage
// mock or the fake Firestore (see openPage). Exported for scripts/sw-test.js.
function pageInit({ seed, now, offline, noList, fakeFirestore }) {
    if (now) {
      const fixed = new Date(now).getTime();
      const start = Date.now();
      const RealDate = Date;
      class FakeDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(fixed + (RealDate.now() - start)); else super(...a); }
        static now() { return fixed + (RealDate.now() - start); }
      }
      window.Date = FakeDate;
    }
    if (offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    if (fakeFirestore) {
      const docs = new Map(Object.entries(fakeFirestore));
      const calls = [];
      const order = [];
      window.__fakeFail = null;
      // A test can make one op fail ('reject' or an Error) or never settle ('hang').
      const gate = (op, id, data, apply) => {
        const f = typeof window.__fakeFail === 'function' ? window.__fakeFail(op, id, data) : null;
        if (f === 'hang') return new Promise(() => {});
        if (f && typeof f.then === 'function') return f.then(() => apply());
        if (f === 'reject') return Promise.reject(Object.assign(new Error('Document exceeds the maximum size'), { code: 'invalid-argument' }));
        if (f instanceof Error) return Promise.reject(f);
        return null;
      };
      const ID = '__name__';
      const snapOf = (list) => ({ docs: list, forEach: (fn) => list.forEach(fn) });
      const docSnap = (id) => ({ id, exists: docs.has(id), data: () => docs.get(id) });
      const query = (conds) => ({
        where: (f, op, v) => query([...conds, [f, op, v]]),
        get: async () => {
          calls.push(['query', conds.map(c => c.slice(1))]);
          const ok = (id) => conds.every(([f, op, v]) => f !== ID || (op === '>=' ? id >= v : op === '<' ? id < v : false));
          return snapOf([...docs.keys()].filter(ok).sort().map(docSnap));
        },
      });
      const coll = {
        doc: (id) => ({
          get: () => { calls.push(['get', id]); return gate('get', id) || Promise.resolve(docSnap(id)); },
          // Stored as given (Dates stay Dates), like the SDK; merge isn't used by the app.
          set: (v) => {
            calls.push(['set', id]);
            const apply = () => { order.push('set ' + id); docs.set(id, v); };
            const g = gate('set', id, v, apply);
            if (g) return g;
            try { apply(); } catch (e) { return Promise.reject(e); }
            return Promise.resolve();
          },
          delete: () => {
            calls.push(['delete', id]);
            const apply = () => { order.push('delete ' + id); docs.delete(id); };
            return gate('delete', id, null, apply) || (apply(), Promise.resolve());
          },
        }),
        where: (f, op, v) => query([[f, op, v]]),
        get: async () => { calls.push(['getAll']); return snapOf([...docs.keys()].map(docSnap)); },
      };
      const db = { settings() {}, collection: () => coll };
      const fs = () => db;
      fs.FieldPath = { documentId: () => ID };
      window.firebase = { apps: [], initializeApp() { this.apps.push({}); }, firestore: fs };
      window.__fakeDocs = docs;
      window.__fakeCalls = calls;
      window.__fakeOrder = order;
      return;
    }
    const mem = new Map(Object.entries(seed));
    const log = [];
    const mock = {
      get: async (key) => { log.push(['get', key]); return mem.has(key) ? { value: mem.get(key) } : null; },
      getAll: async (key) => { log.push(['get', key]); return mem.has(key) ? { value: mem.get(key) } : null; },
      set: async (key, value) => { log.push(['set', key]); mem.set(key, value); return 'cloud'; },
      exportAll: async () => null,
      exportAllDocs: async () => null,
      isCloudReady: () => false,
    };
    if (!noList) mock.listPrefix = async (prefix) => {
      log.push(['list', prefix]);
      return [...mem.keys()].filter(k => k.startsWith(prefix)).map(k => ({ id: k.replace(/[:/.#$[\]]/g, '_'), key: k, value: mem.get(k) }));
    };
    // The page's own `window.storage = {...}` assignment is ignored (non-writable).
    Object.defineProperty(window, 'storage', { get: () => mock, set: () => {}, configurable: false });
    window.__mem = mem;
    window.__storageLog = log;
}

// fakeFirestore: { docId: {value, key?} } — instead of mocking window.storage, run the page's REAL
// window.storage against an in-memory stand-in for the Firestore compat API (the real SDK stays blocked).
// In that mode the page also gets window.__fakeFail = (op, id, data) => null | 'reject' | 'hang' | Error
// (set by a test) to make a cloud write or read fail, never settle, or (a Promise) land only when that
// Promise resolves; and window.__fakeOrder, the order
// of every write ('set id' / 'delete id').
// html: a function that changes the page's HTML before it is served (e.g. a test-only SEALED_LOG_KEYS).
// The service worker is blocked here (scripts/sw-test.js covers it), and every other file at ORIGIN is served
// from the repo, so the live site is never asked for anything.
async function openPage({ seed = {}, now = null, proxy = null, offline = false, timezoneId = 'America/Anchorage', noList = false, fakeFirestore = null, html = null } = {}) {
  const browser = await chromium.launch({
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, timezoneId, serviceWorkers: 'block' });
  const BODY = html ? html(HTML) : HTML;
  try { await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN }); } catch (_) {}
  const page = await context.newPage();
  const errors = [];
  const blocked = [];
  const proxyCalls = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const where = (m.location() || {}).url || '';
    // Aborted Firebase/Google requests are expected; count them separately.
    if (/Failed to load resource/.test(m.text()) && isBlocked(where)) return;
    errors.push(m.text() + (where ? ' @ ' + where : ''));
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === ORIGIN + '/' || url === ORIGIN + '/index.html') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: BODY });
    }
    if (url.startsWith(ORIGIN + '/')) {
      const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
      const file = path.join(__dirname, '..', rel);
      if (rel && !rel.includes('..') && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ status: 200, body: fs.readFileSync(file) });
      return route.fulfill({ status: 404, body: '' });
    }
    if (/cloudfunctions\.net\/anthropic/.test(url)) {
      let body = null;
      try { body = JSON.parse(route.request().postData() || 'null'); } catch (_) {}
      proxyCalls.push(body);
      if (!proxy) return route.abort();
      const r = await proxy(body);
      return route.fulfill({ status: r.status || 200, contentType: 'application/json', body: JSON.stringify(r.json) });
    }
    if (isBlocked(url)) { blocked.push(url); return route.abort(); }
    if ((/^https:\/\/unpkg\.com\//.test(url) || FONTS.test(url)) && route.request().method() === 'GET') return cdnFulfill(route);
    return route.continue();
  });

  await page.addInitScript(pageInit, { seed, now, offline, noList, fakeFirestore });

  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => document.querySelector('nav button'), null, { timeout: 60000 });
  return { browser, page, errors, blocked, proxyCalls };
}

module.exports = { openPage, pageInit, cdnFulfill, isBlocked, FONTS };

if (require.main === module) {
  (async () => {
    const { browser, page, errors, blocked } = await openPage();
    await page.waitForTimeout(4000);
    const labels = await page.$$eval('nav button', bs => bs.map(b => b.textContent.trim()));
    console.log('nav:', labels.join(' | '));
    console.log('console errors:', errors.length ? errors : 'none');
    console.log('blocked requests:', blocked.length);
    await browser.close();
    process.exit(errors.length ? 1 : 0);
  })();
}
