# Spec P1 — Practice tab: progress

Branch: `claude/kind-shannon-6i3pkk` (assigned by the environment).

## Where I am

Step 1 of 4 done: precondition check + Fireflies cleanup. Next: step 2 (data layer, tab placement, Today, Library).

## Precondition

- `const AI_PROXY_URL = "https://us-central1-nikhils-world.cloudfunctions.net/anthropic"` present in index.html (main, from PR #11). ✅
- `const AI_MODEL = "claude-sonnet-5-5"` present. ✅

## Cleanup

- `syncFireflies` and the "🔄 Sync Fireflies" button removed from SessionsPanel; the now-unused `syncing` state removed; the empty-state hint no longer mentions Fireflies sync. The foci-analysis call (`analyzeFoci`) is unchanged.
- Checked: `grep -n "syncFireflies\|Sync Fireflies\|api.fireflies" index.html` → no matches; page loads with no console errors in the harness.

## Screens

| # | Screen | Status | How checked | Known problems |
|---|--------|--------|-------------|----------------|
| 1 | Today | not started | — | — |
| 2 | Library | not started | — | — |
| 3 | Guided flow | not started | — | — |
| 4 | Learn | not started | — | — |
| 5 | Dr. Shobha | not started | — | — |
| 6 | Gaps | not started | — | — |
| 7 | Progress | not started | — | — |
| 8 | Stuck | not started | — | — |
| 9 | Waking up | not started | — | — |

## How checks are run

`NODE_PATH=$(npm root -g) node scripts/p1-check.js` loads index.html in headless Chromium with:
- `window.storage` replaced by an in-memory mock (the page's own assignment is ignored), seeded with fixture `practice:` docs;
- every Firebase / Firestore / Google / api.anthropic.com request aborted, so the live Firestore is never read or written;
- the AI proxy answered by a local fake.
Console errors from the deliberately blocked requests are counted separately; any other console error fails the check.

## Checks log

- Step 1: harness load → nav renders, console errors: none. `grep -c "api.anthropic.com" index.html` → 0.
