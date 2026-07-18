# NIKHILS_WORLD_POST_PROXY_PLAN.md — v1.2

**Generated 2026-07-18 (Fable 5, final planning pass before access ends Sunday midnight).**
Companion to `NIKHILS_WORLD_ALL_SPECS.md` v1.1 (2026-07-12) — that file stays authoritative for specs 0.0 through X.7. This file adds: (1) newly verified findings that change the plan, (2) a cost doctrine for every AI feature, (3) new specs S.0/S.1/C.0–C.4, and (4) an updated run order. Each SPEC below is self-contained and paste-ready for a Sonnet or Opus Claude Code Routine, same format and standing rules as v1.1.

**WORKING ASSUMPTION (set by Nikhil):** SPEC 0.1-close (the proxy URL swap) is treated as merged and deployed. Verified 2026-07-18 that it has NOT yet run — repo main is still `24077bc` with `api.anthropic.com` at index.html lines 2506 and 2590 — but every spec below is written for the post-swap world. **Every routine that touches an AI feature must run this preamble first:**
`grep -c "api.anthropic.com" index.html` → if the count is not 0, STOP and run SPEC 0.1-close from ALL_SPECS v1.1 first (it is XS, fully written, unfailable), on its own branch, then continue.

---

## 1. NEW VERIFIED FINDINGS (2026-07-18, against live repo + live services)

**F1 — The `phase-0.1-spine` branch is GONE.** Remote has only `main` and the current working branch. ALL_SPECS v1.1 names `phase-0.1-spine` as the source of truth for `functions/` (specs 1a, 0.2, X.6, X.7). Recovery path, verified working: `git fetch origin refs/pull/9/head:pr9-spine` — PR #9 is a single commit (`ede955e`) containing `functions/src/index.ts`, `functions/package.json`, `functions/tsconfig.json`, `functions/.gitignore`.

**F2 — CRITICAL DEPLOY TRAP: the deployed `anthropic` function's source is in NO branch.** PR #9's `index.ts` exports only ONE function, `capture`, whose passthrough mode expects a wrapped body `{mode:"proxy", body:{...}}`. But the deployed, working proxy is a function named `anthropic` that accepts the RAW Anthropic body directly (ALL_SPECS's verified curl test posts `{"model":...,"messages":...}` unwrapped and gets a content array back). Therefore the deployed `anthropic` code was written outside git and never committed. **Consequence: running `firebase deploy --only functions` from any current repo state would deploy a source tree with no `anthropic` export, and Firebase deletes deployed functions that are absent from source — the live proxy would be destroyed.** Standing rule for every functions-touching routine: **never deploy until the repo's `functions/src/index.ts` exports BOTH `anthropic` (matching the deployed raw-body contract) and `capture`.** SPEC S.0 below re-converges this.

**F3 — Fireflies: four unsummarized recordings are waiting, not two.** Verified live via the Fireflies API on 2026-07-18 (the free-plan API key works for reading own transcripts — the free tier is NOT a blocker for transcript reads): Google-Meet link sqs-iyvc-zvp sessions on 2026-06-30 (44 min), 2026-07-02 (36 min), 2026-07-03 (54 min), 2026-07-06 (63 min), all `summary_status: skipped` (Fireflies' own AI summary is the paid feature — irrelevant, since the app does its own extraction via Claude). SPEC 1a's first sync should land all four.

**F4 — SECURITY GAP (unlisted anywhere): the proxy is an open relay once its URL is public.** CORS only stops *browsers* on other origins; any server/script can POST to `https://us-central1-nikhils-world.cloudfunctions.net/anthropic` and spend the Anthropic key. The URL ships in a PUBLIC repo the moment 0.1-close merges. X.6's daily ceiling helps but is not enough (300 sonnet calls × large max_tokens is real money, and an abuser exhausts the ceiling and locks Nikhil out for the day). SPEC S.0 adds model allowlist + max_tokens clamp + per-minute limit; SPEC S.1 adds real auth. Worst-case daily exposure after S.0: roughly $20 (300 calls × ~5k in / 4k out sonnet ≈ $0.075/call); before S.0 it is unbounded.

**F5 — PRIVACY GAP, HIGHEST SEVERITY (unlisted anywhere): Firestore `appdata` is very likely world-readable AND world-writable.** The app has no sign-in; the browser writes directly to Firestore, so the rules must currently allow unauthenticated read/write on `appdata`. The project ID (`nikhils-world`) and web config are public by design. That collection holds therapy session summaries, daily logs, and body data. Anyone who reads the public repo can fetch or overwrite every document with plain REST calls. This is the single most important unbuilt item in the entire program. SPEC S.1 (single-user Firebase Auth + rules lockdown) fixes it. Until it lands, treat everything in Firestore as effectively public.

**F6 — X.8 / X.9 / X.10 anchors re-verified on `24077bc` today:** `deleteTask` @1959, `setNotice` @1160 (3500ms), `prompt("Edit catch text:"` @7612, dashboard `completedTasks` slice @2864, `whiteSpace: "pre-wrap"` @~7598, new-catch textarea @~7421. All three chat specs are runnable as written; they are reproduced in Appendix A so this file is self-contained.

**F7 — Key hygiene (action for Nikhil, not a routine):** the Anthropic API key and the Fireflies API key were pasted into chat text and a stored scheduled prompt. Neither key belongs in the repo, in Firebase config, in any PR, or in any file a routine writes — the proxy reads them exclusively from Secret Manager (`ANTHROPIC_API_KEY`, `FIREFLIES_API_KEY`). **Rotate both keys after build week** (Anthropic console → new key → `firebase functions:secrets:set ANTHROPIC_API_KEY` → redeploy; Fireflies → Integrations → regenerate → `firebase functions:secrets:set FIREFLIES_API_KEY` → redeploy). Any routine that finds a literal `sk-ant-` or a UUID-shaped Fireflies key in any file must stop and flag it in the PR without printing the value.

**F8 — Model strings in ALL_SPECS are current.** `claude-sonnet-4-6` (default) and `claude-haiku-4-5-20251001` (cheap classification) are both live model IDs. Pricing for the cost math below: Haiku 4.5 = $1 in / $5 out per MTok; Sonnet 4.6 = $3 in / $15 out per MTok.

---

## 2. COST DOCTRINE (applies to every AI feature, existing and new)

Two engines, used deliberately:

**Engine 1 — the proxy (API, costs real money).** Reserved for calls that must be small, structured, and in-the-moment: capture classification (haiku), the Energy Menu, task decompose, the Ramp list, the Fireflies extraction. Rules, enforced in code by S.0 and by convention in every spec: tap-only (never on load, never on a timer), haiku unless reasoning genuinely needs sonnet, `max_tokens` ≤ 4000 server-side clamp, daily ceiling, visible spend meter (C.3).

**Engine 2 — claude.ai interactive sessions (subscription, zero marginal cost).** Everything heavy, long, or synthesis-shaped routes here: multi-session foci analysis, weekly reviews, Mirror analysis over big ranges, "reimagine my system" thinking. The app's job is to make the handoff frictionless in both directions — C.1 (Context Pack) packages app state into a paste-ready bundle; C.0 (Clipboard Bridge) gives every AI button a "via claude.ai" mode whose result pastes back into the app as validated JSON. The subscription's session limits absorb the cost instead of the API meter.

Expected steady-state API spend with this split: a normal day is ~5–20 haiku classifications + a handful of sonnet calls ≈ **$0.10–0.50/day**; a Fireflies sync with 4 transcripts is the single biggest call (~$0.20–0.40). Firebase Blaze at this scale (a few hundred function invocations and a few thousand Firestore ops per day) stays inside or barely above the free tier — expect **$0–2/month** for hosting+functions+Firestore. Set the GCP budget alert at $10 (ops checklist, §6).

---

## 3. UPDATED BUILD QUEUE v1.2

Ordering principle: protect the data and the wallet first, then land the AI payoffs, then the substrate. Non-AI items marked ⚙ can run any night in parallel branches.

| # | Spec | Branch slug | Depends on | Effort | Why this position |
|---|------|------------|-----------|--------|-------------------|
| 1 | 0.1-close (v1.1) | fix-proxy-url-swap | — | XS | Only if the preamble grep shows it unrun. Unblocks everything AI. |
| 2 | **S.1** (this file) | phase-s1-auth-lockdown | none | M | F5. Therapy data is exposed until this lands. Do not delay it behind features. |
| 3 | **S.0** (this file) | phase-s0-functions-reconverge | F2 recovery | M | Re-converge repo↔deployed, harden proxy, absorb X.6. Prerequisite for 1a/0.2/X.7 deploys. |
| 4 | 0.0 (v1.1) | phase-0.0-log-durability | none ⚙ | M | Protects the record. |
| 5 | 1a (v1.1, amended) | phase-1a-fireflies-server-auth | S.0 merged+deployed; FIREFLIES_API_KEY secret set (human) | M | Amendment: base `functions/` on S.0's branch, NOT on `phase-0.1-spine` (deleted; see F1/F2). First catch = the four recordings in F3. |
| 6 | **C.1** (this file) | phase-c1-context-pack | none ⚙ | S | The keystone of Engine 2. No AI call; can run any night. |
| 7 | **C.0** (this file) | phase-c0-clipboard-bridge | 0.1-close assumed | M | Makes every AI feature dual-engine. |
| 8 | 0.2 (v1.1, amended) | phase-0.2-capture | S.0 | S | Amendment: capture source comes from S.0's re-converged `functions/`; classifier model `claude-haiku-4-5-20251001` (PR #9's code says sonnet — change it). |
| 9 | 1b (v1.1) | phase-1b-smartview-energy | 0.1-close | L | Energy Menu + decompose get C.0's dual-mode treatment. |
| 10 | **C.3** (this file) | phase-c3-spend-meter | S.0 | XS | ⚙ once S.0's ?health=1 exists. |
| 11 | 1c, 1d1, 1d2, 2, X.0–X.5 (v1.1) | as in v1.1 | as in v1.1 | — | Unchanged. X.0 (Ramp) and X.1 (Mirror analyze) get C.0 treatment when built. |
| 12 | X.7 (v1.1, amended) | phase-x7-nightly-backup | S.0 | S | Amendment: deploy only from the re-converged functions/ (F2 rule). |
| 13 | **C.2** (this file) | phase-c2-session-prep | 1a (needs summaries flowing) | S | ⚙ pure local read. |
| 14 | X.8, X.9, X.10 (Appendix A) | per spec | none ⚙ | S each | Verified runnable tonight, independent branches. |
| — | **C.4** (this file) | — (docs only, can ride any PR) | none | XS | Recordings→Drive convention doc. |
| — | X.6 (v1.1) | — | — | — | RETIRED as a separate spec — absorbed into S.0. |

Dropped/parked, unchanged from the July 18 chat: contextual-permissions expansion (needs Nikhil's personal list — human input), finance card (deferred), public dashboard (not wanted).

---

## 4. NEW SPECS

### SPEC S.0 — FUNCTIONS RE-CONVERGENCE + PROXY HARDENING (absorbs X.6)

**CONTEXT** (verified 2026-07-18): `functions/` is absent from main. PR #9 (`git fetch origin refs/pull/9/head`, single commit `ede955e`) has `functions/` exporting only `capture` (v2 `onRequest`, secret `ANTHROPIC_API_KEY` via `defineSecret`, CORS list includes the app origin, a 200/day transaction ceiling on doc `appdata/_proxy_usage_<UTC date>`, and a `mode:"proxy"` passthrough expecting `{mode, body}`). The DEPLOYED function is different: named `anthropic`, accepts the raw Anthropic messages body, injects `x-api-key`/`anthropic-version` (+ MCP beta header when `mcp_servers` present) server-side, CORS origin `https://nikhils-world.web.app` with allowed request header `content-type` only. Its source is in no branch (F2). The deployed `anthropic` has NO ceiling. The front-end (post-0.1-close) posts raw bodies to the `anthropic` URL.

**SCOPE**: `functions/` only + one redeploy. Recover PR #9's tree, then author `functions/src/index.ts` so it exports BOTH functions with hardening. No index.html changes (C.3 does the front-end meter separately).

**OUT OF SCOPE**: Fireflies secret injection (SPEC 1a layers onto this file afterward). Firebase Auth token verification (S.1 adds it later — leave a clearly marked hook point). Any change to the `capture` classify/routing logic beyond the model string and shared helpers. Never print/log/echo any secret.

**THE CHANGES**:
1. `git fetch origin refs/pull/9/head` and start the branch from main with PR #9's `functions/` directory restored (cherry-pick `ede955e` or copy the tree; say which in the PR).
2. In `functions/src/index.ts`, ADD an exported `anthropic` function reproducing the deployed contract exactly: v2 `onRequest({ secrets: [ANTHROPIC_API_KEY], cors: ["https://nikhils-world.web.app"] })`; POST only; forward `req.body` AS-IS to `https://api.anthropic.com/v1/messages` with headers `content-type: application/json`, `x-api-key: <secret>`, `anthropic-version: 2023-06-01`, plus `anthropic-beta: mcp-client-2025-04-04` only when `req.body.mcp_servers` is present; return upstream status + JSON body. (This mirrors what PR #9's `mode:"proxy"` branch does — reuse that code, unwrapped.)
3. HARDENING, inside `anthropic` before forwarding:
   - **Model allowlist**: `body.model` must be `claude-sonnet-4-6` or `claude-haiku-4-5-20251001`; otherwise 400 `{"error":"MODEL_NOT_ALLOWED"}`.
   - **Output clamp**: `body.max_tokens = Math.min(body.max_tokens ?? 1000, 4000)`.
   - **Daily ceiling**: reuse/rename PR #9's `checkAndIncrementBudget` as a shared helper for BOTH functions, with two fixes: `DAILY_CALL_CEILING = 300`, and the date for the usage doc id computed in **America/Anchorage** (`new Intl.DateTimeFormat('en-CA',{timeZone:'America/Anchorage'}).format(new Date())`), not `toISOString()` — the UTC date is CA2 bug #2 recurring server-side. On ceiling: 429 `{"error":"DAILY_CEILING","message":"daily AI budget reached — resets at midnight"}`.
   - **Per-minute soft limit**: in the same usage doc keep `{count, minuteBucket, minuteCount}`; >10 calls in one minute → 429 `{"error":"RATE_LIMIT","message":"slow down — 10 calls/minute max"}`.
   - **Health**: GET with `?health=1` returns `{ok:true, today:<count>}` without incrementing.
   - Never log request/response bodies; at most `{model, hasMcp, todayCount}`.
4. In `capture`: change the classifier model to `claude-haiku-4-5-20251001`; point it at the shared budget helper; leave everything else byte-identical (SPEC 0.2 owns its behavior).
5. Leave a marked hook: `// S1-AUTH-HOOK: verify Firebase ID token here once SPEC S.1 lands` at the top of both handlers.
6. Deploy: `firebase deploy --only functions` — **allowed in this spec only because after step 2 the source exports a superset of what is deployed** (F2 rule satisfied). Verify after deploy: the ALL_SPECS curl test (raw body → content array) still passes; `?health=1` returns a count; a request with `model:"claude-opus-4-6"` gets the 400.

**DONE-WHEN**: Both functions exist in `functions/src/index.ts` on the branch; post-deploy the raw-body curl works, a disallowed model 400s, an 11th call in one minute 429s, `?health=1` reports today's AKDT count, and the front-end's (assumed-merged) proxy calls behave exactly as before.

**BRANCH NAME**: phase-s0-functions-reconverge

**STANDING RULES**: as v1.1 (new branch; never commit to main; push, open PR, DO NOT merge; no secrets anywhere; locate by pattern not line number; note drift in PR).

---

### SPEC S.1 — SINGLE-USER LOCKDOWN (Firebase Auth + Firestore rules) — PRIVACY CRITICAL

**CONTEXT** (F5): the browser writes straight to Firestore collection `appdata` with no auth, so the rules currently allow unauthenticated access; project ID and web config are public. `appdata` holds therapy summaries (`session-summaries`), daily logs, body data. `window.storage` (index.html ~110–176, compat SDK with forced long-polling ~76–79, localStorage belt in `storage.set` ~138–156) is the single choke point for all reads/writes — that is what makes this spec small.

**SCOPE**: (1) Firebase console/CLI: enable Google sign-in provider (document the exact clicks in the PR — the routine can do the CLI parts; provider enable may need Nikhil, say so). (2) NEW `firestore.rules` file in the repo + `firebase.json` wiring + deploy rules. (3) index.html: a sign-in gate + auth state handling around the existing storage layer. Storage doc shapes untouched.

**OUT OF SCOPE**: Multi-user anything. Changing any storage key or value shape. The proxy token check (S.0 leaves the hook; wiring it is a one-line follow-up noted in the PR, not built here). Offline-first redesign — keep the existing localStorage fallback exactly as is.

**THE CHANGES**:
1. `firestore.rules` (new file, deployed via `firebase deploy --only firestore:rules`; add `"firestore": {"rules": "firestore.rules"}` to firebase.json):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appdata/{doc} {
      allow read, write: if request.auth != null
        && request.auth.token.email == 'nikhilnandagopal495@gmail.com'
        && request.auth.token.email_verified == true;
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```
2. index.html: load the compat auth SDK alongside the existing compat Firestore SDK. On boot, before the first `window.storage.get`: if no current user, render a minimal full-screen gate — the app name, one button `sign in`, nothing else — using `signInWithPopup(GoogleAuthProvider)` with `signInWithRedirect` fallback (iOS Safari PWA blocks popups; detect failure and retry with redirect). On auth success, proceed with the normal boot. `onAuthStateChanged` guards re-renders.
3. Wrong-account path: if the signed-in email is not the allowed one, show `this account does not have access` and a sign-out button — never a crash, never a silent empty app.
4. The localStorage belt keeps working when offline/unauthenticated for reads already cached; writes still queue to localStorage exactly as today (persist() already handles failure via the saveFailure banner — Firestore permission-denied simply becomes one more failure case it already displays).
5. PR description must state: before/after rules, that the email is checked server-side (rules), that the Firebase web config staying public is fine BY DESIGN once rules exist, and the one-line follow-up for proxy auth (send `await user.getIdToken()` in the request body; verify with admin SDK at the S1-AUTH-HOOK).

**DONE-WHEN**: An unauthenticated REST read of `appdata/session-summaries` (plain curl to the Firestore REST endpoint) returns permission-denied; signing in with the allowed account boots the app with all existing data intact; a different Google account sees the no-access screen; airplane-mode reload still shows cached data with the existing banner behavior.

**BRANCH NAME**: phase-s1-auth-lockdown

**STANDING RULES**: as v1.1.

---

### SPEC C.0 — CLIPBOARD BRIDGE (every AI feature gets a zero-cost second engine)

**PATTERN SERVED**: §2 cost doctrine — heavy synthesis belongs on the subscription, not the API meter. **READS/WRITES**: none new (each feature keeps its own keys). **EFFORT**: M.

**CONTEXT**: Every AI feature is a triple (assemble input → get structured JSON → apply result). The proxy is one transport; a claude.ai chat is another. This spec builds the second transport as one reusable component so it costs nothing to add per feature.

**SCOPE**: index.html — one reusable component + wiring into the TWO existing AI features (`syncFireflies` excluded — MCP can't round-trip through a chat; `analyzeFoci` @~2578 included; plus each future feature per its own spec). **OUT OF SCOPE**: any change to the proxy path; any automation of claude.ai (it is deliberately manual paste); Fireflies sync.

**THE CHANGES**:
1. Component `AIBridge({ buildPrompt, schemaHint, onResult, proxyCall, labels })` rendering two small buttons + a collapsible paste box:
   - **run** → existing behavior (`proxyCall`), untouched.
   - **via claude.ai** → assembles ONE self-contained prompt string: the feature's system instruction, the data dump, and a strict tail: `Return ONLY a JSON <object|array> matching: <schemaHint>. No prose, no code fences.` → `navigator.clipboard.writeText` → toast `copied — paste into claude.ai, then paste the JSON reply below` → reveals a textarea + `apply` button.
   - **apply** → strip code fences if present, `JSON.parse` inside try/catch, run the same minimal shape check the proxy path uses, then call `onResult` — the SAME apply function the proxy path uses, so storage writes are identical regardless of engine. Parse failure → error toast, input preserved, nothing written.
2. Wire `analyzeFoci`: extract its current fetch into `proxyCall`, its session-dump + system prompt into `buildPrompt`, its JSON-extract-and-save into `onResult`. Foci from either engine must be byte-equivalent in storage (`trajectory-foci`).
3. Convention paragraph in the PR for future specs (1b menu, decompose, X.0, X.1): pass their three functions into AIBridge instead of hand-rolling buttons.
4. No new storage keys; no AI call happens without a tap on one of the two buttons.

**DONE-WHEN**: Tapping `via claude.ai` on the foci panel puts a complete, runnable prompt on the clipboard; pasting a valid JSON reply and tapping apply renders and persists foci identically to the proxy path; pasting garbage shows the error and loses nothing; the proxy button's behavior is byte-identical to before.

**BRANCH NAME**: phase-c0-clipboard-bridge

**STANDING RULES**: as v1.1.

---

### SPEC C.1 — CONTEXT PACK (one-tap handoff of app state to claude.ai / Fable successors)

**PATTERN SERVED**: §2 Engine 2 — the subscription can only help if context transfer is frictionless; today it means hand-copying from five surfaces. **READS/WRITES**: reads many keys, writes none. **EFFORT**: S. ⚙ no AI call, runnable any night.

**CONTEXT**: All reads go through `window.storage.get` on known keys: day logs (`kaizen4:logs` family — post-0.0, the per-day docs + index; pre-0.0, the blob — detect via `kaizen4:logs:index` like 1c does), `kaizen3:tasks`, `session-summaries`, `transition-log`, `creative-streak`, `creative-catch`, `trajectory-foci`, `body-needs`.

**SCOPE**: index.html — one button (settings/export area, near the existing doExport @~1130) + one assembly function. **OUT OF SCOPE**: uploading anywhere (no Drive API in the app — Nikhil pastes into Drive himself); any AI call; any change to doExport (full backup stays separate — this is a curated, size-budgeted brief, not a dump).

**THE CHANGES**:
1. `buildContextPack()` returns markdown with hard per-section caps (drop oldest first, note `…truncated` when capped): header (generated-at, AKDT); last 7 day logs (brainDump capped 600 chars/day, highlight, done[] counts, events[] types); active tasks (name, urgency, energy/friction/domains when present; cap 40); latest 5 session-summaries (themes, key_insight, assignment — never raw_notes); transition stats (count + median secs last 14d); reps total; last 30d creative-catch count + last 10 titles/first-lines; current foci (if any); body-needs now. Total hard cap 30,000 chars — if over, tighten day-log text first.
2. Two buttons: `copy context pack` (clipboard + toast with char count) and `download .md` (existing download pattern from doExport, filename `context-pack-<YYYY-MM-DD>.md`).
3. Top of the pack, verbatim: `This is a generated snapshot of Nikhil's World app state for an AI working session. Data is personal; do not repost. Sections may be truncated — the app export has the full record.`
4. No persistence, no new keys, tolerate every key missing (fresh install renders a mostly-empty pack, never an error).

**DONE-WHEN**: One tap yields a well-formed markdown pack under 30k chars covering every populated section; missing keys don't break it; the download and clipboard copies are identical.

**BRANCH NAME**: phase-c1-context-pack

**STANDING RULES**: as v1.1.

---

### SPEC C.2 — SESSION PREP CARD (therapy prep from data already on hand — no AI)

**PATTERN SERVED**: the 50 minutes with Shobha/Brighton are the highest-leverage minutes of the week; walking in with the record beats walking in cold. Witness-not-grade law applies. **READS/WRITES**: reads `session-summaries`, day-log events, `creative-streak`, `transition-log`; writes nothing. **EFFORT**: S. ⚙ after 1a.

**SCOPE**: index.html, one card on the Sessions panel (`SessionsPanel`, SESSIONS_KEY @~2469). **OUT OF SCOPE**: any AI call; any scheduling/reminder; any editing of summaries.

**THE CHANGES**:
1. Button `prep` with a Shobha/Brighton toggle → renders, read-only: last summary of that type (date, themes, key_insight, **assignment highlighted** — it is the homework); events since that date grouped by type (distortion chips with pattern names, body-need-first count, morning-protocol count — each shown only if 0.0/1c/X.3/X.5 have landed; tolerate absent); reps delta since; transitions count + median since. All counts are information — no colors, no targets, no "only".
2. `copy as text` button — plain-text version for pasting anywhere.
3. Empty states are quiet (`no <type> sessions stored yet — sync or paste one`).

**DONE-WHEN**: With stored summaries, prep for each type renders correct last-session data and correct since-date counts; with none, the quiet empty state; copy produces readable plain text.

**BRANCH NAME**: phase-c2-session-prep

**STANDING RULES**: as v1.1.

---

### SPEC C.3 — SPEND METER (the wallet is information too)

**PATTERN SERVED**: §2 doctrine needs a visible number; invisible spend is how ceilings get hit blind. **READS/WRITES**: GET `<proxy URL>?health=1` (free, no AI); writes nothing. **EFFORT**: XS. Depends on S.0.

**SCOPE**: index.html — one chip near where AI features live (Trajectory/Sessions panel header). **OUT OF SCOPE**: any per-call cost math; any blocking behavior (the server enforces; this only informs); polling (fetch on panel open + after any proxy call completes, never on a timer).

**THE CHANGES**: fetch `?health=1` on panel open and after each proxy response; render `AI calls today: n/300` in the existing muted-chip style; on fetch failure render nothing (never an error). When any proxy call returns 429, surface its `message` through the existing error-status paths.

**DONE-WHEN**: Opening the panel shows the live count; the count increments after a proxy call; network failure hides the chip silently; a 429's message reaches the user.

**BRANCH NAME**: phase-c3-spend-meter

**STANDING RULES**: as v1.1.

---

### SPEC C.4 — RECORDINGS → DRIVE CONVENTION (docs only; no code)

**CONTEXT**: Per the July 18 decision: session recordings/transcripts live in per-session Google Docs, never appended to Brain Dump (retrieval reliability, not capacity). **SCOPE**: one file, `docs/recordings-drive-convention.md`, committable with any branch. **THE CHANGES** — the doc states:
1. One Drive doc per session, title `SESSION_<YYYY-MM-DD>_<Shobha|Brighton|other>`.
2. Audio is transcribed first (Gemini, as before) — Drive fetch reads docs, not audio.
3. A master index doc `SESSIONS_INDEX` lists `date · type · doc ID` one per line, newest first; AI sessions get handed specific doc IDs from it, never told to search.
4. Fireflies-sourced sessions don't need this path (1a lands them in-app); this convention is for non-Fireflies recordings and full transcripts too long for `session-summaries`.

**DONE-WHEN**: the doc exists and says the above. **BRANCH**: ride any open branch or `docs-recordings-convention`.

---

## 5. WHAT FABLE DELIBERATELY DID NOT BUILD (so Sonnet doesn't either)

- **No AI feature that runs without a tap.** The doctrine and the ceilings assume human-initiated calls; a cron that calls the proxy would silently eat the budget. X.7's backup is the only scheduled function and it calls no AI.
- **No Drive/Docs API inside the app.** OAuth scopes in a single-file public app are a new attack surface; clipboard + download + Nikhil's paste is the right cost/risk point. Revisit only after S.1.
- **No re-implementation of Fireflies summaries via their paid AI.** The app's own extraction (1a) is cheaper and already specced.
- **No embeddings/vector memory.** CA2 Part 6 stays deferred; the Context Pack covers cross-session memory needs at zero infra.

---

## 6. OPS CHECKLIST FOR NIKHIL (human steps, in order)

1. **Rotate the two keys** pasted into chats (F7) — after 1a is merged so you only set secrets once: Anthropic key → Secret Manager `ANTHROPIC_API_KEY`; Fireflies key → `FIREFLIES_API_KEY`; then `firebase deploy --only functions` (only from a re-converged functions/ per F2).
2. **Routine scheduler timezone** → set every routine explicitly to America/Anchorage (stops the UTC/AKDT double-fire burning quota).
3. **GCP budget alert** at $10/month on project nikhils-world.
4. **Enable Google sign-in provider** in Firebase console when S.1's PR asks for it (2 clicks; the PR documents them).
5. **Merge order discipline**: S.1 and S.0 before any AI-feature merges you haven't already done; everything else is your call, morning reviews as always.
6. **Reduction prompt amendment** (one line, life-OS side): have the nightly Reduction also write its scored ledger to Firestore key `prediction-ledger` — X.1 renders it when it appears.
7. Queue X.8 / X.9 / X.10 / Phase 1e any night — independent, no AI, specs in Appendix A and Build-Prompts-v1.

---

## APPENDIX A — SPECS X.8 / X.9 / X.10 (verbatim from 2026-07-18 chat, anchors re-verified same day)

### SPEC X.8 — Compress View (30-day-untouched sweep)

**CONTEXT**: Tasks have `createdAt` but no `updatedAt`. `completedTasks = tasks.filter(t => t.status === 'done').slice(0, 20)` (@2864, separate dashboard view) shows the clutter is real, but this spec scopes to `TasksView` only (~1942–2000+), where `toggleTask`, `toggleSubtask`, `saveTask`, `addTask` are defined.
**SCOPE**: index.html, `TasksView` only. **OUT OF SCOPE**: the dashboard slice; deletion; filter/status logic; ProjectsView; creative-catch.
**THE CHANGES**: (1) add `updatedAt: new Date().toISOString()` in `toggleTask` (~1948), `toggleSubtask` (~1951), `saveTask` (~1958), and `addTask`'s new-task object (~1964–1975); (2) legacy rows fall back to `updatedAt = createdAt` when computing age — no forced migration; (3) split done tasks into `recentDone` (≤30d) rendered normally and `oldDone` collapsed under one row `"N older, completed"` with tap-to-expand (local `useState`, resets per session); (4) one `showOld` boolean, nothing else.
**DONE-WHEN**: a done task last touched 35 days ago collapses under the row; tapping expands; editing its name refreshes `updatedAt` and it reappears in the recent group.
**BRANCH NAME**: phase-x8-compress-view

### SPEC X.9 — Bulk-Select + Undo

**CONTEXT**: `deleteTask(id)` @1959 is single-item, immediate, non-undoable. Toast pattern `setNotice({kind,text})` @1160 auto-dismisses at 3500ms — this adds a longer-lived variant for undo, not a rebuild.
**SCOPE**: index.html, `TasksView` only; bulk-complete + bulk-delete; single-action undo (last bulk delete only). **OUT OF SCOPE**: bulk field-editing; other views; multi-step history; single-item behavior.
**THE CHANGES**: (1) `selectMode` state + `selectedIds` Set + `undoStash` ref; (2) "Select" toggle in the header; checkboxes per row only when selectMode (existing tap-to-toggle stays as-is otherwise — additive); (3) with ≥1 selected show a bar: **Complete selected** → map selected to `{...t, status:'done', updatedAt:now}`, clear selection; **Delete selected** → stash removed tasks in `undoStash.current`, filter them out, show an "Undo — N tasks removed" toast with a visible Undo button and **6000ms** timeout; (4) Undo → `setTasks([...allTasks, ...undoStash.current])`, clear stash, dismiss toast; timeout expiry just clears the stash (delete already persisted via the normal debounced persist); (5) clear selection + exit selectMode after any bulk action.
**DONE-WHEN**: selecting 3 and deleting removes them with the 6s Undo toast; Undo restores all 3 exactly; expiry leaves the deletion permanent.
**BRANCH NAME**: phase-x9-bulk-select-undo

### SPEC X.10 — Creative Catch: multi-line edit fix

**IMPORTANT**: the standing "creative-catch content bug is a ghost — don't fix it" note is about *storage* (intact — leave alone). THIS is a different, verified *edit-UI* bug.
**ROOT CAUSE (confirmed)**: the catch edit button (@7612) uses browser-native `prompt("Edit catch text:", c.text)` — single-line, flattens newlines. Display already correct (`pre-wrap` @~7598); new-entry creation already a textarea (@~7421). Only the edit path is broken.
**SCOPE**: index.html, the `catchEntries.map(c => ...)` block (~7584–7635), text editing only. **OUT OF SCOPE**: storage key/shape; the "Edit link" `prompt()` (stays — links are single-line, and `session`-kind entries store JSON in `fileLink`); `saveCatchEntries`/`addCatch`/`removeCatch`/delete; other views.
**THE CHANGES**: (1) `editingCatchId` + `editingCatchText` state; (2) edit button sets them instead of calling `prompt()`; (3) when editing, render a `<textarea>` in place of the text div, styled like the new-catch textarea (~7432–7438: `#0f0f0f` bg, `1px solid #333`, Space Mono, 13px, lineHeight 1.6, `resize:"vertical"`, minHeight ~90) — save calls `updateCatch(c.id, { text: editingCatchText })` then clears state; cancel clears without saving; (4) newlines round-trip — never normalize whitespace in the save path; (5) one entry editable at a time; starting another edit discards unsaved changes on the previous (acceptable).
**DONE-WHEN**: a 3-line catch edited to 4 lines saves and re-renders with all breaks intact; `prompt()` never appears for text editing; untouched entries stay byte-identical.
**BRANCH NAME**: phase-x10-catch-edit-fix

**STANDING RULES for all Appendix A specs**: new branch per spec; never commit to main; push, open PR, do not merge (review is Nikhil's); never use the word "ex" in generated copy — circumlocutions; no metaphors in user-facing copy, literal and direct, never toxic positivity; if lines drifted, locate by code pattern and note drift in the PR; X.8/X.9 touch TasksView, X.10 touches the creative applet — separate branches from main, no expected conflicts.

---
*— end NIKHILS_WORLD_POST_PROXY_PLAN.md v1.2 —*
