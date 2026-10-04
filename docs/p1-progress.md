# Spec P1 — Practice tab: progress

Branch: `claude/kind-shannon-6i3pkk` (assigned by the environment).

## Where I am

Steps 1 and 2 of 4 are committed. **Paused here, waiting for Nikhil to reply "continue"** before starting step 3 (guided flow, Waking up, Stuck).

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
| 1 | Today | partial | harness scenarios (morning without a Daily Brief doc, evening without it, with the doc, east-of-UTC date): default stack, bedtime plan after 6 PM, Waking up button before noon until level 4 / up-at, Level 1–4 and up-at logging, Forgot box, card Log, homework strip with due dates and Add update, not-working practice hidden, yesterday's log untouched | **Start** opens a temporary screen listing the steps with a Log rep button (the real guided flow is step 3). **Waking up** button opens a placeholder (screen 9 is step 3). No Stuck button yet (step 3). |
| 2 | Library | partial | harness: grouped by categories, search, the three "Where am I" filters, not-working stays visible, "after level 4" tag on post4, detail view fields, Change status needs a non-blank reason and appends `{date, change, reason, by:"Nikhil (app)"}`, rest of playbook unchanged, Log rep, no delete/remove buttons | **Start** goes to the same temporary steps screen until step 3. |
| 3 | Guided flow | not started | — | — |
| 4 | Learn | not started | — | placeholder text |
| 5 | Dr. Shobha | not started | — | placeholder text |
| 6 | Gaps | not started | — | placeholder text |
| 7 | Progress | not started | — | placeholder text |
| 8 | Stuck | not started | — | — |
| 9 | Waking up | not started | — | placeholder text |

## Keys the new code reads or writes

All go through `pRead` / `pWrite`, which throw on any key not starting with `practice:`.

- read: `practice:playbook`, `practice:homework`, `practice:today:<YYYY_MM_DD>`, `practice:log:<YYYY_MM_DD>`
- write (read-modify-write): `practice:log:<today>` (append entry), `practice:playbook` (status change + history), `practice:homework` (append to an item's `updates[]`)
- Later steps will add: `practice:shobha-queue`, `practice:outside-map`, `practice:progress` (read), `practice:stuck-map` (read), `practice:log:<past 30 days>` (read).

## How checks are run

```
NODE_PATH=$(npm root -g) node scripts/p1-check.js     # page load, nav, console errors
NODE_PATH=$(npm root -g) node scripts/p1-test.js 2    # step-2 scenarios
```

The harness loads index.html in headless Chromium with:
- `window.storage` replaced by an in-memory mock (the page's own assignment is ignored), seeded from `scripts/p1-fixtures.js` (invented test docs shaped like the spec);
- every Firebase / Firestore / Google sign-in / api.anthropic.com request aborted, so the live Firestore is never read or written;
- the clock and timezone set per scenario.
Console errors from the deliberately blocked requests are not counted; any other console error fails the check.

## Checks log

- Step 1: harness load → nav renders, console errors: none. `grep -c "api.anthropic.com" index.html` → 0.
- Step 2: `p1-test.js 2` → 57 passed, 0 failed. `p1-check.js` → Practice in nav, console errors: none. `grep -c "api.anthropic.com" index.html` → 0. Screenshots at 390×844 reviewed (Today with a Daily Brief doc, Library detail after a status change).

## Next step

Step 3: guided flow (screen 3) replacing the temporary steps screen, Waking up (screen 9), Stuck button + screen (8) including the stuck-map fallback and the proxy calls.
