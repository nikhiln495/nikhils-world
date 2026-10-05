// Static check: index.html may write to Firestore (db.collection(...).set/update/delete/add) or call
// localStorage.setItem ONLY inside the storage layer (between the NW-STORAGE-LAYER START / END markers)
// and the Drive token cache (NW-TOKEN-CACHE START / END). Any other place fails the harness.
// Run: node scripts/storage-layer-check.js [file]   (exit 1 on a violation)
const fs = require('fs');
const path = require('path');

const ALLOWED = [['NW-STORAGE-LAYER START', 'NW-STORAGE-LAYER END'], ['NW-TOKEN-CACHE START', 'NW-TOKEN-CACHE END']];

// Returns [{ line, text, why }] for every write outside the allowed ranges.
function check(html) {
  const lines = html.split('\n');
  const allowed = new Array(lines.length).fill(false);
  const problems = [];
  for (const [start, end] of ALLOWED) {
    const s = lines.findIndex(l => l.includes(start));
    const e = lines.findIndex((l, i) => i > s && l.includes(end));
    if (s < 0 || e < 0) { problems.push({ line: 0, text: '', why: `marker "${start}" / "${end}" not found` }); continue; }
    for (let i = s; i <= e; i++) allowed[i] = true;
  }
  // A Firestore write: a .collection( chain that reaches .set( / .update( / .delete( / .add( within the
  // same statement, or a .doc( handle written to. Any .collection( outside the layer is also flagged,
  // because every read and write goes through window.storage.
  const rules = [
    [/\.collection\s*\(/, 'Firestore access outside the storage layer'],
    [/\bfirebase\s*\.\s*firestore\s*\(\s*\)/, 'Firestore access outside the storage layer'],
    [/\.doc\s*\([^)]*\)\s*\.\s*(set|update|delete)\s*\(/, 'Firestore write outside the storage layer'],
    [/\blocalStorage\s*\.\s*setItem\s*\(/, 'localStorage.setItem outside the storage layer and the token cache'],
    [/\blocalStorage\s*\[\s*['"`]/, 'localStorage write by index outside the storage layer'],
  ];
  lines.forEach((l, i) => {
    if (allowed[i]) return;
    const code = l.replace(/\/\/.*$/, ''); // ignore line comments
    for (const [re, why] of rules) {
      if (re.test(code)) { problems.push({ line: i + 1, text: l.trim().slice(0, 160), why }); break; }
    }
  });
  return problems;
}

module.exports = { check };

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
  const problems = check(fs.readFileSync(file, 'utf8'));
  if (!problems.length) { console.log('storage-layer check: ok (no Firestore or localStorage writes outside the storage layer and the token cache)'); process.exit(0); }
  problems.forEach(p => console.log(`  ✗ ${path.basename(file)}:${p.line} ${p.why}: ${p.text}`));
  process.exit(1);
}
