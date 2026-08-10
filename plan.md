# NutriSA — Build Plan

Living checklist. Tick items as they land; don't delete them — a completed history is
useful. Full reasoning behind every decision lives in the spec:
`~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md`

**Workflow:** one feature per branch, one fresh session per branch, all git run manually.

**Status:** Phase 0 in progress · Phases 1–11 not started · v1.1 deferred

---

## Standing rules — apply to every branch, no exceptions

Copy this block into each branch's review before merging.

- [ ] **Zero arithmetic in the model.** Every number comes from the deterministic engine.
- [ ] **Four states on every surface.** Empty, loading, error, happy. No exceptions.
- [ ] **`user_id` never accepted from the client.** Derived server-side from the verified
      Clerk token, injected via the scoped query layer.
- [ ] **One time authority.** All dates flow from `currentLoggingDay()` (Africa/Johannesburg).
      No stray `new Date()`, no client-supplied day key.
- [ ] **44×44px minimum touch targets**, primary actions in thumb reach.
- [ ] **Colour is semantic, never decoration.**
- [ ] **New user-scoped table?** Add it to the POPIA deletion cascade *and* the export
      in the same branch. A table that escapes the cascade is a silent legal hole.
- [ ] **Any real bodyweight entering a committed fixture gets −9.0kg first.**
- [ ] Engine test suite green before merge.

### Design tokens (fixed)

| Token | Value | Use |
|---|---|---|
| Background | `#0D0F14` | App ground |
| Card | `#13161E` | Surfaces |
| Secondary | `#1A1E29` | Nested surfaces |
| Primary | `#0066FF` | Primary actions |
| Green | `#22C55E` | Loss / success |
| Red | `#FF3B30` | Gain / over target |
| Amber | `#F59E0B` | Warnings |
| Protein | `#A78BFA` | Macro — reserved |
| Carbs | `#FCD34D` | Macro — reserved |
| Fats | `#2DD4BF` | Macro — reserved |

Typography: **Barlow Condensed 800 italic** for stats and titles, **Barlow 400–600** for body.

---

## Phase 0 — Prerequisites

No code. Blocks Phase 1.

- [ ] Create Clerk account (Google sign-in), copy the user id
- [ ] Add `MIGRATION_TARGET_USER_ID` to `.env` (never hard-code, never commit)
- [ ] Create Neon project, add `DATABASE_URL` to `.env`
- [ ] Confirm current macro targets — assumed **2300 kcal / 167P / 195C / 60F**
- [ ] Set **$10/month hard spend cap** in the Anthropic Console
- [ ] Verify `.env` is gitignored
- [ ] Export the Supabase data (all 5 tables) and keep a local backup before touching anything

---

## Phase 1 — `engine-and-migration`

**Goal:** a proven deterministic engine and 60 days of history living in Neon, verified
byte-for-byte against the oracle. No auth, no server, no UI, no spend.

### Housekeeping
- [ ] Investigate and remove the stray `src/node_modules/` (breaks Metro later)
- [ ] Install Vitest, Drizzle, `drizzle-kit`, `@neondatabase/serverless`, `tsx`
- [ ] Create `packages/engine/` (pure TS, zero runtime deps) and `packages/shared/`
- [ ] Wire path aliases in `tsconfig.json` so client and server can both import them

### Schema — `db/schema.ts`
- [ ] `weight_logs` — id, user_id, date, weight, created_at
- [ ] `meal_logs` — header totals + `items jsonb`, index on `(user_id, date)`
- [ ] `custom_meals` — same header + jsonb items shape, keys aligned to `meal_logs`
- [ ] `foods` — **nullable** user_id, `source` enum, per100/per_unit, barcode
- [ ] `foods` constraint: `UNIQUE NULLS NOT DISTINCT (user_id, barcode) WHERE barcode IS NOT NULL`
- [ ] `water_logs` — id, user_id, date, cups, created_at
- [ ] `targets` — effective-dated, `UNIQUE (user_id, valid_from)`, **no `valid_to`**
- [ ] `profiles` — all fields nullable
- [ ] `chat_conversations` / `chat_messages`
- [ ] `ai_usage` — token columns + `cost_usd numeric(12,6)` + `rate_version`, index `(user_id, ts)`
- [ ] Generate and apply migrations against Neon

### Engine — `packages/engine/`
- [ ] `time.ts` — `currentLoggingDay()`, `isValidLogDate()` (no future, none before first log)
- [ ] `trend.ts` — `trendWeightSeries()`, `tw[i] = round(0.1*w[i] + 0.9*tw[i-1], 2)`
- [ ] `macros.ts` — `dayTotals()`, `remainingMacros()`
- [ ] `targets.ts` — `resolveTargetForDate()` (greatest `valid_from <= date`)
- [ ] `cost.ts` — `computeUsageCost()` + versioned rate table
- [ ] Confirm rounding is half-up and float-safe (scale → round → unscale)

### ⚠️ Resolve first, before anything else
- [ ] **Does the trend iterate over logged rows or calendar days?** Across the 37-day gap
      (2026-06-17 → 2026-07-24) that's 1 step vs 37 and the answers diverge wildly
- [ ] Confirm the seed: is `tw[0] = w[0]`?

### Migration — `scripts/migrate-supabase-to-neon.ts`
- [ ] Read `MIGRATION_TARGET_USER_ID` from `.env`
- [ ] Migrate 38 `weight_logs` — preserve both `date` and `created_at` (they diverge)
- [ ] Migrate 38 `meal_logs` — parse `ings_json` text → jsonb, rename column to `items`,
      keep object keys `{name, qty, kcal, pro, carb, fat}` identical
- [ ] **Migrate `qty` verbatim as a string. Do not parse, do not "fix".**
- [ ] Migrate 4 `custom_meals` — align to the same jsonb key shape
- [ ] Migrate 11 `custom_foods` → `foods` with `source='manual'`, barcodes preserved
- [ ] Migrate 1 `water_logs` row
- [ ] Stamp every row across all five tables with the Clerk user_id
- [ ] Seed one `targets` row at `valid_from` = earliest logged date
- [ ] Add a `--dry-run` mode that reports counts and writes nothing

### Verification — the merge gate
- [ ] Engine suite green: trend, macros, remaining, target resolution, SAST boundary
      (incl. the 00:40 case), back-date bounds, cost calc
- [ ] **Trend series reproduces byte-for-byte from the 38 rows now in Neon** —
      not Supabase, not a fixture. Including the post-gap row.
- [ ] Any committed fixture carries the −9.0kg offset
- [ ] Row counts match source: 38 / 38 / 4 / 11 / 1

---

## Phase 2 — `api-and-auth`

**Goal:** a Hono API on Vercel where reading another user's data is structurally impossible.

- [ ] Scaffold Hono app, deploy to Vercel, confirm it responds
- [ ] Clerk middleware: verify session token → produce a `UserScope`
- [ ] Scoped query layer — data functions **cannot be called** without a `UserScope`
- [ ] Confirm no route reads `user_id` from a body, param, or header
- [ ] `GET /day/:date` — day summary (engine-computed)
- [ ] `POST /meal-logs` — accepts client UUIDv7, `ON CONFLICT (id) DO NOTHING`
- [ ] `DELETE /meal-logs/:id`
- [ ] `POST /weight-logs` + `GET /weight-logs`
- [ ] `POST /water-logs`
- [ ] `GET /targets`, `POST /targets`
- [ ] Back-date support: `date` accepted and validated, `created_at` always real instant
- [ ] Shared zod schemas in `packages/shared/`, imported by both sides
- [ ] Sentry wired with `sendDefaultPii: false`, no request bodies, no weight/macro
      values in breadcrumbs
- [ ] Rate-limit or at minimum log unauthenticated request volume

### Security tests (Neon branch, real Postgres — not mocks)
- [ ] User A cannot read or write user B's rows
- [ ] Unauthenticated request to a protected route is refused

---

## Phase 3 — `app-shell`

**Goal:** signed in, on the phone, four tabs, correct dark identity. Free — Expo Go only.

- [ ] Install Expo Go on the iPhone 15, confirm `expo start` connects over LAN
- [ ] Barlow + Barlow Condensed via `expo-font`
- [ ] Theme module with the fixed token table — dark-first, **no light theme, no toggle**
- [ ] Four bottom tabs: Dashboard, Nutrition, Weight, Library
- [ ] Clerk provider + secure token cache
- [ ] **Google sign-in working in Expo Go** ⚠️ *unverified assumption — validate here*
- [ ] Signed-out screen and sign-in flow
- [ ] React Query provider + typed API client using the shared schemas
- [ ] Shared state components: `<Empty>`, `<Loading>`, `<ErrorState>` — reused everywhere
- [ ] Verify 44×44px targets and thumb reach on the real device, one-handed

---

## Phase 4 — `manual-logging`

**Goal:** the ~⅓ of logging that OFF can't serve. Must be fast and pleasant, not punished.

- [ ] Dashboard: today's totals vs targets, remaining macros, macro colour coding
- [ ] Dashboard answers the three questions in under 10s: what am I looking at,
      how am I tracking, what do I log next
- [ ] Nutrition tab: day view, meals in `sort_order`, `logged_time` shown
- [ ] Manual entry form — the speed-critical surface
- [ ] Unit type selector: g, slices, pieces, tbsp, tsp, cup, ml
- [ ] Macros always `quantity × per-unit`, **unit label always visible**
- [ ] Gram inputs debounced at **300ms**
- [ ] Save a new food to `foods` with `source='manual'` from the entry flow
- [ ] Edit and delete a logged meal
- [ ] Back-date a meal to a past day
- [ ] Water tracking — one integer per day, tap to increment
- [ ] Client mints UUIDv7 for every new row
- [ ] All four states on every new surface
- [ ] **Time yourself: manual log start → saved, under 10 seconds**

---

## Phase 5 — `weight-and-trend`

**Goal:** a trend you can trust, and a raw weight that never pretends to be progress.

- [ ] Weight tab: log today's weight, one-handed
- [ ] Back-date a weight entry
- [ ] Trend chart — trend line is the hero, raw points are secondary
- [ ] **Raw daily weight is never presented as progress** — visually subordinate
- [ ] Current trend weight + change over 7 / 30 days, green for loss, red for gain
- [ ] Weekly rate of loss (engine-computed)
- [ ] Empty state before the first weigh-in; gap handling matches engine semantics
- [ ] Edit / delete a weight entry
- [ ] Verify the chart against the migrated 38-row series — numbers must match the engine

---

## Phase 6 — `library-and-builder`

- [ ] Library tab: saved meals list, search, categories
- [ ] Meal builder: compose from `foods` rows, live engine-computed running totals
- [ ] Save a composed meal to `custom_meals`
- [ ] Log a saved meal to today in one or two taps
- [ ] Edit / delete a saved meal
- [ ] Food search across own + global rows, single merged result list
- [ ] Create / edit a food (per100 **or** per_unit — exactly one, enforced)
- [ ] Verify the 4 migrated `custom_meals` and 11 migrated foods render correctly

---

## Phase 7 — `barcode-scan`

**Goal:** the first logging tier, and the start of the SA food-database moat.

- [ ] `expo-camera` `<CameraView>` + `onBarcodeScanned` prop
      (**not** `launchScanner()` / `onModernBarcodeScanned()` — not in Expo Go)
- [ ] Camera permission request with a clear rationale, and a denied state
- [ ] Local `foods` lookup by barcode **first** — cached hit never touches the network
- [ ] Open Food Facts lookup on miss
- [ ] **Cache every OFF hit permanently** as a global row (`user_id NULL`, `source='off'`)
- [ ] **Never re-fetch a barcode already resolved** — first resolution is permanent
- [ ] Not-found state falls through cleanly to the label-photo tier
- [ ] OFF timeout / outage handled — degrade to manual, don't hang
- [ ] Scanned food flows into the log form with quantity prefilled
- [ ] Confirm the partial unique index actually prevents duplicate global barcodes

---

## Phase 8 — `label-ocr`

**Goal:** the middle tier, fast, with a failure path as polished as the happy path.

- [ ] Capture a label photo via `expo-camera`
- [ ] Server route → `claude-haiku-4-5-20251001` with strict JSON schema
      (`output_config.format`), no thinking config (Haiku 4.5 has no adaptive thinking)
- [ ] **Synchronous — documented exception to enqueue-only.** Note the reason in code.
- [ ] Hard 15s server-side timeout (Vercel Hobby ceiling is 60s)
- [ ] **Photo is ephemeral** — sent, extracted, discarded. No ImageKit, no retention.
- [ ] Write to `ai_usage` with `feature='ocr'`
- [ ] Log OCR p50/p95 latency and failure rate to Sentry
- [ ] **On any failure → manual entry with the photo still on screen and partial
      fields pre-filled.** Never lose the photo, never force a restart.
- [ ] Confirmation step before saving — transcription is reviewed, not trusted
- [ ] Result saveable to `foods` with `source='label_scan'`
- [ ] Test against a real SA label that OFF does not have

---

## Phase 9 — `ai-chat`

**Goal:** an assistant grounded in real data that cannot write and cannot invent a number.
Largest cost risk in the app.

### Model config
- [ ] Single server-side config module — model IDs as constants, never inline strings
- [ ] `claude-sonnet-5`, `thinking: {type: "disabled"}`, `output_config: {effort: "low"}`
      *(both required — Sonnet 5 thinks by default and effort defaults to `high`)*
- [ ] No `temperature` / `top_p` (rejected on Sonnet 5)
- [ ] Tier-down fallback on error, logged to Sentry — the chat degrades, never dies

### Tools — reads return engine values, never raw rows
- [ ] `get_day_summary(date)`
- [ ] `get_remaining_macros(date)`
- [ ] `get_weight_trend(range)`
- [ ] `get_targets(date)`
- [ ] `get_saved_meals()`
- [ ] `search_foods(query)`
- [ ] All six filter by server-derived `user_id`

### Write path — structurally incapable of writing
- [ ] `propose_meal_log` returns a proposal object and **touches nothing**
- [ ] Proposals may only reference `food_id`s resolved via `search_foods` /
      `get_saved_meals`; unfound food → say so, offer manual entry
- [ ] Confirmation card macros computed **by the engine** from stored food rows
- [ ] Confirm tap calls the ordinary `POST /meal-logs` — no assistant-specific write route

### Streaming & persistence
- [ ] SSE from Hono, consumed with `expo/fetch` + `resp.body.getReader()`
- [ ] Token-by-token render
- [ ] Conversations persist and scroll back
- [ ] Reachable from the Dashboard
- [ ] Whole turn (tool call → Neon → stream) fits inside the 60s Vercel ceiling — measure it

### Budget — three layers
- [ ] Write `ai_usage` on every response (input, output, cache_read, cache_creation)
- [ ] Cost computed by the engine from the versioned rate table
- [ ] Pre-flight gate sums current **SAST-month** spend before each turn
- [ ] **Fails closed** — ledger query error refuses the turn, as an explicit branch
- [ ] Cheaper-model rung offered before hard refusal
- [ ] Designed "budget exhausted" state, not a 500
- [ ] Confirm the $10 Console cap from Phase 0 is live
- [ ] Cache breakpoint after system prompt + tool defs; nothing volatile before it
- [ ] Verify caching works — `cache_read_input_tokens` non-zero on turn 2
- [ ] Baseline real token cost with `messages.countTokens()`, never an estimate

---

## Phase 10 — `weekly-report`

- [ ] Inngest cron, weekly, SAST-aware
- [ ] Engine assembles the full metric pack **before** the model is called
- [ ] Model narrates precomputed numbers only — no arithmetic
- [ ] Report persisted and viewable in-app
- [ ] Handles a sparse week (few logs) without inventing a trend
- [ ] Writes to `ai_usage` with `feature='weekly_report'`
- [ ] Retries and failure handling verified — this is genuine enqueue-only work

---

## Phase 11 — `popia`

**Goal:** rights you can honour, stated in one honest sentence.

- [ ] Explicit opt-in consent gate for health data on first sign-up
- [ ] Consent recorded with a timestamp
- [ ] Privacy notice covering: what's collected, why, retention, the two rights
- [ ] **Export** — all data, machine-readable, all tables incl. chat
- [ ] Export offered at the point of deletion ("download before you delete")
- [ ] Clerk `user.deleted` webhook → Inngest cascade job
- [ ] Cascade deletes: `weight_logs`, `meal_logs`, `water_logs`, `targets`, `profiles`,
      `chat_conversations`, `chat_messages`, `ai_usage`, `foods WHERE user_id = <user>`
- [ ] Global foods (`user_id IS NULL`) survive — verify explicitly
- [ ] Cascade job is **idempotent** — a retried partial delete completes, doesn't error
- [ ] Comment the job as the single authority on user-data tables
- [ ] Type-to-confirm gate before deletion, with "this cannot be undone"
- [ ] Test the full round trip on a throwaway Clerk user: create → log → export → delete
      → confirm zero rows remain and global foods are intact
- [ ] Re-audit Sentry for leaked health data in real captured events

---

## v1.1 — `offline-queue` (deferred)

Only after v1.0 is in daily use.

- [ ] Persist the React Query cache to disk
- [ ] Today's dashboard, targets, saved meals render instantly and offline
- [ ] Manual + saved-meal logs queue with an explicit "pending" badge
- [ ] Flush on reconnect, deduped by client UUIDv7
- [ ] **Idempotent double-flush test ships with this branch**
- [ ] Barcode / OCR / chat stay network-required and say so clearly
- [ ] ⚠️ **Open decision:** may the shared pure engine run client-side over pending rows
      to show an optimistic total? *(The rule is "no model does arithmetic", not
      "no client does" — but this was deliberately left unresolved.)*

---

## Deferred backlog — cuts with named re-add triggers

| Cut | Re-add when |
|---|---|
| Local-first SQLite two-way sync | Multi-user with heavy offline use — **not** v1.1 |
| Adaptive TDEE recalc (weekly Inngest job) | 3+ weeks logging in the new app + profile fields filled |
| Roles, tiers, sharing, admin, billing | A second real user exists |
| E2E device tests (Maestro / Detox) | Multi-user, when regressions hurt someone who isn't you |
| Progress photos / ImageKit | Separate feature; **never** used by label OCR |
| Device-timezone support | Going international — v2 migration, clear trigger |
| Apple Developer Program ($99/yr) + EAS dev client | **Sign in with Apple**, or wanting NutriSA installed as its own app |

---

## Open questions

- [ ] Trend semantics across the 37-day gap — rows or calendar days? *(blocks Phase 1)*
- [ ] Trend seed — is `tw[0] = w[0]`? *(blocks Phase 1)*
- [ ] Confirm targets 2300/167/195/60 *(blocks Phase 1 migration)*
- [ ] Does Clerk's Google OAuth actually work in Expo Go? *(validate in Phase 3)*
- [ ] Client-side engine for optimistic offline totals? *(v1.1)*
- [ ] EAS free-tier build count — Expo's docs don't state it; check expo.dev/pricing
      when you reach the paid step

## Known risks

- **Trend reproduction is unproven and everything sits on it.** If Phase 1's oracle test
  fails, nothing downstream can be trusted — recover the exact semantics from the old code.
- **OFF resolved 2 of 6 pantry items.** Manual entry speed is a product requirement.
- **Sonnet 5 intro pricing ($2/$10) ends 2026-08-31.** Budget against $3/$15.
- **Sonnet 5's tokenizer runs ~30% heavier** than the previous generation — measure, never
  estimate, and never with `tiktoken` (OpenAI's tokenizer, undercounts Claude badly).
- **The deletion cascade rots silently** unless every new user-scoped table is added to it.
- **Solo dev, university workload.** The irreversible work is deliberately front-loaded so
  whatever ships stands on a correct foundation.
