# NutriSA — Build Plan

Living checklist. Tick items as they land; don't delete them — a completed history is
useful. Full reasoning behind every decision lives in the spec:
`~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md`

**Workflow:** one feature per branch, one fresh session per branch, all git run manually.

**Status (2026-08-12):** Phase 0 done bar the Anthropic spend cap · **Phase 1 engine and
migration complete** — all 11 tables live in Neon, the 38-row history migrated and verified,
73 engine tests green · **the trend algorithm was corrected from per-row to per-calendar-day
after checking it against the real data; the spec's stated hypothesis was wrong** ·
**Phase 3 auth shipped early and verified on device — the rest of Phase 3 has not.** Sign-in
(Google and Apple), the token cache, the four native tabs and the fonts are all on the
iPhone and working; **four items remain open**: the React Query provider and typed client,
the shared `<Empty>` / `<Loading>` / `<ErrorState>` components, the sign-out cache-leak
re-check (it cannot be done until there is health data to leak), and the 44×44 / thumb-reach
pass on device. Read "Phase 3" as "auth", not as the phase · Clerk → Neon sync live via Inngest
in dev mode · the POPIA cascade is now structural — every user-scoped table cascades from
`users` · Water tracking cut from v1 · the fourth tab is **AI Assistant**, not Library —
the library became a screen inside Nutrition (2026-08-12) · Phases 2, 4–12 not started ·
v1.1 deferred

**Auth summary — revised 2026-08-11, this supersedes the original plan.** Google **and
Apple** both ship in Phase 3, on **one** sign-in screen, via Clerk's `useSSO()` browser
flow in Expo Go. Apple did **not** need the $99 Apple Developer account: that fee buys
the *native* Apple sheet (`expo-apple-authentication`), not the ability to offer Apple
sign-in. Phase 12 is therefore a UX upgrade, not the gate on having Apple auth. Phase 2
is still server-side Clerk middleware with no UI; Phases 1–2 have no login screen
because they have no client.

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
- [ ] **ImageKit is for stored, displayed images only.** It is never in the label-OCR
      path. OCR photos are captured, sent to the model, and discarded — never uploaded,
      never retained. Private keys stay server-side; only the URL endpoint reaches the client.
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

- [x] **SDK 57 upgrade attempted and reverted — 2026-08-10.** It typechecked clean and
      passed `expo-doctor` 20/20, then died on the device: *"Project is incompatible with
      this version of Expo Go."*
      **The lesson, which outranks the docs: App Store Expo Go supports exactly one SDK at
      a time, and the iPhone reports SDK 54.** Newer SDKs ship on npm and in the docs long
      before the Expo Go binary clears Apple review — SDK 57's was still in the queue.
      `eas go` builds a personal Expo Go for a newer SDK but needs the paid Apple account,
      i.e. Phase 12. **The device decides the SDK, not `docs.expo.dev/versions/latest`.**
- [x] Create Clerk account (Google sign-in), copy the user id — development instance
      `glowing-joey-19`, with **both** Google and Apple social connections enabled
      (confirmed by reading the instance's `/v1/environment`, 2026-08-10)
- [x] Add `MIGRATION_TARGET_USER_ID` to `.env` (never hard-code, never commit) —
      **added and verified 2026-08-12.** Checked by shape (`user_` + 20+ chars), not on
      trust: this item was previously ticked on trust while the line did not exist
- [x] Create Neon project, add `DATABASE_URL` to `.env`
- [x] Confirm current macro targets — **2300 kcal / 167P / 195C / 60F, confirmed by
      Sriman 2026-08-12.** No longer an assumption; this is what the migration seeds the
      first `targets` row with
- [ ] Set **$10/month hard spend cap** in the Anthropic Console
- [x] Verify `.env` is gitignored — `.gitignore:12`, re-confirmed 2026-08-11
- [x] Export the Supabase data and keep a local backup — **4 tables exported 2026-08-12**
      to `data/supabase_export/` (gitignored). The 5th, `water_logs`, was not exported
      because the feature was cut

> ⚠️ **`.env` re-read 2026-08-12.** `DATABASE_URL`, `CLERK_WEBHOOK_SIGNING_SECRET` and
> `MIGRATION_TARGET_USER_ID` are all present and all three are proven working — the
> migration ran against Neon and Clerk deliveries verify against the signature. Still
> **empty**: `OPENAI_API_KEY`, `UNSPLASH_*`, `IMAGEKIT_*`. None of those block anything
> before Phase 7.

---

## Phase 1 — `engine-and-migration`

**Goal:** a proven deterministic engine and 60 days of history living in Neon, verified
byte-for-byte against the oracle. No auth, no server, no UI, no spend.

### Housekeeping
- [x] Investigate and remove the stray `src/node_modules/` — gone as of the SDK 57 upgrade
- [x] Install Drizzle, `drizzle-kit`, `@neondatabase/serverless`, `tsx` —
      `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `@neondatabase/serverless` 1.1.0,
      `tsx` 4.23.11. `drizzle.config.ts` points at `server/db/schema.ts`
- [x] **Install Vitest** — 4.1.10, `vitest.config.mts` scopes the run to
      `packages/**/*.test.ts` only. `npm test` is the gate
- [x] Create `packages/engine/` (pure TS, zero runtime deps) — **`packages/shared/` not
      created**: it holds the zod schemas both sides import, and there is no API to write
      contracts for until Phase 2. Creating it empty now would just be a directory
- [x] Wire path aliases in `tsconfig.json` so client and server can both import them —
      `@engine` and `@engine/*`. Runtime resolution verified under `tsx` (the server's
      runtime); Metro resolves it via the same `tsconfigPaths` support that already
      serves `@/*`, **unverified on device** because nothing imports it yet

### Schema — `server/db/schema.ts`

All 11 tables are live in Neon as of 2026-08-12. `users` arrived earlier with the Clerk
webhook work; the rest landed in migration `0001`, plus a `note` column in `0002`.

Every user-scoped table below carries a cascading foreign key to `users.clerk_id` via the
`userId()` helper, which is what makes the Phase 11 deletion cascade structural rather
than a list somebody has to remember to update.

- [x] `users` — Clerk mirror: `clerk_id` PK, email, first/last name, image_url,
      created_at, updated_at. Migration `0000_young_thunderball.sql` **applied to Neon
      2026-08-11**; the table had been empty until then, so the sync job would have
      failed on its first real signup

#### Clerk → Neon sync (arrived with the webhook work, not the migration work)
- [x] Hono webhook route verifies the Svix signature and enqueues; the DB write happens
      in Inngest so a slow write can't time out Clerk's delivery. Unsigned POST → 400,
      verified from the public internet
- [x] Inngest running **dev-mode only** — no `INNGEST_EVENT_KEY`, no `INNGEST_SIGNING_KEY`;
      introspection reports `mode: dev`, `has_event_key: false`, `has_signing_key: false`
- [x] `user.created` → upsert. **Verified end to end on two real Google accounts,
      2026-08-11** — correct emails and avatars, replay lands on one row not two
- [x] `user.updated` → same upsert, shared helper so the two paths cannot drift
- [x] `user.deleted` → row removed; see the Phase 11 cascade below
- [x] ngrok bound to a permanent free-plan domain, so Clerk's endpoint URL is set once
- [x] `weight_logs` — id, user_id, date, weight, created_at. Added `UNIQUE (user_id, date)`
      beyond the spec: the trend takes one step per row, so a duplicate day double-steps
      the series and every value after it is quietly wrong
- [x] `meal_logs` — header totals + `items jsonb`, index on `(user_id, date)`
- [x] `custom_meals` — same header + jsonb items shape, keys aligned to `meal_logs`
- [x] `foods` — **nullable** user_id, `source` enum, per100/per_unit, barcode.
      `CHECK` enforces exactly one of per100 / per_unit
- [x] `foods` constraint — same semantics, written as a partial unique index on
      `coalesce(user_id, '')`. `NULLS NOT DISTINCT` cannot be combined with a `WHERE`
      clause through Drizzle's builder; folding NULL to a sentinel is equivalent because
      the empty string is not a possible Clerk id. **Phase 7 still has to prove it stops
      duplicate global barcodes against real Postgres**
- [x] `water_logs` — id, user_id, date, cups, created_at, `UNIQUE (user_id, date)`
- [x] `targets` — effective-dated, `UNIQUE (user_id, valid_from)`, **no `valid_to`**
- [x] `profiles` — all fields nullable
- [x] `profiles.goal_weight_kg` — **not in the original spec.** Found missing 2026-08-12
      while working out what the dashboard needs: "1.4 kg to goal", the "% of the way"
      ring and the chart's goal line all depend on it and none could be computed without
      it. Migration `0003_shiny_blue_marvel.sql` **applied 2026-08-12** — confirmed
      against Neon (4 migrations recorded, column present). **No row populates it yet:
      `profiles` is empty, so the goal weight is absent, not zero.** Deliberately not
      effective-dated, unlike
      `targets`; the starting weight is not stored because it is the first trend point
- [x] `chat_conversations` / `chat_messages`
- [x] `ai_usage` — token columns + `cost_usd numeric(12,6)` + `rate_version`, index `(user_id, ts)`
- [x] Generate and apply migrations against Neon — `0001_amused_stark_industries.sql`
      **applied 2026-08-12**. Verified by reading Neon back, not on trust: 11 tables
      present, all empty except `users` (1 row, the Clerk mirror); the partial unique
      index on `coalesce(user_id, '')` and the `foods_one_basis` CHECK both exist; 10
      cascading FKs point at `users` (the 11th cascade is `chat_messages` →
      `chat_conversations`)

### Engine — `packages/engine/`
- [x] `time.ts` — `currentLoggingDay()`, `checkLogDate()` / `isValidLogDate()`, plus
      `logMonth()` for the Phase 9 SAST-month budget gate
- [x] `trend.ts` — `trendWeightSeries()`, `tw[i] = round(0.1*w[i] + 0.9*tw[i-1], 2)`,
      plus `trendChangeOverDays()` (trend-to-trend, never raw-to-raw)
- [x] `macros.ts` — `dayTotals()`, `remainingMacros()`, `macroProgress()`
- [x] `targets.ts` — `resolveTargetForDate()` (greatest `valid_from <= date`)
- [x] `goal.ts` — **not in the original spec's module list**, added 2026-08-12 for the
      dashboard. `goalProgress()` drives the "% of the way" ring (clamped at 1, unlike the
      macro rings — past the goal is arrival, not information) and `projectTrend()` draws
      the dashed amber line and computes the goal ETA the spec asks for. Rate is measured
      over 14 days, not the 7 the dashboard displays: 7 is right to *show* but too noisy
      to extrapolate weeks from. Returns no ETA when the rate points away from the goal,
      is flat, or lands more than a year out — verified against the real series, where a
      95 kg goal correctly gets no date at the current +0.49 kg/week
- [x] `cost.ts` — `computeUsageCost()` + versioned rate table. Sonnet 5 entered at the
      **standard** $3/$15, not the $2/$10 intro rate that lapses 2026-08-31
- [x] Confirm rounding is half-up and float-safe (scale → round → unscale) — `round.ts`.
      **If the oracle fails, this is the first knob to turn**: `Math.round(x*100)/100`
      and `Number(x.toFixed(2))` disagree on an exact half, and the trend feeds each
      rounded value forward

### ⚠️ Resolve first, before anything else
- [x] **Does the trend iterate over logged rows or calendar days? — CALENDAR DAYS.
      Resolved 2026-08-12, and it contradicted the spec.** The spec's stated hypothesis
      was per-row. Computing both readings from the 38 migrated rows put the final trend
      at **98.25 kg per row vs 98.84 kg per calendar day**; Sriman confirmed the old app
      showed 98.84. `trend.ts` was rewritten to step per day, carrying the last known
      weight forward on days with no weigh-in. Across the 37-day gap that is 37 steps,
      not one. **This is why the item said "resolve first": everything downstream would
      have been confidently wrong by 0.59 kg.**
- [x] Confirm the seed: is `tw[0] = w[0]`? — **yes.** Held under the per-day reading and
      reproduces 98.84 exactly; a different seed does not.

### Migration — `scripts/migrate-supabase-to-neon.ts`
- [x] Read `MIGRATION_TARGET_USER_ID` from `.env`
- [x] Migrate 38 `weight_logs` — preserve both `date` and `created_at`. **They diverge on
      30 of the 38 rows**, so collapsing them would have re-dated most of the history
- [x] Migrate 38 `meal_logs` — parse `ings_json` text → jsonb, rename column to `items`,
      keep object keys `{name, qty, kcal, pro, carb, fat}` identical
- [x] **Migrate `qty` verbatim as a string. Do not parse, do not "fix".** The script
      aborts if a `qty` is ever not a string; 0 non-string values in Neon afterwards
- [x] Migrate 4 `custom_meals` — align to the same jsonb key shape. Reading the export
      caught a missing `note` column, added in migration 0002 before the run
- [x] Migrate 11 `custom_foods` → `foods` with `source='manual'`, barcodes preserved —
      11 unique barcodes, 0 rows failing the exactly-one-of per100/per_unit rule
- [~] ~~Migrate 1 `water_logs` row~~ — **cut 2026-08-12, Sriman's call.** Water tracking
      is out of v1, so the single row is not migrated and was never exported
- [x] Stamp every row with the Clerk user_id, read from `.env` — four tables, water cut
- [x] Seed one `targets` row at `valid_from` = **2026-05-05**, the earliest logged day
- [x] Add a `--dry-run` mode that reports counts and writes nothing — `npm run
      migrate:supabase:dry`. Inserts also retry transport failures: a batch died on a
      `fetch failed` mid-run, which is a dropped connection, not a data problem

### Verification — the merge gate
- [x] Engine suite green: trend, macros, remaining, target resolution, SAST boundary
      (incl. the 00:40 case), back-date bounds, cost calc — **64 tests, all passing.**
      This does *not* include the oracle below, which has no data to run against yet
- [x] **Trend series reproduces from the 38 rows now in Neon** — with an important
      correction to what this item could ever have meant. **There is no stored ground
      truth**: the exported `weight_logs` carries only `id, date, weight, created_at`, so
      the old app's computed trend was never persisted and "byte-for-byte" had no second
      side. What settled it instead: both readings were computed from the migrated rows
      (98.25 kg per logged row vs **98.84 kg per calendar day**, 0.59 kg apart) and
      Sriman confirmed the old app showed 98.84. The engine was rewritten accordingly and
      now reproduces 98.84 exactly from Neon.
      `trend-oracle.test.ts` locks all 92 days in as a regression guard.
      ⚠️ **It guards against future drift; it does not prove the algorithm was already
      right on 2026-08-12.** Only the old implementation's source could do that —
      see Open questions.
- [x] Any committed fixture carries the −9.0kg offset — `__fixtures__/trend-oracle.ts`.
      The generator asserts the shift is exact at all 92 steps, so the offset series
      guards the same shape as the real one
- [x] Row counts match source: **38 / 38 / 4 / 11** (weight, meals, saved meals, foods),
      confirmed by querying Neon 2026-08-12, plus the 1 seeded `targets` row.
      Was 38/38/4/11/1 — the water row is cut, see above

---

## Phase 2 — `api-and-auth`

**Goal:** a Hono API on Vercel where reading another user's data is structurally impossible.

- [ ] Scaffold Hono app, deploy to Vercel, confirm it responds — *scaffold exists and
      responds locally (`server/index.ts`: `/`, `/health`, the Clerk webhook, the Inngest
      handler). **Not deployed** — it runs on localhost behind ngrok, which is dev-only
      by design. The Vercel half is untouched*
- [ ] Clerk middleware: verify session token → produce a `UserScope`
- [ ] Scoped query layer — data functions **cannot be called** without a `UserScope`
- [ ] Confirm no route reads `user_id` from a body, param, or header
- [ ] `GET /day/:date` — day summary (engine-computed)
- [ ] `POST /meal-logs` — accepts client UUIDv7, `ON CONFLICT (id) DO NOTHING`
- [ ] `DELETE /meal-logs/:id`
- [ ] `POST /weight-logs` + `GET /weight-logs`
- [~] ~~`POST /water-logs`~~ — cut with the water feature, 2026-08-12
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

- [x] Install Expo Go on the iPhone 15, confirm `expo start` connects over LAN —
      sign-in exercised on the device 2026-08-10/11
- [x] Barlow + Barlow Condensed via `expo-font` — all five faces loaded in
      `src/app/_layout.tsx`, splash held until they land
- [x] Theme module with the fixed token table — dark-first, **no light theme, no toggle**.
      Lives in `tailwind.config.js` as NativeWind colour tokens rather than a separate
      module. Two deliberate deviations from the table above: `ok`/`danger` are the token
      names for Green/Red, and a `link` blue `#1A7CFC` was added for inline text links
- [x] Four bottom tabs: Dashboard, Nutrition, Weight, **AI Assistant** — built and
      verified on the iPhone 2026-08-12. **Not Library**, which is what this line said
      and what the design mock shows: Sriman chose the AI Assistant as the fourth tab.
      Library moved inside Nutrition rather than being dropped — see Phase 6.
      Native Tabs via `expo-router/unstable-native-tabs`, SDK 54 API (`Icon` / `Label`
      imported alongside `NativeTabs`, not the compound form of SDK 55+).
      SF Symbols on iOS; **Android renders labels with no icons** because SDK 54's `Icon`
      wants an Android drawable resource and this project has none — a config-plugin job,
      not a blocker while iPhone is the target
- [x] Clerk provider + secure token cache
- [x] **Google sign-in working in Expo Go** — verified on device 2026-08-10
- [x] **Apple sign-in working in Expo Go** — verified the same day, via Clerk browser
      SSO. Did not need the $99 account; see the answered open question below
- [x] Signed-out screen and sign-in flow
- [x] Build the sign-in screen with room for a second provider button — both
      providers shipped together, so no second pass is needed
- [ ] Sign-out, and a signed-out state that doesn't leak cached health data — *sign-out
      itself works (button on the placeholder home screen), but the second half is
      unproven: there is no health data and no React Query cache to leak yet. Re-check
      when the API client lands*
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
- [~] ~~Water tracking — one integer per day, tap to increment~~ — **cut from v1
      2026-08-12.** See the deferred backlog for the re-add trigger
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
- [ ] Weekly rate of loss (engine-computed) — *engine half done: `projectTrend().ratePerWeek`.
      The Weight tab that shows it is still Phase 5*
- [ ] Empty state before the first weigh-in; gap handling matches engine semantics
- [ ] Edit / delete a weight entry
- [ ] Verify the chart against the migrated 38-row series — numbers must match the engine

---

## Phase 6 — `library-and-builder`

**Not a tab.** Decided 2026-08-12: the library is a screen pushed from the Nutrition day
view, not a fifth destination in the tab bar. The reason is what the library is *for* —
you open it to log a saved meal, which is a nutrition action, so it belongs one tap from
the day view rather than across the tab bar. This also keeps the bar at four with the
AI Assistant in the fourth slot.

- [ ] Entry point on the Nutrition day view — the control that opens the library. Owned
      by this phase, not Phase 4: the day view ships before the library exists, so the
      link has to arrive with the thing it links to
- [ ] Library screen: saved meals list, search, categories
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
- [ ] **Photo is ephemeral** — sent, extracted, discarded. Never uploaded to ImageKit,
      never retained. ImageKit is stack, but it is not in this path — see standing rules.
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
- [ ] Reachable — **already is: the AI Assistant is a tab as of Phase 3**, which the
      original plan did not assume (it had chat reached from the Dashboard). What is left
      here is filling that tab, not finding a way into it
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
- [x] Clerk `user.deleted` webhook → Inngest cascade job — `sync-clerk-user-deleted`
      shipped 2026-08-11 with the create/update sync
- [ ] Cascade deletes: `weight_logs`, `meal_logs`, `water_logs`, `targets`, `profiles`,
      `chat_conversations`, `chat_messages`, `ai_usage`, `foods WHERE user_id = <user>`
      — **still open, but not for the reason this line used to give.** It said "none of
      these tables exist yet"; that was written before the migration and is wrong as of
      2026-08-12 — **all 11 tables are live in Neon**, and every user-scoped one carries a
      cascading FK to `users.clerk_id`. The remaining work is in the Inngest job, which
      still deletes only the `users` row: the per-table deletes above have to be added to
      it, and `foods` needs its `WHERE user_id = <user>` so global rows survive.
      Postgres' `ON DELETE CASCADE` would in fact clear the child rows on its own, so the
      explicit deletes are there to make the POPIA guarantee legible and testable in one
      place rather than inferred from the schema — see the job's comment, which is the
      single authority on user-data tables
- [ ] Global foods (`user_id IS NULL`) survive — verify explicitly
- [x] Cascade job is **idempotent** — a retried partial delete completes, doesn't error.
      Verified against Neon: first delete removes 1 row, replay removes 0 and does not throw
- [x] Comment the job as the single authority on user-data tables
- [ ] Type-to-confirm gate before deletion, with "this cannot be undone"
- [ ] Test the full round trip on a throwaway Clerk user: create → log → export → delete
      → confirm zero rows remain and global foods are intact
- [ ] Re-audit Sentry for leaked health data in real captured events

---

## Phase 12 — `apple-signin-and-dev-client`

**Goal:** the second half of the stated v1 auth requirement — Google **and** Apple.

Listed last because it's the first thing that costs money, not because it's least
important. **Pull it forward the moment you pay the $99** — it has no dependency on
Phases 4–11 and could run straight after Phase 3.

- [ ] Pay the Apple Developer Program fee ($99/yr)
- [ ] Check the current EAS free-tier build allowance at expo.dev/pricing
      *(Expo's docs don't state it; the "15/month" figure is third-party and unverified)*
- [ ] Configure the Sign in with Apple capability + Clerk's Apple provider
      *(Clerk's Apple provider is already enabled and working via browser SSO as of
      2026-08-10 — what's left here is the native capability, not the provider)*
- [ ] `expo-apple-authentication` — **does not work in Expo Go**, needs the entitlement.
      This is the only reason Apple still appears in Phase 12: it upgrades the working
      browser flow to a native sheet. Apple sign-in itself already ships in Phase 3.
- [ ] Build a custom dev client via EAS Build, install on the iPhone 15
- [ ] Confirm Metro iteration still works against the dev client (no rebuild unless
      native deps change — budget one build per new native dependency)
- [ ] Apple sign-in working end to end on device
- [ ] Both providers resolve to the same Clerk user where the email matches —
      verify you don't end up with two accounts and a split history
- [ ] Re-test every camera surface on the dev client (different runtime from Expo Go)
- [ ] Apple's account-deletion requirement: confirm the Phase 11 delete flow is
      reachable in-app, since App Store review demands it for accounts created in-app

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
| Progress photos (the *feature*) | A separate feature, still cut. **ImageKit itself is no longer deferred** — it is the decided image-optimisation and delivery layer for any stored, displayed image. What's deferred is the progress-photo feature, not the tool. **Never** used by label OCR. |
| Water tracking (`water_logs`, `POST /water-logs`, the dashboard counter) | Sriman actually wants to track water. **Cut 2026-08-12.** The empty table is still in Neon and still in the deletion cascade, so re-adding it is UI plus one route — no migration needed. Say the word to drop the table instead. |
| Device-timezone support | Going international — v2 migration, clear trigger |
| ~~Apple Developer Program + EAS dev client~~ | *Promoted to **Phase 12** — it's a real v1 requirement, not a cut. Deferred on cost, not scope.* |

---

## Open questions

- [x] **Trend semantics across the 37-day gap — CALENDAR DAYS.** Resolved 2026-08-12
      against the real data; the spec's per-row hypothesis was wrong. See Phase 1.
- [x] Trend seed — **yes, `tw[0] = w[0]`.** Confirmed 2026-08-12.
- [x] **Confirm targets 2300/167/195/60 — confirmed 2026-08-12.** Was the mid-range of
      the stated bands; now the real figure. Unblocks the Phase 1 migration's `targets` seed
- [x] **Does Clerk's Google OAuth actually work in Expo Go? Yes — verified on the
      iPhone 15, 2026-08-10.** `useSSO()` browser flow, SDK 54, Expo Go. **Apple works
      too, on the same free dev instance with no Apple Developer account** — Clerk's
      *browser* SSO needs no entitlement. Only the fully native Apple sheet
      (`expo-apple-authentication` / `useSignInWithApple`) needs the $99 account, so
      Phase 12 is now a UX upgrade, not the gate on having Apple sign-in at all.
- [x] **Do Native Tabs work in Expo Go on SDK 54? Yes — verified on the iPhone 15,
      2026-08-10.** Tab bar renders with the iOS 26 liquid-glass treatment, SF Symbol
      icons draw, and switching is native. Nothing extra to install: every native view
      lives in `react-native-screens` 4.16.0, which is already inside the Expo Go
      binary, and `expo-router` 6.0.24 carries an explicit 4.16-vs-4.18 icon branch
      (`NativeTabsView.js:220`) — it was written for exactly this pairing.
      **The tab shell does not force the $99 forward.** Two caveats for later:
      - `sf=` icons are iOS-only. Android needs `drawable=` or `VectorIcon`, or the
        tabs render as labels with no icons.
      - Android renders Material 3 / Jetpack Compose navigation, not liquid glass —
        the two platforms will not look alike, by design.
- [ ] **Does the old app's source still exist anywhere?** It is the only thing that can
      fully close the trend risk. The per-day-vs-per-row question is settled, but the
      anchor is one recognised number, which cannot rule out a subtler difference (where
      exactly it rounds, how it handles the very first day) that happens to land on the
      same 98.84. Low effort if the code is still around, worth nothing if it is gone.
- [ ] **Which SDK does App Store Expo Go support?** A moving external dependency that gates
      the entire free runway. Re-check before any SDK bump; verify on the device.
- [ ] Client-side engine for optimistic offline totals? *(v1.1)*
- [ ] EAS free-tier build count — Expo's docs don't state it; check expo.dev/pricing
      when you reach the paid step

## Known risks

- **Trend reproduction — largely closed 2026-08-12, with one thread left.** The migration
  preserved the 38 rows exactly and the engine now reproduces the confirmed 98.84 kg. But
  the old app never stored its trend, so the anchor is a single recognised figure rather
  than a recorded series: it pins the per-day-vs-per-row question decisively, and would
  not catch a subtler error (a different rounding point, say) that happens to land on the
  same final number. Recovering the old implementation's source would close it fully.
- **OFF resolved 2 of 6 pantry items.** Manual entry speed is a product requirement.
- **Sonnet 5 intro pricing ($2/$10) ends 2026-08-31.** Budget against $3/$15.
- **Sonnet 5's tokenizer runs ~30% heavier** than the previous generation — measure, never
  estimate, and never with `tiktoken` (OpenAI's tokenizer, undercounts Claude badly).
- **The deletion cascade rots silently** unless every new user-scoped table is added to it.
- **Solo dev, university workload.** The irreversible work is deliberately front-loaded so
  whatever ships stands on a correct foundation.
