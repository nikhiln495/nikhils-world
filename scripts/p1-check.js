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

async function openPage({ seed = {}, now = null, proxy = null, offline = false, timezoneId = 'America/Anchorage' } = {}) {
  const browser = await chromium.launch({
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, timezoneId });
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
      return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
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
    if ((/^https:\/\/unpkg\.com\//.test(url) || FONTS.test(url)) && route.request().method() === 'GET') {
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
    return route.continue();
  });

  await page.addInitScript(({ seed, now, offline }) => {
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
    const mem = new Map(Object.entries(seed));
    const log = [];
    const mock = {
      get: async (key) => { log.push(['get', key]); return mem.has(key) ? { value: mem.get(key) } : null; },
      set: async (key, value) => { log.push(['set', key]); mem.set(key, value); return true; },
      exportAll: async () => null,
      exportAllDocs: async () => null,
      isCloudReady: () => false,
    };
    // The page's own `window.storage = {...}` assignment is ignored (non-writable).
    Object.defineProperty(window, 'storage', { get: () => mock, set: () => {}, configurable: false });
    window.__mem = mem;
    window.__storageLog = log;
  }, { seed, now, offline });

  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => document.querySelector('nav button'), null, { timeout: 60000 });
  return { browser, page, errors, blocked, proxyCalls };
}

module.exports = { openPage };

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
