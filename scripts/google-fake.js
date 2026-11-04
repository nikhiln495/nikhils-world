// Fake Google (Sheets, Docs, Drive) for the harness. The real Google, the real Ledger and the real Brain Dump are
// never called: openPage({ google: fake.handler }) answers these requests from memory and records every call.
//
//   const fake = makeGoogle({ sheet: { Ledger: [[...header], [...row]], Rules: [[...]] }, doc: { title, paras: [{ text, style }] } });
//   fake.calls            every request: { method, url, body }
//   fake.sheets[tab]      the cells (rows of values); a test may change them to simulate a moved row
//   fake.doc              { id, title, revision, paras: [{ text, style }] }
//   fake.apiDisabled      'sheets' | 'docs' → 403 "API has not been used" for that API
const SHEET_ID = 'FAKE_SHEET_ID_0123456789abcdef';
const DOC_ID = 'FAKE_DOC_ID_0123456789';

const colIndex = (letters) => letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const asText = (v) => (v === true ? 'TRUE' : v === false ? 'FALSE' : v == null ? '' : String(v));

function makeGoogle({ sheet = {}, formulas = null, doc = null, driveFiles = null, sheetId = SHEET_ID, docId = DOC_ID } = {}) {
  const calls = [];
  const F = {
    calls, SHEET_ID: sheetId, DOC_ID: docId,
    sheets: JSON.parse(JSON.stringify(sheet)),
    formulas,                      // optional { Ledger: [[...]] } served for valueRenderOption=FORMULA
    apiDisabled: null,
    doc: doc ? { id: docId, title: doc.title, revision: 1, paras: JSON.parse(JSON.stringify(doc.paras || [])) } : null,
    driveFiles: driveFiles || (doc ? [{ id: docId, name: doc.title, modifiedTime: '2026-11-02T10:00:00Z' }] : []),
    staleOnce: 0,                  // the next N Docs reads are followed by another writer's change (revision moves)
    reads: { docs: 0 },
    writes: [],                    // { api, ... } every accepted write
  };

  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
  const err = (route, status, message, extra = {}) => json(route, status, { error: { code: status, message, ...extra } });

  // ── Sheets ──
  const rangeOf = (a1) => {
    const [tab, rest] = decodeURIComponent(a1).split('!');
    if (!rest) return { tab, whole: true };
    let m = rest.match(/^(\d+):(\d+)$/);
    if (m) return { tab, row1: +m[1], row2: +m[2], whole: false, rowsOnly: true };
    m = rest.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (m) return { tab, col1: colIndex(m[1]), row1: +m[2], col2: m[3] ? colIndex(m[3]) : colIndex(m[1]), row2: m[4] ? +m[4] : +m[2], whole: false };
    m = rest.match(/^([A-Z]+)\d*:?$/);
    return { tab, whole: true, appendAt: true };
  };
  const view = (tab, render) => {
    const src = (render === 'FORMULA' && F.formulas && F.formulas[tab]) ? F.formulas[tab] : F.sheets[tab];
    if (!src) return null;
    return src.map(r => r.map(c => (render === 'FORMATTED_VALUE' || !render ? asText(c) : c)));
  };
  const trimmed = (rows) => rows.map(r => { const o = r.slice(); while (o.length && (o[o.length - 1] === '' || o[o.length - 1] == null)) o.pop(); return o; });

  async function sheets(route, url, req) {
    if (F.apiDisabled === 'sheets') return err(route, 403, 'Google Sheets API has not been used in project 55888993304 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/sheets.googleapis.com', { status: 'PERMISSION_DENIED', errors: [{ reason: 'accessNotConfigured' }] });
    const u = new URL(url);
    const m = u.pathname.match(/^\/v4\/spreadsheets\/([^/]+)(\/.*)?$/);
    if (!m) return err(route, 404, 'Not found');
    if (m[1] !== F.SHEET_ID) return err(route, 404, 'Requested entity was not found.');
    const rest = m[2] || '';
    const render = u.searchParams.get('valueRenderOption') || 'FORMATTED_VALUE';
    if (req.method() === 'GET' && rest === '/values:batchGet') {
      const ranges = u.searchParams.getAll('ranges');
      const valueRanges = ranges.map(r => { const t = rangeOf(r).tab; const v = view(t, render); return { range: r, values: v ? trimmed(v) : undefined }; });
      return json(route, 200, { spreadsheetId: m[1], valueRanges });
    }
    if (req.method() === 'GET' && rest.startsWith('/values/')) {
      const r = rangeOf(rest.slice('/values/'.length));
      const v = view(r.tab, render);
      if (!v) return err(route, 400, `Unable to parse range: ${r.tab}`);
      if (r.whole) return json(route, 200, { range: r.tab, values: trimmed(v) });
      if (r.rowsOnly) return json(route, 200, { range: `${r.tab}!${r.row1}:${r.row2}`, values: trimmed(v.slice(r.row1 - 1, r.row2)) });
      return json(route, 200, { range: r.tab, values: trimmed(v.slice(r.row1 - 1, r.row2).map(row => row.slice(r.col1, r.col2 + 1))) });
    }
    if (req.method() === 'POST' && rest === '/values:batchUpdate') {
      const body = req.postDataJSON();
      body.data.forEach(d => {
        const r = rangeOf(d.range);
        const t = F.sheets[r.tab];
        d.values.forEach((line, k) => line.forEach((val, j) => {
          const row = r.row1 - 1 + k, col = r.col1 + j;
          while (t.length <= row) t.push([]);
          while (t[row].length <= col) t[row].push('');
          if (val !== null) t[row][col] = val;
        }));
        F.writes.push({ api: 'sheets', kind: 'update', range: d.range, values: d.values, valueInputOption: body.valueInputOption });
      });
      return json(route, 200, { totalUpdatedCells: body.data.length });
    }
    if (req.method() === 'POST' && /^\/values\/[^:]+:append$/.test(rest)) {
      const body = req.postDataJSON();
      const t = F.sheets[decodeURIComponent(rest.slice('/values/'.length)).split('!')[0]];
      body.values.forEach(line => { t.push(line.map(v => (v === null ? '' : v))); F.writes.push({ api: 'sheets', kind: 'append', values: line }); });
      return json(route, 200, { updates: { updatedRows: body.values.length } });
    }
    return err(route, 400, 'Unsupported by the fake: ' + rest);
  }

  // ── Docs ──
  const full = () => F.doc.paras.map(p => p.text + '\n').join('');
  const content = () => {
    let at = 1;
    const out = [{ startIndex: 0, endIndex: 1, sectionBreak: {} }];
    F.doc.paras.forEach(p => {
      const end = at + p.text.length + 1;
      out.push({ startIndex: at, endIndex: end, paragraph: { elements: [{ startIndex: at, endIndex: end, textRun: { content: p.text + '\n' } }], paragraphStyle: { namedStyleType: p.style || 'NORMAL_TEXT' } } });
      at = end;
    });
    return out;
  };
  const styleAt = (paras, pos) => { let a = 0; for (const p of paras) { const e = a + p.text.length + 1; if (pos >= a && pos < e) return p.style || 'NORMAL_TEXT'; a = e; } return 'NORMAL_TEXT'; };
  function applyInsert(index, text) {
    const old = F.doc.paras, oldFull = full(), pos = index - 1;
    const inherit = styleAt(old, Math.min(pos, oldFull.length - 1));
    const next = oldFull.slice(0, pos) + text + oldFull.slice(pos);
    const styleOfOld = (p) => styleAt(old, p);
    const out = []; let a = 0;
    next.split('\n').slice(0, -1).forEach(line => {
      const endChar = a + line.length; // index of this paragraph's newline in `next`
      const inserted = endChar >= pos && endChar < pos + text.length;
      const mapped = endChar < pos ? endChar : endChar - text.length;
      out.push({ text: line, style: inserted ? inherit : styleOfOld(mapped) });
      a = endChar + 1;
    });
    F.doc.paras = out;
  }
  function applyStyle(start, end, style) {
    let a = 1;
    F.doc.paras.forEach(p => { const e = a + p.text.length + 1; if (a < end && e > start) p.style = style; a = e; });
  }
  async function docs(route, url, req) {
    if (F.apiDisabled === 'docs') return err(route, 403, 'Google Docs API has not been used in project 55888993304 before or it is disabled.', { status: 'PERMISSION_DENIED' });
    const u = new URL(url);
    const m = u.pathname.match(/^\/v1\/documents\/([^/:]+)(:batchUpdate)?$/);
    if (!m || !F.doc || m[1] !== F.DOC_ID) return err(route, 404, 'Requested entity was not found.');
    if (req.method() === 'GET') {
      F.reads.docs++;
      const rev = 'rev' + F.doc.revision;
      const body = { documentId: F.DOC_ID, title: F.doc.title, revisionId: rev, body: { content: content() } };
      if (F.staleOnce > 0) { F.staleOnce--; F.doc.revision++; F.doc.paras.push({ text: 'Added by another device meanwhile', style: 'NORMAL_TEXT' }); }
      return json(route, 200, body);
    }
    if (req.method() === 'POST' && m[2]) {
      const body = req.postDataJSON();
      const want = body.writeControl && body.writeControl.requiredRevisionId;
      if (want && want !== 'rev' + F.doc.revision) return err(route, 400, 'Precondition check failed: the requiredRevisionId does not match the latest revision.', { status: 'FAILED_PRECONDITION' });
      body.requests.forEach(r => {
        if (r.insertText) { applyInsert(r.insertText.location.index, r.insertText.text); F.writes.push({ api: 'docs', kind: 'insertText', index: r.insertText.location.index, text: r.insertText.text }); }
        if (r.updateParagraphStyle) { applyStyle(r.updateParagraphStyle.range.startIndex, r.updateParagraphStyle.range.endIndex, r.updateParagraphStyle.paragraphStyle.namedStyleType); F.writes.push({ api: 'docs', kind: 'style', range: r.updateParagraphStyle.range, style: r.updateParagraphStyle.paragraphStyle.namedStyleType }); }
        if (r.deleteContentRange || r.replaceAllText) F.writes.push({ api: 'docs', kind: 'FORBIDDEN', r });
      });
      F.doc.revision++;
      return json(route, 200, { documentId: F.DOC_ID, writeControl: { requiredRevisionId: 'rev' + F.doc.revision } });
    }
    return err(route, 400, 'Unsupported by the fake');
  }

  // ── Drive: files.list by name ──
  async function drive(route, url) {
    const u = new URL(url);
    if (u.pathname !== '/drive/v3/files') return err(route, 404, 'Not found');
    const q = u.searchParams.get('q') || '';
    const nm = q.match(/name='((?:[^'\\]|\\.)*)'/);
    const name = nm ? nm[1].replace(/\\'/g, "'") : null;
    const files = F.driveFiles.filter(f => (!name || f.name === name)).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
    return json(route, 200, { files });
  }

  F.handler = async (route, url) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' } }); return true; }
    let body = null; try { body = req.postDataJSON(); } catch (_) {}
    calls.push({ method: req.method(), url, body, auth: req.headers()['authorization'] || '' });
    if (!/^Bearer \S+/.test(req.headers()['authorization'] || '')) { await err(route, 401, 'Request had invalid authentication credentials.'); return true; }
    if (url.startsWith('https://sheets.googleapis.com/')) await sheets(route, url, req);
    else if (url.startsWith('https://docs.googleapis.com/')) await docs(route, url, req);
    else if (url.startsWith('https://www.googleapis.com/drive/')) await drive(route, url);
    else return false;
    return true;
  };
  return F;
}

// A small Ledger for the tests. Columns are in a different order from any real sheet, on purpose: the app must
// find them by header name. Work rows (VINE, ASMP, STARR, RTI, Work) must never reach the app.
const LEDGER_HEAD = ['Done', 'Auto_Status', 'Bucket', 'Domain', 'Parent_Task', 'Step_Num', 'Step_Action', 'First_Physical_Step', 'Hands_On_Mins', 'Waiting_Time', 'Deadline', 'Priority_Labels', 'Completed_At', 'Trello_Board', 'Status_Flags', 'Comments', 'AI_Queue', 'Actual_Mins', 'Flow_Order'];
const SPARK = '1. 🎯 TODAY SPARK (Max 3)', WEEK = '2. 🔥 THIS WEEK (Hard Deadlines)', LATER = '5. LATER';
function ledgerRow(o) { return LEDGER_HEAD.map(h => (h in o ? o[h] : '')); }
const LEDGER_ROWS = [
  { Done: false, Auto_Status: 'Open', Bucket: SPARK, Domain: 'Home', Parent_Task: 'File the tax form', Step_Num: 1, Step_Action: 'Put the tax folder on the desk', Hands_On_Mins: 2, Flow_Order: 2, Comments: '[Nov 1 09:00] started (from Nikhil\'s World)' },
  { Done: false, Auto_Status: 'Open', Bucket: SPARK, Domain: 'Home', Parent_Task: 'File the tax form', Step_Num: 2, Step_Action: 'Fill in page one', Hands_On_Mins: 20, Flow_Order: 3 },
  { Done: true, Auto_Status: 'Done', Bucket: SPARK, Domain: 'Home', Parent_Task: 'File the tax form', Step_Num: 0, Step_Action: 'Find the login', Completed_At: '2026-11-01T10:00:00.000Z' },
  { Done: false, Auto_Status: 'Open', Bucket: WEEK, Domain: 'Body', Parent_Task: 'Book the dentist', Step_Num: 1, Step_Action: 'Open the dentist page on the phone', Hands_On_Mins: 3, Deadline: '2026-11-06', Flow_Order: 1 },
  { Done: false, Auto_Status: 'Open', Bucket: LATER, Domain: 'Home', Parent_Task: 'Renew passport', Step_Num: 1, Step_Action: 'Take the old passport out of the drawer', Deadline: '2026-11-12' },
  { Done: false, Auto_Status: 'Open', Bucket: LATER, Domain: 'Home', Parent_Task: 'Paint the shelf', Step_Num: 1, Step_Action: 'Buy paint', Deadline: '2027-02-01' },
  { Done: false, Auto_Status: 'Open', Bucket: SPARK, Domain: 'VINE study', Parent_Task: 'Call participant 14', Step_Num: 1, Step_Action: 'Phone Maria Lopez about the consent form' },
  { Done: false, Auto_Status: 'Open', Bucket: WEEK, Domain: 'Admin', Parent_Task: 'Send ASMP report', Step_Num: 1, Step_Action: 'Email the ASMP report', Trello_Board: 'ASMP' },
  { Done: false, Auto_Status: 'Open', Bucket: 'Work admin', Domain: 'Admin', Parent_Task: 'Prep STARR slides', Step_Num: 1, Step_Action: 'Open the STARR deck' },
  { Done: false, Auto_Status: 'Open', Bucket: WEEK, Domain: 'Home', Parent_Task: 'Homework help', Step_Num: 1, Step_Action: 'Do the Homework sheet', Flow_Order: 5 },
];
const ledgerValues = () => [LEDGER_HEAD, ...LEDGER_ROWS.map(ledgerRow)];
const RULES_ROWS = [['Rule', 'Text'], ['Step 1', 'The first physical step is Step 1.'], ['Spark', 'Today Spark holds at most 3 tasks.'], ['Waiting', 'Park a worry in Waiting_Time, not in the task list.']];

module.exports = { makeGoogle, SHEET_ID, DOC_ID, LEDGER_HEAD, ledgerRow, ledgerValues, RULES_ROWS, SPARK, WEEK, LATER, LEDGER_ROWS };
