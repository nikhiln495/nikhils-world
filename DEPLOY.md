# Deploying the Phase 0.1 keystone (manual — Nikhil runs this, not a routine)

1. firebase use nikhils-world && firebase init functions (TypeScript, no ESLint, install deps yes)
2. Confirm functions/src/index.ts matches this PR. Confirm functions/package.json has "engines": {"node": "20"}.
3. firebase functions:secrets:set ANTHROPIC_API_KEY -> paste the sk-ant-... key.
4. firebase deploy --only functions -> copy the printed URL.
5. Paste that URL into AI_PROXY_URL in index.html, commit, push (or firebase deploy --only hosting).
6. Test: open nikhils-world.web.app, trigger Fireflies sync. A real response = the keystone landed.
7. Set a $1-5 Google Cloud budget alert (Billing -> Budgets & alerts), separate from the in-function per-day ceiling.
