# Spec P1 — Practice tab: progress

Branch: `claude/kind-shannon-6i3pkk` (assigned by the environment).

## Where I am

Steps 1, 2 and 3 of 4 are committed (Nikhil replied "continue" after the step-2 pause). Next: step 4 (Learn, Dr. Shobha, Gaps, Progress).

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
| 4 | Learn | not started | — | placeholder text |
| 5 | Dr. Shobha | not started | — | placeholder text |
| 6 | Gaps | not started | — | placeholder text |
| 7 | Progress | not started | — | placeholder text |
| 8 | Stuck | done | harness: Stuck button on Today, Library, guided flow and Waking up; situations from `practice:stuck-map` in stored order, skipping missing ids, not-working and post4 (until level 4); **fallback**: missing doc and unreadable doc both use the built-in list with a small note, grief situation only after level 4, "Something else" last and sends his words to layer b; Ask Claude request body checked field by field against the spec (INDEX format, `now` over `when`, voice rules, context line with level + today's ratings), picks filtered in code (unknown / not-working / post4 dropped, max 3), Start → rep saved with source "app-stuck"; failures (500, no tool_use, unreachable) show what failed and point to the list; offline disables Ask Claude with a note and practices still run; layer c sends only the web_search tool, Save as proposal appends to `practice:outside-map`, playbook untouched; crisis footer only on this screen | The AI proxy itself was never called for real (faked in the harness). |
| 9 | Waking up | done | harness: Q1/Q2 big buttons; fixed step rules checked for lying + cold + phone, eyes closed + dizzy + dread, propped, standing (first item of today's plan); missing ids skipped; a step naming 30 seconds gets a timer; "Didn't work, try another" uses single steps only (one step from a not-working practice, never physio, grief tapping or post4); I'm up → `{waking-ladder, level 4, time, note:<answers>, source:"app-waking"}` then today's first item; Coach me request restricted to pre4/stage4/any and filtered in code; no food suggested | — |

## Keys the new code reads or writes

All go through `pRead` / `pWrite`, which throw on any key not starting with `practice:`.

- read: `practice:playbook`, `practice:homework`, `practice:today:<YYYY_MM_DD>`, `practice:log:<YYYY_MM_DD>` (today and yesterday), `practice:stuck-map`
- write (read-modify-write): `practice:log:<today>` (append entry), `practice:playbook` (status change + history), `practice:homework` (append to an item's `updates[]`), `practice:outside-map` (append a proposal)
- Step 4 will add: `practice:shobha-queue`, `practice:progress` (read), `practice:log:<past 30 days>` (read).

## How checks are run

```
NODE_PATH=$(npm root -g) node scripts/p1-check.js     # page load, nav, console errors
NODE_PATH=$(npm root -g) node scripts/p1-test.js all  # all scenarios (or 2 / 3 for one step)
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

## Next step

Step 4: Learn (4), Dr. Shobha (5) incl. WhatsApp message and Draft with Claude, Gaps (6), Progress (7).
