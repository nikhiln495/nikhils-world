# Spec P1 — Practice tab: progress

Branch: `claude/kind-shannon-6i3pkk` (assigned by the environment).

## Where I am

All 4 steps are committed, plus one follow-up Nikhil asked for after reviewing: Learn counts reps of all time, and Waking up logs him as up when he taps "I'm up and moving". The PR stays a draft for Nikhil to review; nothing is merged.

## Precondition

- `const AI_PROXY_URL = "https://us-central1-nikhils-world.cloudfunctions.net/anthropic"` present in index.html (from PR #11). ✅
- `const AI_MODEL = "claude-sonnet-5-5"` present. ✅

## Cleanup (step 1)

- `syncFireflies` and the "🔄 Sync Fireflies" button removed from SessionsPanel; the now-unused `syncing` state removed; the empty-state hint no longer mentions Fireflies sync. The foci-analysis call (`analyzeFoci`) is unchanged.
- Checked: `grep -n "syncFireflies\|Sync Fireflies" index.html` → no matches; page loads with no console errors in the harness.

## Screens

| # | Screen | Status | How checked | Known problems |
|---|--------|--------|-------------|----------------|
| — | Data layer + tab placement | done | harness: Practice appears in the bottom nav beside the other tabs and renders in `paneStyle('practice')`; every read/write after opening the tab is a `practice:` key; unreadable playbook is reported and not overwritten; 00:30 in Asia/Kolkata logs to the local date, not the UTC date | — |
| 1 | Today | done | harness scenarios (morning without a Daily Brief doc, evening without it, with the doc, east-of-UTC date): default stack, bedtime plan after 6 PM, Waking up button before noon until level 4 / up-at, Level 1–4 and up-at logging, Forgot box, card Log, homework strip with due dates and Add update, not-working practice hidden, yesterday's log untouched, Start opens the guided flow | — |
| 2 | Library | done | harness: grouped by categories, search, the three "Where am I" filters, not-working stays visible, "after level 4" tag on post4, detail view fields, Change status needs a non-blank reason and appends `{date, change, reason, by:"Nikhil (app)"}`, rest of playbook unchanged, Log rep, no delete/remove buttons | — |
| 3 | Guided flow | done | harness: one step per screen with Next/Back; optional before/after 0–10 with labels brace / on edge (cats sit, body) / fear / self-criticism (learn); thought-stop 60 s, power-nap 15 min, soothing-breath 3 min timers (countdown observed); passage-of-time hidden-clock count shows real elapsed seconds; grief-release tap counter to 11 only on steps that say 11; Save → entry with before/after and source "app" | Timers are visual only (vibrate where supported, no sound). |
| 4 | Learn | done | harness: course name and why; path by weeks in stored order; per practice "N reps so far · first rep <date>" over **all** per-day logs (a 2025 log is counted), or "No reps yet"; lists logs only with the `practice:log:` prefix; an unreadable day is reported and left alone; if logs can't be listed it falls back to the last 180 days and says so; the real `window.storage.listPrefix` was run against a fake in-memory Firestore: it queries only the doc-ID range `practice_log_` … `practice_log_\uf8ff`, finds a doc with no `key` field, and ignores `practice:logbook`; Start opens the guided flow | The Firestore range query has only run against the fake, not live Firestore. |
| 5 | Dr. Shobha | done | harness: WhatsApp message lists open requests (owed by her) first, then the top 5 open queue items, numbered with no gaps, as capitalised sentences ending in punctuation, with practice ids swapped for names; closed requests and covered items left out; Copy puts exactly that text on the clipboard; Add appends `{item, since, status:"open"}`; Mark covered with a date sets `status:"covered"` + `coveredOn` on that item only; message renumbers afterwards; owed-by-her list; homework; Draft with Claude sends only the message, with no tools, and ids are swapped in the draft too; a 503 is shown | — |
| 6 | Gaps | done | harness: theme, since, owners, options; Add appends `{theme, since, owners[], options[]}`; the new gap shows straight away; unreadable doc → Add disabled and doc untouched | — |
| 7 | Progress | done | harness: reads exactly the last 30 per-day log docs (today plus 29 before it); missing day = no reps; an unreadable day is reported and left alone; reps in the last 7 / 30 days and last done per practice; Deep Pass comment + trend and note from `practice:progress` | — |
| 8 | Stuck | done | harness: Stuck button on Today, Library, guided flow and Waking up; situations from `practice:stuck-map` in stored order, skipping missing ids, not-working and post4 (until level 4); **fallback**: missing doc and unreadable doc both use the built-in list with a small note, grief situation only after level 4, "Something else" last and sends his words to layer b; Ask Claude request body checked field by field against the spec (INDEX format, `now` over `when`, voice rules, context line with level + today's ratings), picks filtered in code (unknown / not-working / post4 dropped, max 3), Start → rep saved with source "app-stuck"; failures (500, no tool_use, unreachable) show what failed and point to the list; offline disables Ask Claude with a note and practices still run; layer c sends only the web_search tool, Save as proposal appends to `practice:outside-map`, playbook untouched; crisis footer only on this screen | The AI proxy itself was never called for real (faked in the harness). |
| 9 | Waking up | done | harness: Q1/Q2 big buttons; fixed step rules checked for lying + cold + phone, eyes closed + dizzy + dread, propped, standing (first item of today's plan); missing ids skipped; a step naming 30 seconds gets a timer; "Didn't work, try another" uses single steps only (one step from a not-working practice, never physio, grief tapping or post4); the button is "I'm up and moving"; on any step it logs `{waking-ladder, level 4, time, note:<answers>, source:"app-waking"}` and then shows today's first item; on the last step it replaces "Done, next" and logs straight away, with no in-between screen and nothing logged before the tap; Coach me request restricted to pre4/stage4/any and filtered in code; no food suggested | — |

## Keys the new code reads or writes

All go through `pRead` / `pWrite`, which throw on any key not starting with `practice:`.

- read: `practice:playbook`, `practice:homework`, `practice:shobha-queue`, `practice:outside-map`, `practice:progress`, `practice:stuck-map`, `practice:today:<YYYY_MM_DD>`, `practice:log:<YYYY_MM_DD>` (today; yesterday; the last 30 days for Progress; every log doc for Learn, listed through the new `window.storage.listPrefix("practice:log:")`)
- write (read-modify-write, append only): `practice:log:<today>` (append entry), `practice:playbook` (status change + history), `practice:homework` (append to an item's `updates[]`), `practice:shobha-queue` (append item; mark covered), `practice:outside-map` (append gap or proposal)

## How checks are run

```
NODE_PATH=$(npm root -g) node scripts/p1-check.js     # page load, nav, console errors
NODE_PATH=$(npm root -g) node scripts/p1-test.js all  # all scenarios (or 2 / 3 / 4 for one step)
```

The harness loads index.html in headless Chromium with:
- `window.storage` replaced by an in-memory mock (the page's own assignment is ignored), seeded from `scripts/p1-fixtures.js` (invented test docs shaped like the spec);
- every Firebase / Firestore / Google sign-in / api.anthropic.com request aborted, so the live Firestore is never read or written;
- the clock and timezone set per scenario.
Console errors from the deliberately blocked requests are not counted; any other console error fails the check.

## Checks log

- Step 1: harness load → nav renders, console errors: none. `grep -c "api.anthropic.com" index.html` → 0.
- Step 2: `p1-test.js 2` → 57 passed, 0 failed. `p1-check.js` → Practice in nav, console errors: none. `grep -c "api.anthropic.com" index.html` → 0. Screenshots at 390×844 reviewed (Today with a Daily Brief doc, Library detail after a status change).

- Step 3: `p1-test.js all` → 146 passed, 0 failed (steps 2 + 3). `grep -c "api.anthropic.com" index.html` → 0. Screenshots at 390×844 reviewed (Stuck with the built-in list, Waking up count step). Two bugs found by the checks and fixed before committing: "start over" in Waking up kept the old answers; returning from a practice to Stuck lost Claude's picks (lower screens now stay mounted while hidden).

- Step 4: `p1-test.js all` → 195 passed, 0 failed (steps 2–4). `p1-check.js` → console errors: none. `grep -c "api.anthropic.com" index.html` → 0. Screenshots at 390×844 reviewed (Dr. Shobha, Progress, Learn). Audit: the Practice script calls `window.storage` only inside `pRead`/`pWrite` (key guard) and `fetch` only inside `pCallClaude` (AI proxy).

- Follow-up (all-time reps in Learn, "I'm up and moving" in Waking up): `p1-test.js all` → 211 passed, 0 failed. `p1-check.js` → console errors: none. `grep -c "api.anthropic.com" index.html` → 0. New checks: all-time counts with the mock; the 180-day fallback when listing isn't available; the real `listPrefix` against a fake Firestore (range query only, no whole-collection read); last-step "I'm up and moving" logs straight away.

## Not checked

- The real AI proxy was never called; every request went to a local fake. The request bodies were checked field by field, but the live proxy's replies (for example, whether it allows `web_search`) were not.
- Not tried on a real phone or against the real seeded docs. Field shapes the spec doesn't fix (for example `steps[]`, `evidence`, `updates[]`, `owedByDrShobha[]`) are displayed whether they hold strings or objects.

## Next step

Nikhil reviews the draft PR. Nothing is left in the spec to build.
