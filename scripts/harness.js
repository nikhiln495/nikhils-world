// The full harness. Run before every PR:  NODE_PATH=$(npm root -g) node scripts/harness.js
// 1. storage-layer-check.js — no Firestore / localStorage writes outside the storage layer and token cache
// 2. p1-check.js            — the page loads with no console errors
// 3. p1-test.js all         — every screen's scenarios (Practice tab, backups)
// 4. storage-test.js all    — honest saves, upload queue, seal and continue, split values, sizes, restore
// Plus: index.html must not call api.anthropic.com directly (everything goes through the AI proxy).
// The live Firestore is never touched: every run uses an in-memory mock or fake Firestore.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const steps = [
  ['storage-layer check', ['storage-layer-check.js']],
  ['page load', ['p1-check.js']],
  ['screen scenarios', ['p1-test.js', 'all']],
  ['storage layer', ['storage-test.js', 'all']],
];
const results = [];
const html = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf8');
const direct = (html.match(/api\.anthropic\.com/g) || []).length;
results.push(['no direct api.anthropic.com calls', direct === 0, `${direct} found`]);
for (const [label, args] of steps) {
  console.log(`\n══ ${label}: node scripts/${args.join(' ')}`);
  const r = spawnSync(process.execPath, args.map((a, i) => (i === 0 ? path.join(dir, a) : a)), { stdio: ['ignore', 'pipe', 'inherit'], env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout || '');
  const summary = ((r.stdout || '').match(/\d+ passed, \d+ failed/g) || []).pop() || (r.status === 0 ? 'ok' : 'failed');
  results.push([label, r.status === 0, summary]);
}
console.log('\n══ Summary');
results.forEach(([label, pass, note]) => console.log(`  ${pass ? '✓' : '✗'} ${label} — ${note}`));
process.exit(results.every(r => r[1]) ? 0 : 1);
