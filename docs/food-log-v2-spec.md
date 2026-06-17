# Food & Activity Log v2 — Specification

**Status:** Design proposal · **Author:** Claude (nightly routine) · **Date:** 2026-06-17
**Branch:** `claude/bold-rubin-reme7p`
**Scope:** Consolidate all existing nutrition tracking into one upgraded food log, add micronutrient tracking, nutrition trends/analysis, and goal-aligned recommendations — while staying fully compatible with Nikhil's World.

---

## 0. TL;DR

- **Recommendation: JSON-based, in-app upgrade** (new applet revision inside `index.html`), **not** a standalone app. Rationale in §6.
- The current food log is solid and well-loved; **everything is preserved**. v2 is **additive and backward-compatible**: v1 data loads unchanged, micronutrients are optional fields.
- The **micronutrient data already exists** — Nikhil has been hand-writing per-day vitamin/mineral tables into the **Brain Dump** doc. v2 formalizes those into the schema instead of leaving them stranded in prose.
- New capabilities: a per-item **nutrient profile**, a **micronutrient adequacy engine** (%RDA vs. a vegetarian-in-Alaska target profile), **rolling trend analysis**, and **goal-aligned recommendations** that already match the "Watch & track" panel (iron/zinc/ferritin panel, vitamin D, protein 130 g).
- **Gmail + Drive ingestion**: a Reduction-style nightly routine reads (a) Brain Dump micronutrient tables, (b) Health Snapshots, and (c) forwarded label/photo emails, and merges structured days into `nikhil-food-log-v2` via the existing merge pipeline.

---

## 1. Current system audit (what exists today)

### 1.1 Where it lives
- **Single-file React SPA**: `index.html` (~463 KB), components transpiled in-browser via Babel `<script type="text/babel">`. Hosted on Firebase (`firebase.json`, project `nikhils-world`).
- **The food log applet**: `FoodLog()` component (`index.html:4487`), rendered in the `food` pane (`index.html:7873`). Header label "Food & Activity Log", footer "Health Log v2".
- **Persistence**: `window.storage` (`index.html:110`) → Firestore collection `appdata`, doc id = storage key. Reads/writes go through `useDebouncedPersist(key, initial)` (`index.html:219`) which returns `[state, setState, status, loaded]` and debounces writes with a `SaveStatusPill`.
- **Storage key**: `nikhil-food-log-v1` (`STORAGE_KEY`, `index.html:3229`). Confirmed identical shape in live Firestore backups (`nikhil-world-backup-2026-*.json`, latest food entry 2026-05-20).
- **Nightly read**: the **Kaizen Reduction** engine (`nikhil-reduction-v5.md`) pulls `nikhil-food-log-v1` from Firestore each night at 04:00 AKDT and writes a `FUEL CHECK` section — it flags sodium stacking and compares protein to the **~130 g** daily target.
- **Daily backups**: full Firestore export JSON dropped into Drive folder **Nikhil's World Backups** (`1aIvWdHh1ee_3OyyC1ckhZr_y8pl96QSM`).

### 1.2 Current data schema (v1)

```jsonc
"2026-04-27": {
  "label": "White Sauce Pizzas + Orgain Shake …",
  "meals": [
    {
      "id": "m1",
      "time": "Afternoon/Dinner",
      "label": "White Sauce Pizzas …",
      "protein_highlight": true,          // optional — flags a protein-anchor meal
      "hungerTag": "hunger",              // optional — hunger | boredom | social
      "photoLink": "https://…",           // optional — Google Photos/Drive link
      "items": [
        { "name": "White sauce pizza slice ×2", "kcal": 400, "notes": "~12g protein" }
      ],
      "note": "…"                          // optional meal-level note
    }
  ],
  "health": {
    "steps": 12088, "active_kcal": 670, "basal_kcal": 1614,
    "rhr": null, "hrv": null, "sleep_hours": null, "sodium_mg": null,
    "notes": "…", "sleep_note": "…"
  }
}
```

Notable quirks the v2 design must respect:
- **Protein is not a field** — it's parsed from `item.notes` with the regex `/~?(\d+(?:\.\d+)?)g protein/` (`calcProtein`, `index.html:3841`). Items may instead carry a numeric `item.protein`.
- **Sodium & sugar live outside the log** in two hard-coded date→value maps: `SODIUM_DATA` (`index.html:3766`) and `SUGAR_DATA` (`index.html:3801`), each `{ mg|g, status: ok|warn|high }`. They are not editable in the UI and must be maintained by hand.
- **`FOOD_LOOKUP`** (`index.html:3864`): ~45 common items, each `{ kcal, protein, sodium, unit }`, powering type-ahead autocomplete with a quantity multiplier (`applyFoodLookup`).

### 1.3 Current feature set (the full list to preserve)

| # | Feature | Code anchor |
|---|---------|-------------|
| 1 | Per-day view: intake / burn / deficit cards | `DayView` `index.html:3994` |
| 2 | Protein tiering (low/mid/on-target, 130 g goal) | `proteinTier` `index.html:3947` |
| 3 | Total-burn = active + basal (fallback 2700) | `getTotalBurn` `index.html:3848` |
| 4 | Sodium & sugar per-day badges + status colors | `index.html:4067` |
| 5 | Body stats row (steps, active, RHR, sleep) | `index.html:4080` |
| 6 | Health notes + sleep notes | `index.html:4093` |
| 7 | **Sodium-stack detector** (≥2 trigger foods/day) | `detectSodiumStack` `index.html:3937` |
| 8 | Meal cards w/ per-item kcal, protein notes, accents | `MealCard` `index.html:3953` |
| 9 | Hunger/driver tags (hunger/boredom/social) | `HUNGER_TAGS` `index.html:3854` |
| 10 | Photo links per meal | `index.html:3979` |
| 11 | Full inline editing: meals, items, health, day label | `MealEditor`/`HealthEditor`/`DayMetaEditor` |
| 12 | Type-ahead food autocomplete + qty multiplier | `FOOD_LOOKUP`/`foodSuggestions`/`applyFoodLookup` |
| 13 | "Ask Claude: check this day" → clipboard prompt | `index.html:4096` |
| 14 | New-day creation + date picker | `NewDayQuickForm` `index.html:4632` |
| 15 | Day pills color-coded by protein tier | `index.html:4593` |
| 16 | **Week/30-day summary** (avg intake/burn/deficit/protein/Na/sugar/steps, per-day bars, Watch & track) | `WeekSummary` `index.html:4357` |
| 17 | Copy-JSON + paste-merge (date-keyed, newest wins) | `index.html:4551`, `index.html:7908` |
| 18 | Firestore persistence + debounced save status | `useDebouncedPersist` |
| 19 | Glance integration → TodayStrip + Pending (low-protein last 7 days) | `useGlanceData` `index.html:276`, `index.html:7556` |
| 20 | Sync-to-Drive backup / restore | `syncToDrive` (System pane) |

---

## 2. What v2 preserves (no regressions)

**All 20 features above ship unchanged.** v2 is a superset:
- v1 documents load as-is. Any day without micronutrient data renders exactly like today.
- `calcProtein`'s notes-regex path stays as a fallback so historical days keep working.
- `SODIUM_DATA` / `SUGAR_DATA` maps remain readable, but their values are **promoted** into the per-day nutrient block so they become editable and chartable (see §4.4 migration).
- The merge/paste pipeline (`index.html:7908`) and the Reduction engine's read of the food key keep functioning — v2 changes the key to `nikhil-food-log-v2` with a one-time migration wrapper (§4.4) and a compatibility read so the nightly routine sees both.

---

## 3. What's new

### 3.1 Micronutrient tracking
Promote the micronutrients **already tracked in the Brain Dump** into first-class data. Target panel (chosen to match Nikhil's profile — vegetarian, Alaska, cycling/VO2 build, the existing "Watch & track" flags):

**Macros (already partly tracked):** protein, carbs, fat, **saturated fat**, **fiber**, **sugar**, **omega-3 (ALA/EPA/DHA)**, **omega-6**.
**Minerals:** **sodium**, **potassium**, **calcium**, **iron**, **zinc**, **magnesium**, selenium *(optional)*.
**Vitamins:** **vitamin D**, **vitamin B12**, **folate**, **vitamin A**, **vitamin C**, **vitamin K** *(optional)*, **vitamin E** *(optional)*.

**Priority "watch" nutrients** (drive the recommendation engine — these are the vegetarian/Alaska risk set and map 1:1 to the current Watch & track panel `index.html:4448`):
`vitamin_d`, `b12`, `iron`, `zinc`, `omega3`, plus the existing `sodium` (cap) and `sugar` (cap).

### 3.2 Nutrition trends & analysis
- **Rolling windows**: 7-day and 30-day averages for every macro + watch nutrient (today only does intake/burn/protein/Na/sugar/steps).
- **Adequacy %**: each nutrient shown as `% of target` with a tri-color status, reusing the existing `ok/warn/high` color helpers.
- **Streaks & deficiency-risk flags**: e.g. "B12 below target 6 of last 7 days", "omega-3 < 1 g for 5 consecutive days", "iron trending down". These feed the same Pending/Glance surface.
- **Correlation strip** (lightweight): protein vs. sleep, sodium vs. RHR, sugar vs. next-day energy — purely descriptive, surfaced as one-liners (no stats engine; the Reduction doc already does cross-source narrative).

### 3.3 Goal-aligned recommendations
A small rules table keyed to Nikhil's actual goals (from the Reduction context + Watch & track panel):

| Goal | Signal | Recommendation surfaced |
|------|--------|-------------------------|
| Protein ≥ 130 g/day | day protein < 130 | "Add a yogurt anchor (+25 g) or Orgain shake (+36 g)" |
| Sodium ≤ 2,300 mg | sodium-stack detected | existing stack warning + lowest-Na swap |
| Sugar < 50 g | sugar warn/high | "Swap one evening sweet for banana/berries" |
| Vitamin D (Alaska) | D < target N days | "Take D3 supplement — Alaska spring = low UV" |
| B12 (vegetarian) | B12 < target | "Fortified nutritional yeast / B12 supplement" |
| Iron + zinc | trending low | "Blood panel pending — schedule ferritin/iron/zinc" |
| Omega-3 (plant) | ALA-only, low EPA/DHA | "Walnuts/flax today; consider algae-oil DHA" |
| VO2 build / recovery | low-protein + hard ride | "Post-ride protein within 1 h" |

Recommendations render in the day view and roll up into the 30-day summary's Watch & track panel (which already hard-codes most of these — v2 makes them data-driven).

---

## 4. v2 Schema

### 4.1 Design principle
**Additive.** Every new field is optional. A v1 item `{name, kcal, notes}` is a valid v2 item. New richness lives under an optional `nutrients` object at the item level and a computed `totals`/`targets` block at the day level.

### 4.2 Item-level (new optional `nutrients`)

```jsonc
{
  "name": "Greek yogurt (~1 cup)",
  "kcal": 170,
  "notes": "~17g protein",            // kept for back-compat + free-text
  "qty": 1, "unit": "cup",            // optional — enables lookup scaling
  "nutrients": {                       // optional — all fields optional
    "protein_g": 17, "carb_g": 9, "fat_g": 0, "sat_fat_g": 0,
    "fiber_g": 0, "sugar_g": 9,
    "sodium_mg": 65, "potassium_mg": 240, "calcium_mg": 200,
    "iron_mg": 0.1, "zinc_mg": 1.0, "magnesium_mg": 22,
    "vitamin_d_iu": 0, "b12_ug": 1.3, "folate_ug": 11,
    "vitamin_a_iu": 0, "vitamin_c_mg": 0,
    "omega3_g": 0, "omega6_g": 0
  },
  "source": "lookup"                   // lookup | manual | brain-dump | label-email | estimate
}
```

### 4.3 Day-level (new optional `totals`, `targets`, `flags`)

```jsonc
"2026-04-27": {
  "label": "…", "meals": [ /* … */ ],
  "health": { /* unchanged: steps, active_kcal, basal_kcal, rhr, hrv, sleep_hours, notes */ },
  "totals": {                          // computed; persisted so the nightly routine can read without recompute
    "kcal": 1757, "protein_g": 80, "carb_g": 190, "fat_g": 70,
    "sat_fat_g": 22, "fiber_g": 24, "sugar_g": 12,
    "sodium_mg": 900, "potassium_mg": 2400, "calcium_mg": 800,
    "iron_mg": 12, "zinc_mg": 8, "magnesium_mg": 150,
    "vitamin_d_iu": 120, "b12_ug": 2.1, "folate_ug": 320,
    "vitamin_a_iu": 2200, "vitamin_c_mg": 60, "omega3_g": 0.8, "omega6_g": 14
  },
  "adequacy": {                        // computed: % of target, status
    "protein_g": { "pct": 62, "status": "warn" },
    "vitamin_d_iu": { "pct": 20, "status": "high" },   // high = far from target / over-cap
    "sodium_mg": { "pct": 39, "status": "ok" }
  },
  "recommendations": [                 // computed from rules table §3.3
    { "key": "vitamin_d", "text": "Take D3 — Alaska spring low UV", "priority": "S5" }
  ],
  "schema": 2
}
```

### 4.4 Targets & migration

**Targets profile** — a single constant `NUTRIENT_TARGETS` (vegetarian male, active; vitamin D bumped for Alaska). Caps vs. floors are typed so the engine knows direction:

```jsonc
{
  "protein_g":   { "type": "floor", "target": 130 },
  "fiber_g":     { "type": "floor", "target": 30 },
  "sodium_mg":   { "type": "cap",   "target": 2300 },
  "sugar_g":     { "type": "cap",   "target": 50, "warn": 90 },
  "iron_mg":     { "type": "floor", "target": 8 },
  "zinc_mg":     { "type": "floor", "target": 11 },
  "calcium_mg":  { "type": "floor", "target": 1000 },
  "magnesium_mg":{ "type": "floor", "target": 400 },
  "potassium_mg":{ "type": "floor", "target": 3400 },
  "vitamin_d_iu":{ "type": "floor", "target": 1000 },
  "b12_ug":      { "type": "floor", "target": 2.4 },
  "folate_ug":   { "type": "floor", "target": 400 },
  "vitamin_a_iu":{ "type": "floor", "target": 3000 },
  "vitamin_c_mg":{ "type": "floor", "target": 90 },
  "omega3_g":    { "type": "floor", "target": 1.6 }
}
```

**One-time migration `migrateV1toV2(v1)`** (pure function, reversible):
1. Copy every v1 day verbatim.
2. Fold `SODIUM_DATA[date].mg` → `day.totals.sodium_mg` and `SUGAR_DATA[date].g` → `day.totals.sugar_g` (the only two micros tracked today).
3. Run `computeDayTotals(day)`: for each item, prefer `item.nutrients`; else scale from the **expanded `FOOD_LOOKUP`** (§5) by `qty`; else fall back to the protein-from-notes regex. Unknown micros stay absent (not zero) so adequacy can show "no data" rather than a false deficiency.
4. Compute `adequacy` + `recommendations`; stamp `schema: 2`.
5. Write to `nikhil-food-log-v2`. Keep `nikhil-food-log-v1` intact and add a tiny compatibility shim so the nightly Reduction reads v2 if present, else v1.

Because totals are persisted, the nightly engine and the Glance/Pending surfaces read pre-computed numbers — no behavior change required in the Reduction routine beyond pointing at the new key.

### 4.5 Expanded `FOOD_LOOKUP`
Today each entry is `{kcal, protein, sodium, unit}`. v2 widens it to the full `nutrients` profile (per 1 unit), so tapping an autocomplete chip auto-fills micros, not just kcal/protein. The ~45 existing items keep their current values; micros are added incrementally (lookup `source: "lookup"`, others `source: "estimate"`). A starter expansion for Nikhil's most-logged anchors (Greek yogurt, Orgain, peanut butter, Beyond/Smart Dog, calzone, Costco pizza, banana, sourdough, tofu, chai) ships in `food-log-v2-lookup.sample.json`.

---

## 5. Reference prototype artifacts (in this PR)
- `docs/food-log-v2-spec.md` — this document.
- `docs/food-log-v2-schema.sample.json` — one fully-populated v2 day + a migrated v1 day, validating back-compat.
- `docs/food-log-v2-lookup.sample.json` — expanded `FOOD_LOOKUP` with micronutrient profiles for the top anchor foods.

These are drop-in references: the JSON validates against §4 and can be pasted straight into the existing **MERGE FOOD LOG** box (`index.html:7908`) once the key is switched, or used to seed `initialLog` in a v2 component.

---

## 6. Implementation approach — recommendation

**Recommend: JSON-based, in-app upgrade (a v2 revision of the FoodLog applet inside `index.html`).** Not a standalone app.

**Why in-app wins here:**
- **Zero integration tax.** It already lives inside Nikhil's World, already syncs to Firestore, already feeds the nightly Reduction, the Glance/Today strip, and the Pending list. A standalone app would have to re-implement `window.storage`, the merge pipeline, the Drive backup, and the Reduction read — and then be kept in sync forever.
- **Data gravity.** The food key is one of nine Firestore docs the Reduction routine and backups already orchestrate. Splitting it out fractures the "one coherent picture of the day" that the whole system is built around (per `nikhil-reduction-v5.md`).
- **Backward-compatible by construction.** Additive schema + migration = no data loss, instant rollback (v1 doc is untouched).
- **Lowest risk to ship.** New helper module + one component swap; the other 8 applets and the build/deploy story are unchanged.

**When a standalone app *would* make sense (not now):** if Nikhil wanted real-time barcode scanning, an offline-first native mobile capture flow, or a third-party nutrition API (e.g. USDA FoodData Central) doing live lookups at scale. Those are post-v2 enhancements that can bolt onto the same `nikhil-food-log-v2` key without a rewrite.

**Build shape (in-app):**
1. New `<script type="text/babel">` block: `nutrition-core` — `NUTRIENT_TARGETS`, expanded `FOOD_LOOKUP`, `computeDayTotals`, `computeAdequacy`, `buildRecommendations`, `migrateV1toV2`. Pure, testable, no JSX.
2. `FoodLog` v2: add a **Nutrients** sub-tab to the day view (vitamins/minerals grid w/ adequacy bars) and a **Trends** view (7/30-day per-nutrient sparklines) alongside the existing Avg summary. Reuse existing color/status helpers and card styling.
3. Point `STORAGE_KEY` → `nikhil-food-log-v2`; run `migrateV1toV2` once on first load if v2 is empty and v1 exists.
4. Editor: extend `MealEditor` items with an optional collapsible "micros" row (auto-filled from lookup; manual override allowed).

---

## 7. Gmail + Google Drive integration (data input)

The cheapest, highest-yield ingestion path reuses the **Reduction engine pattern** — a nightly/over-the-shoulder routine that reads sources and writes structured days, then merges via the existing paste/merge pipeline. No new infra.

### 7.1 Google Drive
- **Brain Dump micronutrient tables (primary, already exists):** Nikhil writes per-day macro+micro tables into the Brain Dump (folder **Nikhil's World Backups** `1aIvWdHh1ee_3OyyC1ckhZr_y8pl96QSM`). A parser reads the current month's "Brain Dump" doc, extracts the `| Nutrient | amount | sources |` tables per date, maps them to `day.totals`/item `nutrients`, and merges. **This recovers the micro data that is currently stranded in prose.**
- **Health Snapshots** (folder `1wvsm88UFiu4bZFMrCViW4npRHTmYbhUf`): already the source of truth for steps/HR/sleep/VO2/HRV in `health{}`. v2 keeps using it; no change.
- **Daily backup JSON**: continues unchanged; now carries the richer v2 doc automatically.
- **Write-back**: the v2 component's existing **Sync to Drive** button already persists the full state to Drive — micros ride along for free.

### 7.2 Gmail
- **Forwarded nutrition labels / receipts**: Nikhil forwards a packaged-food label photo or grocery receipt to himself; the routine searches (Gmail query `has:attachment newer_than:2d` + a `#fuel` subject tag), extracts product + serving nutrients, and either adds them to `FOOD_LOOKUP` or attaches them to that day's item `nutrients` (`source: "label-email"`).
- **Meal-photo emails**: a photo emailed with a one-line caption → a meal entry with `photoLink` (the field already exists, `index.html:3979`) plus an estimated `nutrients` block (`source: "estimate"`), flagged for confirmation.
- This mirrors how the Reduction routine already scans Gmail (`nikhil-reduction-v5.md`, Step 2) — same toolset, new target key.

### 7.3 Trust & confirmation
Anything machine-estimated (`source: estimate | label-email`) is marked so the day view can show an "unconfirmed" dot and the "Ask Claude: check this day" prompt can ask for verification — consistent with the app's existing "check my protein math" affordance.

---

## 8. Summary

**Preserved (all of it):** every current feature — day/meal/health views, protein tiering & notes-parsing, sodium-stack detector, sugar/sodium badges, hunger tags, photo links, full inline editing, food autocomplete, Ask-Claude prompt, 30-day summary, copy/paste-merge, Firestore sync, Glance/Pending integration, nightly Reduction read.

**New:** first-class micronutrient tracking (vitamins, minerals, fiber, omega-3/6, sat-fat) formalized from the Brain Dump tables; per-day totals/adequacy persisted; 7/30-day per-nutrient trends and deficiency-risk flags; a data-driven, goal-aligned recommendation engine (protein 130 g, sodium/sugar caps, vitamin D/B12/iron/zinc/omega-3 watch set tuned for vegetarian-in-Alaska); an expanded `FOOD_LOOKUP` carrying micros; Gmail/Drive ingestion that recovers stranded micro data and accepts label/photo emails.

**Integration:** stays inside Nikhil's World on key `nikhil-food-log-v2` (additive migration from v1, instant rollback), feeding the same backups, Glance surface, and nightly Reduction.

### Next steps for implementation
1. **Review & approve** this spec and the target/cap profile in §4.4 (these are health choices — confirm before coding).
2. **Land the `nutrition-core` module** (pure functions + targets + expanded lookup) with unit checks against `food-log-v2-schema.sample.json`.
3. **Wire `migrateV1toV2`** behind a one-time first-load guard; verify against a real backup (latest live entry 2026-05-20) before switching `STORAGE_KEY`.
4. **Ship the Nutrients + Trends views** in the FoodLog applet, reusing existing styling.
5. **Add the Brain Dump table parser** to the nightly routine and point the Reduction `FUEL CHECK` at `nikhil-food-log-v2`.
6. **Backfill** historical micros from the Brain Dump tables (Mar 22 → present) via the merge box.
