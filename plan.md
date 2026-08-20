# NutriSA — Build Plan

Living checklist. Tick items as they land; don't delete them — a completed history is
useful. Full reasoning behind every decision lives in the spec:
`~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md`

**Workflow:** one feature per branch, one fresh session per branch, all git run manually.

**Status (2026-08-14):** Phase 0 done bar the Anthropic spend cap · **Phase 1 engine and
migration complete** — all 11 tables live in Neon, the 38-row history migrated and verified,
**282 tests green across 15 files** (was 175 at the start of the day) · **Branches
`api-scope-and-reads` and `dashboard-live-data` are both built** — Clerk middleware, the
scoped query layer, `packages/shared/`, both read routes, Sentry, the profile seed, then
React Query, the typed client, the three shared state components, `streak.ts`, `chart.ts`,
and the dashboard wired card by card until **`design-fixture.ts` was deleted**. The API
reproduces the confirmed 98.84 kg trend end to end and the screen draws it. **Two items
remain open, both needing something a keyboard cannot do**: the security suite needs a Neon
branch to run against, and the 44×44 / thumb-reach pass needs the phone · **the trend algorithm was
corrected from per-row to per-calendar-day after checking it against the real data; the
spec's stated hypothesis was wrong** ·
**Phase 3 auth shipped early and verified on device — the rest of Phase 3 has not.** Sign-in
(Google and Apple), the token cache, the four native tabs and the fonts are all on the
iPhone and working; **four items remain open**: the React Query provider and typed client,
the shared `<Empty>` / `<Loading>` / `<ErrorState>` components, the sign-out cache-leak
re-check (it cannot be done until there is health data to leak), and the 44×44 / thumb-reach
pass on device. Read "Phase 3" as "auth", not as the phase · **A full dashboard UI is built
and on the phone, but every number on it is a hardcoded design value** — see "The
fixture-backed dashboard" below, and Phase 4, before reading its checkboxes ·
Clerk → Neon sync live via Inngest
in dev mode · the POPIA cascade is now structural — every user-scoped table cascades from
`users` · Water tracking cut from v1 · the fourth tab is **AI Assistant**, not Library —
the library became a screen inside Nutrition (2026-08-12) · **Phase 2's write half landed
2026-08-16 (`api-writes`); the Vercel deploy is still untouched, and so is the phone.** All
four write routes exist and are proven against real Postgres — **388 tests green across 21
files** offline, plus **41 across 2 files** in the security suite — but **nothing on the
write path has been exercised from the device**, because the client mints its first UUIDv7
in Phase 4. Read "Phase 2 is done" as "the server is done" ·
**Phase 4 built and landed 2026-08-20 (`meal-logging`)** — the entry form, the Nutrition
day view and `PATCH /meal-logs/:id`, reviewed on three axes and four findings fixed. Two
items stay open and both need the phone: the ten-second stopwatch and the 44×44 pass ·
**Phase 5 built 2026-08-20 (`weight-and-trend`)** — the Weight tab, `log-weight.tsx`,
`DELETE /weight-logs/:id`, `entries` on the series and `rateDirection` in the engine.
**468 tests green across 24 files** offline. The chart itself was already built on
`dashboard-live-data` and moved into `src/components/weight/TrendChart.tsx` so both
surfaces draw the same one. **Still unverified on the device, and no write route in this
app has yet been confirmed end to end with a real Clerk token** · Phases 6–12 not started ·
v1.1 deferred

### The next three branches — decided 2026-08-14

Sriman's call: **the dashboard gets wired to real data as soon as Phase 2's read routes
land**, rather than waiting for all of Phase 2 to finish. Proving the whole stack on a
screen you can actually look at is worth more than keeping one branch to one concern, and
it deletes the fixture sooner.

1. **`api-scope-and-reads`** — server only, no UI. Clerk middleware → `UserScope`, the
   scoped query layer, `packages/shared/`, `GET /day/:date`, `GET /weight-logs`, both
   security tests, Sentry. **Not** the writes, not `targets`, not the Vercel deploy:
   ngrok already reaches the phone, so deployment is not on the path to real numbers.
2. **`dashboard-live-data`** — **built 2026-08-14.** The React Query provider and typed
   client, the three shared state components, the sign-out cache clear, and
   `packages/engine/streak.ts` all landed, and `design-fixture.ts` is deleted. See the
   section below. **The 44×44 / thumb-reach pass is the one item still open** — it is a
   device check and cannot be done from here.
3. **`api-writes`** — the rest of Phase 2, before Phase 4 proper.

---

## The dashboard — fixture-backed 2026-08-12, live 2026-08-14

**`design-fixture.ts` is deleted.** Every number on the dashboard now comes from
`GET /api/day/:date` and `GET /api/weight-logs` through React Query, computed by
`packages/engine/`. The section below is kept because the three debts it tracked are how
the branch was scoped, and because the failure it records — a fixture-backed screen reading
as a finished screen — is worth not repeating.

*The state it described:* about 14 components under `src/components/dashboard/`, every
figure traced from a design mock, no engine call, no query, no four states.

Branch `dashboard-live-data` shrank the fixture card by card until it was gone. Its three
debts, all now settled:

- [x] **`packages/engine/streak.ts` did not exist** — the streak was the literal `12` in
      the fixture. **Written 2026-08-14, 17 tests.** It carries the rule the fixture's own
      note argued for: a run stays alive until midnight on a day not yet logged, so `lit`
      is a separate field from `days` and **12-and-unlit is a real state**, not `days > 0`.
      `longestStreak()` came along with it — one pass over data already in hand, and the
      overlay is the natural home for "your best is 21"
- [x] **The Expenditure tile has no data source — resolved 2026-08-14.** Swapped for
      **7-day average intake**, Sriman's call. `averageDailyIntake()` in the engine backs
      it and `GET /day/:date` returns it. Adaptive TDEE stays deferred. The tile needs
      retitling in branch 2, and should show `loggedDays` — the average is over days
      logged, not days elapsed
- [x] **The goal line has no goal — resolved 2026-08-14.** Seeded at **85.0 kg** via
      `npm run seed:profile`, run against Neon. A real profile/settings surface is still
      owed and still deferred to its own branch

### What wiring it actually changed — 2026-08-14

Three things the fixture had quietly settled turned out to be wrong once real numbers
arrived, and all three were found by looking at the response rather than by reasoning:

- **The chart axis was a design constant.** `yTicks: [92, 91, 90, 89, 88]` was typed by
  hand from a mock and looked like layout. It is not: an axis label is a number the user
  reads off the screen, so it now comes from `niceScale()` in the engine. Same for which
  dates get x-labels — `evenlySpaced()`, which guarantees **both ends** are labelled,
  because picking every nth entry silently drops the last one whenever the length is not a
  clean multiple, and the right-hand end is the one people read first.
- **The goal line must not scale the chart.** The first version fed the goal into the axis,
  reasoning that a goal drawn off-frame looks like a rendering fault. Against the real data
  that is 85.0 kg against a trend at 98.8 — a 15 kg axis on which the 1.3 kg of movement
  the chart exists to show collapses into a sliver. The goal now gets the dashed line
  **only when it lands inside the data's own range**, and otherwise becomes an
  `↓ Goal 85.0 kg` marker pinned to the edge it lies beyond. The fixture never caught this
  because its goal was 88.0 against data at 89–91.
- **Unlogged days are not zeros, all the way to the pixel.** `averageDailyIntake` returns
  `null` for a day with no log, and the sparkline now breaks its line across those instead
  of drawing them on the floor. On the real data this matters immediately: the current
  7-day window has **one** logged day in it, and a zero-filled sparkline would have drawn
  six fast days that never happened.

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
| White | `#FFFFFF` | Primary text, and the one full-brightness surface |

`White` was added to the table on `meal-logging`, 2026-08-20, after a review pointed out
that it had been registered in `src/design/tokens.ts` and `tailwind.config.js` without
appearing here — and this table is what "the tokens are fixed" refers to. Tailwind has
always had `white`, so `text-white` worked without a token; what needed one was
`react-native-svg`, which takes a value and cannot read a class. The rule the omission
broke is "no new colour that is not in the token table, **even via a token**".

The one full-brightness surface is the "Log Foods" button on the Nutrition tab. It is the
single action on that screen, and `Primary` blue is already spoken for by the dashboard's
actions, so white reads as a step up rather than as a second blue thing.

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
      `logMonth()` for the Phase 9 SAST-month budget gate. `checkLogDate` gained an
      `earliest` bound and a `too-far-back` reason on `api-writes` (2026-08-16), kept
      separate from `firstLogDay` because they answer different questions: "is there data
      here" versus "can any surface show this day at all"
- [x] `ordering.ts` — `nextSortOrder()`, added on `api-writes`. Where a newly logged meal
      sits in its day; the day view orders by it, so it is a number the user sees
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
      (incl. the 00:40 case), back-date bounds, cost calc — was **64 tests** when this
      phase closed; **175 across 10 files as of 2026-08-14**, all passing. The growth is
      not new engine work: it is the three `tests/` guards (`engine-purity`,
      `no-hex-literals`, `tokens`) that came with the single-colour-token commit.
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

**The read half landed 2026-08-14.** Session middleware, `UserScope`, the scoped query
layer, `packages/shared/` and both data routes now exist and were exercised against the
real history. What is left in this phase is `api-writes` and the Vercel deploy.

*(The paragraph this replaces described a server with four routes, no middleware and no
`packages/shared/`. That was accurate on the morning of 2026-08-14 and is the state the
branch started from.)*

**Split into two branches, 2026-08-14** — see "The next three branches" at the top. The
reads go first and alone, so the dashboard can come alive against them; the writes follow.

### Branch `api-scope-and-reads` — everything the dashboard needs to read

**Built 2026-08-14. One item is written but unrun — see the security tests below.**

- [x] Clerk middleware: verify session token → produce a `UserScope` —
      `server/auth/user-scope.ts`. `verifyToken` from `@clerk/backend`, which is what this
      project's own `.agents/skills/clerk-expo` prescribes for a plain backend. **The
      scope carries a module-private symbol**, so `{ userId: body.userId } as UserScope`
      does not compile anywhere else in the tree — the rule is a type error, not a habit
- [x] Scoped query layer — data functions **cannot be called** without a `UserScope`.
      `server/data/scoped.ts` is the only module that imports `db`, and `selectOwned`
      returns **rows, not a builder**: a builder would let a caller chain `.where()`, which
      in Drizzle *replaces* the condition rather than adding to it, so one innocuous line
      would drop the ownership filter and widen the query to every user in the table
- [x] Confirm no route reads `user_id` from a body, param, or header — and it is a test
      now, not a confirmation. `tests/scoped-access.test.ts` fails if any file outside
      `data/scoped.ts` imports `db`, if a route reads a user id from client input, or if a
      function in `data/` does not take `scope: UserScope` first. Verified it actually
      fires by planting a violating file and watching both guards go red
- [x] Shared zod schemas in `packages/shared/`, imported by both sides — created here, for
      real contracts. Carries the `{name,qty,kcal,pro,carb,fat}` → `{kcal,protein,carbs,fat}`
      mapping that `macros.ts` warns about: without it, three of four keys arrive
      `undefined` and `dayTotals` returns NaN silently
- [x] `GET /day/:date` — day summary (engine-computed). Accepts `today` as well as a
      date, so the client never has to ask a phone's clock what day it is
- [x] `GET /weight-logs` — the series behind the chart, the trend card and the insight
      tile. `?days=30` narrows what is **drawn**, never what is computed
- [x] Seed one `profiles` row with `goal_weight_kg` for Sriman's user — **`npm run
      seed:profile`, run 2026-08-14, `goal_weight_kg = 85.0` (Sriman's call).** Idempotent,
      and an update rather than a skip, since re-running it is the only way to move the
      goal until a settings screen exists
- [x] Sentry wired with `sendDefaultPii: false`, no request bodies, no weight/macro
      values in breadcrumbs — `server/observability/sentry.ts`. Drops the whole request
      body, **every** header rather than an allowlist (a live Clerk token in a Sentry issue
      is a working credential), query strings, and console breadcrumbs. Off entirely
      without a DSN
- [x] Security tests below — **run and green 2026-08-15, 12/12** against a Neon branch.
      See the section below, including the fixture-retry gap the first run exposed

**Also landed here, not originally listed:**

- [x] `packages/engine/src/intake.ts` — `averageDailyIntake()`, backing the Expenditure
      tile's replacement. Owed by the zero-arithmetic rule: the alternative was a `reduce`
      in a route handler. Averages over **days logged, not days elapsed** — dividing by a
      fixed 7 would drop the figure 30% for skipping two days, which reads as progress and
      is a lie. 14 tests
- [x] `server/db/retry.ts` — retries transient `fetch failed` from the Neon driver, moved
      out of the migration script because the read routes need it too. **Not defensive
      padding**: a read-only smoke run 500'd on a different one of five requests on each of
      two consecutive attempts before this was wired in, and passed 5/5 after. Neon's free
      tier suspends when idle, which the server README already documented as a ~90s wake.
      Only transport errors are retried, never Postgres errors. ⚠️ **The Phase 2 write
      routes must not simply reuse this** — their safety comes from the client-minted
      UUIDv7 and `ON CONFLICT DO NOTHING`, not from a retry wrapper

**Verified end to end against the real 38-row history**, with a throwaway read-only test
through the actual Hono routes: `latest.trend` came back **98.84 kg** — the Phase 1
confirmed figure, reproduced through the middleware, the scope layer, Postgres and the
engine. Day 2026-06-17 returned its real meal against the 2300/167/195/60 targets with
remaining and ring progress computed; an unlogged day returned a true zero with targets
present; `2026-02-30` returned 400.

### Branch `api-writes` — the rest

**Built 2026-08-16.** Server only, deliberately — the client mints its first
UUIDv7 in Phase 4, where the logging surfaces are. All four routes are proven
against real Postgres by `tests/security/write-isolation.test.ts` (29 tests).

- [x] `POST /meal-logs` — accepts client UUIDv7, `ON CONFLICT (id) DO NOTHING`.
      A replay answers **200 `created: false`** with the *stored* row, not the
      second body: if the two disagree, the first write is what happened. An id
      that conflicts with a row this user cannot see is **409**, which says
      nothing about whose it is
- [x] `DELETE /meal-logs/:id` — always 200, with `deleted` saying whether
      anything went. A 404 would be an existence oracle over other users' rows,
      and would make the v1.1 offline queue read a replayed delete as a failure.
      Accepts a UUID of **any** version: the 38 migrated rows carry the old
      app's ids and are as deletable as the rest
- [x] `POST /weight-logs` — upserts on `(user_id, date)`. A second weigh-in on a
      day **replaces** it rather than failing: that is how people correct a bad
      reading, and the unique index means there is no shape where both survive.
      The conflict target includes `user_id`, so the row found is the caller's
      own by construction — and `setWhere` re-applies the ownership filter
      anyway, which is what a future caller with a wrong target hits instead of
      a cross-user overwrite
- [~] ~~`POST /water-logs`~~ — cut with the water feature, 2026-08-12
- [x] `GET /targets`, `POST /targets` — the GET sits on the **read** router,
      where the unmetered reads are; only the POST is rate-limited. `current` is
      resolved by the engine against today rather than being the newest row, so
      a future-dated row is not applied early
- [x] Back-date support: `date` accepted and validated, `created_at` always real
      instant. Optional on every write, and **absent means today** — decided by
      `currentLoggingDay()`, never by the phone. Bounded by the engine's
      `checkLogDate`, which gained an `earliest` bound and a `too-far-back`
      reason for this: a day older than the window the app can display would be
      stored and then invisible, which is indistinguishable from data loss. The
      bound is imported from `LOGGED_DAYS_WINDOW_DAYS` so the two cannot drift.
      `firstLogDay` is deliberately **not** applied to writes — it is a
      date-picker bound, and using it here would stop a user whose first log is
      today from back-filling yesterday
- [x] Rate-limit **and** log unauthenticated request volume — `server/http/limits.ts`.
      Writes are capped per verified Clerk id, far above any human logging rate;
      the 401 path is counted, not blocked, because it is already cheap. **No IP
      is written to a log, a response or disk** — an IP is personal information
      under POPIA, and a hash under a random per-process salt answers "how many,
      from how many" just as well. Precisely: it is pseudonymisation within one
      window, which is what counting *distinct* callers requires, and the key
      cannot be reversed by anyone holding the logs. The first version salted
      with `pid + Date.now()` and did **not** earn that claim — the process start
      time is effectively published in the boot log, and IPv4 is only 2³²
      addresses, so the whole mapping was brute-forceable. Caught by the Privacy
      axis of `/nutrisa-review`, 2026-08-16; the salt is now `randomBytes(32)`
      ⚠️ In-memory, therefore per-instance: honest on today's single dev server,
      and it needs shared state (Upstash, or Neon itself) the day this runs on
      Vercel. Whatever replaces it should keep the interface

**Also landed here, not originally listed:**

- [x] `packages/engine/src/ordering.ts` — `nextSortOrder()`, 7 tests. The day
      view orders by `sort_order`, never `created_at`, so a meal's position is a
      computed number the user sees and the zero-arithmetic rule puts it in the
      engine. The **server** computes it, not the client: a stale query cache
      would mint the same position for two different meals and leave the day
      view breaking the tie arbitrarily
- [x] `insertOwned` / `upsertOwned` / `deleteOwned` in the scoped layer, with
      `user_id` stamped from the scope and the type forbidding a caller from
      passing one. ⚠️ **None of them is wrapped in `withRetry`**, and
      `tests/write-safety.test.ts` fails if that ever changes — a retried write
      whose first attempt succeeded before the response was lost logs the meal
      twice, and `ON CONFLICT (id)` does not catch it, because the ids match
      across attempts only when the *client* is the one retrying
- [x] `conflict` and `rate-limited` added to the shared `ApiError` codes, and
      mapped on the client so a 409 says "mint a new id and save again" rather
      than "something went wrong"
- [x] `requireUser` is now idempotent. Both routers mount it and both are
      mounted at `/api`, so the first router's wildcard middleware runs on the
      second's routes too. Trusting a scope already on the context is exactly as
      strong as verifying again — the brand symbol means nothing else could have
      put one there
- [x] `tests/column-widths.test.ts` — the write schemas' numeric ceilings must
      match the columns behind them. `packages/shared/` ships in the app bundle
      so it cannot import `db/schema.ts` to read a width; the numbers are
      therefore written twice on purpose, and this is what makes that safe. Same
      pattern as `tokens.test.ts`. Asserts behaviour rather than equal
      constants: the widest value a column holds is accepted, the next one up is
      refused. Verified it fires by narrowing `MAX_GRAMS` and watching 4 go red
- [ ] Scaffold Hono app, deploy to Vercel, confirm it responds — *scaffold exists and
      responds locally. **Not deployed** — it runs on localhost behind ngrok, which is
      dev-only by design. The Vercel half is untouched.* **Deliberately not on the reads
      branch:** ngrok already reaches the iPhone, so nothing about seeing real numbers on
      the dashboard waits for Vercel

### Security tests (Neon branch, real Postgres — not mocks)

These ship with `api-scope-and-reads`. The scope layer is the thing being tested, and it
arrives in that branch — testing it later would mean shipping the read routes unproven.

**Written 2026-08-14. Run and green 2026-08-15 — 12/12 against real Postgres**, on a Neon
branch named `test` (endpoint `ep-dry-truth-ayu60irj`, distinct from the main
`ep-lingering-haze-ay7kofis`). Took 93s, almost all of it the branch's compute waking.
Verified afterwards that zero `user_sectest_%` rows remained.

**`write-isolation.test.ts` joined them 2026-08-16 with `api-writes` — 41/41 across both
files, 26s on a warm branch, and zero `user_sectest_%` rows left behind.** Same claim,
other verb: a `user_id` in the request body changes nothing, an id belonging to another
user is refused without admitting whose it is, deleting somebody else's meal deletes
nothing, a weigh-in never overwrites another user's on the same day, and the day's sort
order does not count meals the caller cannot see.

They need `TEST_DATABASE_URL` pointing at that branch — they create users, write rows and
delete them again, so pointing them at the main database risks leaving debris beside 38
rows of irreplaceable history. With the variable unset the suite fails with a message
saying exactly that; it does not silently skip. `npm run test:security`.

⚠️ **The first run failed, and not on an assertion.** `beforeAll` inserted the `users` rows
and then died on `weight_logs` with a 10s connect timeout, skipping all twelve tests. The
retry from `server/db/retry.ts` was wired into the query layer and the scripts but **not
into the tests' own fixture setup** — and a Neon branch is a fresh compute that has never
been woken, so it stalls more readily than the main database, not less. Every fixture write
and both cleanup paths now go through `withRetry`. Worth remembering as a category: a flaky
security suite is one people start skipping, so its scaffolding needs the same care as the
code it tests.

Everything in them is real except one function: Clerk's `verifyToken` is stubbed, because
minting a genuine session token would make the suite depend on Clerk being up in order to
tell us whether *our* query layer leaks. The middleware, the scope, the queries, Postgres
and the engine are all the real thing — the test cannot fabricate a `UserScope`, so it
comes in through the front door, the same way an attacker would.

- [x] User A cannot **write** user B's rows — **green, 2026-08-16.** The `write` half of
      the line below, and the reason it is listed separately: a read that leaks shows the
      wrong number, a write that leaks changes somebody else's data. See
      `write-isolation.test.ts` and the summary above
- [x] User A cannot read or write user B's rows — **green.** A's meals and totals, B's
      meals and totals, A's weigh-ins, B's weigh-ins **and B's absent goal weight** (a leak
      through a table the day route never touches), a user with no data at all getting an
      empty series rather than someone else's, and A's streak and logged-day list counting
      only A's own days — that last one matters because it comes from `selectOwnedDays`,
      which builds its own `WHERE` rather than going through `selectOwned`, so it is a
      second place the filter has to be right
- [x] Unauthenticated request to a protected route is refused — **green.** No header, on
      both routes; an unverifiable token; an empty bearer; a non-bearer scheme; and a
      request that names another user in the query string *and* a header while carrying A's
      token, which still returns A's data

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
**The four items below all land in the `dashboard-live-data` branch** (2026-08-14). They are
not being deferred — wiring the dashboard forces every one of them, so they are cheaper
there than in a Phase 3 mop-up branch that would have to invent a surface to prove them on.

- [x] Sign-out, and a signed-out state that doesn't leak cached health data — **done
      2026-08-14, and there are two locks on it.** `clearQueryCache()` runs *before*
      `signOut()`, because signing out flips Clerk's auth state and remounts the tree —
      clearing afterwards races that, and anything mounting in between would be handed the
      previous user's day summary. Separately, **every query key is namespaced by Clerk
      user id**, so a second account could not read the first one's entries even if the
      clear were removed. Both exist because they fail differently. ⚠️ **Still owed: the
      two-account walkthrough on the device** — this is proven by construction, not by
      observation
- [x] React Query provider + typed API client using the shared schemas —
      `@tanstack/react-query` 5.101.4, provider inside `ClerkProvider` (the queries read the
      user id and call `getToken()`, so auth has to be above them). **Responses are parsed
      through the shared zod schema, never cast** — `as DaySummary` is a lie the compiler
      agrees with, and the first dropped field would render `undefined` deep inside a card
      with no error anywhere
- [x] Shared state components: `<Empty>`, `<Loading>`, `<ErrorState>` —
      `src/components/state/`. Written against the dashboard as their first real consumer,
      exactly as this item asked. `<ErrorState>` maps the error **code** to copy the app
      owns and never forwards a server message: a session that lapsed is told to sign in
      rather than offered a "try again" that goes in a circle
- [ ] Verify 44×44px targets and thumb reach on the real device, one-handed — **still
      open, and it is now the only Phase 3 item left.** It is a device check; nothing about
      it can be done from a keyboard. The controls to judge are the quick-action bar, the
      chart's range switcher (which is a *working* control now, cycling 30 / 90 / 365
      days), the streak pill, and the "Try again" button inside `<ErrorState>`

---

## Phase 4 — `manual-logging`

**Goal:** the ~⅓ of logging that OFF can't serve. Must be fast and pleasant, not punished.

The first two items landed with `dashboard-live-data` on 2026-08-14. The rest of Phase 4 is
genuinely not started.

- [x] Dashboard: today's totals vs targets, remaining macros, macro colour coding —
      **live as of 2026-08-14.** Every figure comes from the engine through React Query.
      Over-target is a designed state rather than a minus sign: the hero reads "Calories
      over" with the excess beside it, and a macro ring that passes its target turns
      `danger` — losing the macro's own colour is the signal, because a full purple ring
      and an over-target purple ring look identical
- [~] Dashboard answers the three questions in under 10s: what am I looking at,
      how am I tracking, what do I log next — **now judgeable and not yet judged.** The
      surfaces exist and are showing a real day; the test is whether *your* numbers read
      fast, which is a stopwatch on the device. Pairs with the 44×44 pass above
- [x] Nutrition tab: day view, meals in `sort_order`, `logged_time` shown —
      `src/app/(tabs)/nutrition.tsx`. Ordered as the server returns them and
      **not re-sorted client-side**: `sort_order` is the order, `logged_time` is
      a label, and a second opinion here is how the two ends start disagreeing.
      Each meal row is the control that opens it for editing; the items are
      printed under the header rather than hidden behind a disclosure, because a
      day view that shows only totals is one you cannot check
- [x] Manual entry form — the speed-critical surface. `src/app/log-meal.tsx`,
      one screen for both create and edit. `?id=` opens an existing meal and
      patches it; without one it posts a new one. They were nearly two screens,
      and every field and every state would have existed twice with the edit
      copy the one nobody re-checks. The total and the Save button are pinned:
      a save you have to scroll a five-item meal to reach is the biggest thing
      standing between this form and the ten-second target below
- [x] Unit type selector: g, slices, pieces, tbsp, tsp, cup, ml —
      `PORTION_UNITS` in the engine, rendered through the existing `Dropdown`
- [x] Macros always `quantity × per-unit`, **unit label always visible** —
      `packages/engine/src/portions.ts`. **Two bases, not one:** `g` and `ml`
      are quoted per 100 (which is how every SA label is printed), everything
      countable per 1. Asking someone to divide 340 by 100 in their head before
      typing is how a logging app gets abandoned. The heading over the four
      macro fields is written *from* the unit — "Macros per 100 g" / "per
      slice" — so changing the unit cannot silently change what they mean
- [x] Gram inputs debounced at **300ms** — `src/lib/use-debounced-value.ts`.
      The **field** is not debounced and must not be; what waits is everything
      *computed* from it. Typing "150" passes through 1 and 15, and undebounced
      the running total flashes 3, then 52, then 525 — three wrong numbers under
      the thumb for every right one
- [ ] Save a new food to `foods` with `source='manual'` from the entry flow —
      **deliberately not on this branch.** It needs `POST /foods`, which needs
      the nullable-`user_id` scoping `server/data/scoped.ts` says it will not
      cover, and it is only worth anything next to food *search* — both of which
      are Phase 6 `library-and-builder`. Building the write here would leave a
      table you can add to and cannot read from
- [x] Edit and delete a logged meal — **decided 2026-08-16: an edit is
      `PATCH /meal-logs/:id`, not delete-and-re-post.** Delete-and-re-post needs no new
      route, and that is its only merit: the meal loses its original `created_at`, jumps to
      the end of its day, and a failure between the two calls leaves it simply deleted.
      A patch keeps the id, the `created_at`, the `sort_order` and the day, so an edited
      meal stays one meal in the history. Costs a partial-update contract — every field
      optional, at least one required — which is a **new** schema and not `writeMealSchema`
      with `.partial()`, because the id and the date must not be patchable by accident.
      ✅ **Sub-question answered on `meal-logging`, 2026-08-20: yes, an edit may
      change `date`** — the recommendation, taken. "I logged this on the wrong
      day" is a real correction and delete-and-re-post is exactly the workaround
      this route removes. A meal that moves gets a **fresh `sort_order` for the
      day it lands on**, via the same `nextSortOrder` a create calls, because its
      old position belongs to a different day's ordering and would collide with
      whatever already sits there. A patch that does *not* change the day leaves
      the position alone — re-appending on every edit would send a corrected
      breakfast to the bottom of the day. The move is bounded by the same 91-day
      window a create is. The delete route stayed as it is
- [x] `DELETE /meal-logs/:id` exists already — shipped with `api-writes`, 2026-08-16
- [x] `PATCH /meal-logs/:id` — **shipped here rather than on `api-writes`, on purpose.**
      It was not on that branch's checklist and the decision landed after the branch was
      already reviewed and committed. Shipping it beside the surface that calls it means it
      is exercised on the device instead of becoming a fifth route no client has ever hit.
      Its body is `patchMealSchema` — **a new schema, not `writeMealSchema.partial()`**,
      because `.partial()` makes `id` optional too, and a patch that can carry an id gives
      the request two answers to "which meal is this". At least one field is required; an
      empty patch is a 400 rather than a 200 that hides a caller bug. Missing meal is a
      404, and the answer is byte-identical for "no such id anywhere" and "somebody else's
      id", so unlike the delete it is not an existence oracle — the delete's always-200
      exists for replay safety, which a patch has no need of
- [x] Back-date a meal to a past day — through `DayStepper`, which is the same
      control on the day view and on the entry form. **No date picker:** you step
      the day back and log there, so the day being written to is on screen the
      whole time rather than something you have to remember you changed. Its
      bounds are the server's — forward stops at today, back at 91 days — because
      letting someone travel to a day the server will refuse means the refusal
      arrives *after* they have typed a meal into it
- [~] ~~Water tracking — one integer per day, tap to increment~~ — **cut from v1
      2026-08-12.** See the deferred backlog for the re-add trigger
- [x] Client mints UUIDv7 for every new row — `src/lib/uuid.ts`, on
      `expo-crypto`'s `getRandomBytes`. **`Crypto.randomUUID()` is a v4** and
      every write route would 400 on it. The id is held in a ref across save
      attempts and re-minted only on a 409, which is the whole idempotency
      contract in one place: a retry after a lost response carries the same id
      and is answered "already logged" instead of logging the meal twice.
      `tests/uuidv7.test.ts` parses it with the server's own `clientIdSchema`
      and asserts the 48-bit timestamp survives — `millis >>> 32` is 0 in
      JavaScript, and the obvious implementation gives every id minted in the
      same 49 days an identical prefix. Original note follows:
- [~] ~~the server half is done and waiting~~ — **done 2026-08-20.**
      `POST /meal-logs` refuses a v4 (`clientIdSchema` checks the version nibble), so this
      is not optional wiring. `node:crypto` does not exist in React Native: the minter
      needs `expo-crypto`'s `getRandomValues`. The shape is reproduced, with a comment on
      why, in `tests/security/write-isolation.test.ts` — it is 12 lines, and it belongs in
      `src/lib/` the moment a surface saves anything
- [x] All four states on every new surface — the day view owns loading, error,
      empty and happy; the entry form owns loading/error for the meal it is
      editing (a *new* meal has nothing to fetch and goes straight to the form),
      and the save has its own three on top: pending disables the button,
      failure prints a reason above it, success leaves the screen. The frame with
      the back button is hoisted out of the state branches — a spinner on a
      screen with no way back is a trap, and it only appears when the network is
      already misbehaving
- [ ] **Time yourself: manual log start → saved, under 10 seconds** — the form
      exists and is now judgeable. Still a stopwatch on the device, and still
      Sriman's to run. Pairs with the 44×44 pass in Phase 3

### Branch `meal-logging` — what else landed, 2026-08-20

Disclosed expansion, not scope creep hidden in a diff. Each of these was needed by
something on the checklist above and none was originally listed:

- **`packages/engine/src/portions.ts`** — `scalePortion`, `portionLabel`, `PORTION_UNITS`,
  `PORTION_BASIS`. The quantity × per-unit rule, in the engine where the first standing
  rule puts it. 24 tests.
- **`sumMacros` / `normaliseMacros` exported from `macros.ts`.** `dayTotals` now delegates
  to `sumMacros` rather than the two keeping their own loops — the entry form needs a
  running total for **one meal**, and calling that a "day total" in the component drawing
  it is a lie that reads fine and confuses the next person.
- **`portion` on the stored item shape** — optional `{quantity, unit, per}` inside the
  `items` jsonb, and on the read contract as `null`. **Absent on all 38 migrated rows,**
  which is the whole reason it is optional. Without it, reopening "150 g of rice at 350
  kcal per 100 g" gives back only "525 kcal" and a `qty` string nothing is allowed to
  parse, so changing 150 to 200 becomes mental arithmetic the app exists to remove. Rows
  that have no portion — the migrated ones, or a line typed as bare macros — open in a
  second editor mode that edits exactly what is stored. Inventing "1 × piece" for them
  would misrepresent the row *and* write the misrepresentation back on the next save.
- **`updateOwned` in the scoped layer.** `user_id` and `id` are removed by the type, and
  that is load-bearing rather than tidy: an `UPDATE` that could write `user_id` would hand
  one user's meal to another, and the ownership filter does **not** catch it — the `WHERE`
  selects the row before the new owner is written. `tests/write-safety.test.ts` guards it
  and was confirmed red on a planted defect.
- **`apiPost` / `apiPatch` / `apiDelete`**, all four verbs through one `request` function
  in `src/lib/api.ts`, so the ngrok header and the error mapping cannot drift between a
  read and a write.
- **`conflict` and `rate-limited` given their own error copy.** Both were falling through
  to "something went wrong", and both are actionable in ways that sentence is not.
- **`formatDayWithWeekday`** — "Tue 18 Aug". The weekday is the half that makes a
  back-dated day recognisable.

### The Nutrition tab has two reference designs

`src/design/nutrition_ui.png` draws the **add** surface — shortcut tiles, a list of foods
with `+` buttons, a search field and a white "Log Foods" button.
`src/design/nutrition_ui2.png` draws the **day** surface — the date as a heading, a calorie
ring split into macro arcs, three macro cards and the day's meals. They share the Scan /
Search / AI / Quick Add mode row, so they are two states of one screen rather than two
screens.

**The tab renders the day surface**, because that is what Phase 4 asks it for. The add
surface needs food search, which is Phase 6.

The **add** surface's pieces were built here from the first reference and then **deleted on
review**, 2026-08-20 — `NutritionHeader.tsx`, `FoodRow.tsx`, `ShortcutRow.tsx` and
`src/lib/food-emoji.ts`, 472 lines nothing imported. The review's point was the right one:
Phase 6 reserves "the control that opens the library" by name, and disclosing scope creep
does not stop it being scope creep. They are in commit `7270b52` if Phase 6 wants them —
though by then the design may have moved, which is most of the argument for not carrying
unrendered code forward.

What survives from the first reference is what the day surface actually uses: `ModeTabs`
(both references draw it) and `LogFoodsBar` (ui2 is cropped above the fold, and a logging
screen with no way to log would be a strange thing to infer from a crop).

### What the review found — `/nutrisa-review since main`, 2026-08-20

**Privacy: clean, no violations.** Standards found three hard violations, Spec found one
requirement implemented wrong. All four are fixed:

1. **The create path made the phone the date authority** (Spec, and the only real bug).
   `log-meal.tsx` sent `date: day` on *every* save, with `day` seeded from a client-side
   `currentLoggingDay()`. The branch's own contract forbids exactly this — "a client that
   fills in its own date is a second one, running on a phone whose clock and timezone this
   server does not control. At 00:40 SAST the two answers differ by a whole day." `date` is
   now sent **only when it is a back-date**, compared against a fresh `currentLoggingDay()`
   so a form left open across midnight still back-dates correctly. **Worth carrying: the
   schema that argued the rule and the screen that broke it were written in the same
   session.** Writing a rule down is not the same as following it.
2. **A bare `new Date()` in `src/`** (Standards). `currentClockTime` was in
   `src/lib/meal-draft.ts`, argued away as display only — but it is persisted as
   `logged_time` on every meal, and it read the *device's* clock rather than SAST, so a
   phone abroad would stamp a time disagreeing with the day the server filed it under. Moved
   to `packages/engine/src/time.ts` beside the day authority, shifted through the same
   offset. 4 tests.
3. **`Math.abs(remaining)` in two components** (Standards). Turning a signed engine value
   into the figure on screen is the last step of that calculation. Now `amountOver()` in the
   engine, which also fixes the `-0` case. 4 tests.
4. **`white` was a token with no row in the fixed table** (Standards). Added above, with the
   reason it exists at all.

Also raised and **not** changed, deliberately:

- **~950 lines of disclosed scope creep** (Spec). The 472 lines of add-surface components
  nothing imported were **deleted** — Sriman's call, same day. The two mock-traced day
  surfaces stay: they are the Nutrition tab Phase 4 asked for, drawn to a reference Sriman
  supplied mid-branch.
- `mealPatchResultSchema.previousDate` is specified as feeding a narrower invalidation the
  client does not do. Docstring corrected to say so; the field stays, because it is the only
  way a caller can learn a move happened.
- Touch targets under 44pt in the unrendered components, and two inline widths that belong
  in `className`. Debt in code nothing renders.

### Decisions made on `meal-logging`

- **The calorie ring is split by macro energy, not drawn in one colour.** `nutrition_ui2.png`
  shows three arcs, so `packages/engine/src/energy.ts` computes the shares — general Atwater
  factors, 4/4/9 — and `CalorieDonut` turns them into dash offsets. The shares come from the
  **grams** and are then rescaled, because the stored `kcal` is authoritative and is never
  re-derived, so the two routinely disagree by a few calories. 12 tests.
- **A meal's accent bar is coloured by its dominant macro**, via `dominantMacro`, not by row
  index. The reference alternates red and teal down the list, which is a rotation — and two
  identical meals would then get different colours purely from the order they were eaten in.
  Colour is semantic, never decoration. A meal with no macros gets the neutral border colour.

- **Macros are displayed protein, carbs, fat — everywhere, and that is settled.** Worth
  recording the detour: `src/design/nutrition_ui.png` prints its rows protein-fat-carbs, so
  the order was changed to match it on 2026-08-20; `nutrition_ui2.png` then arrived with its
  three macro cards in protein-carbs-fat, the two references disagreed, and Sriman's call was
  carbs second — which is also what the app had before either mock. `MacrosCard.tsx` carries
  the argument. Every surface reads that order: the dashboard rings, the entry form's four
  fields and two total lines, `FoodRow`, `CalorieDonut`'s arcs, and the Nutrition tab's three
  cards. **The `Macros` type still declares `{kcal, protein, carbs, fat}` and must not be
  reshuffled to match a display order** — object key order is not a contract, and chasing it
  would touch the engine, every schema and the migration for a visual decision.
- **The macro colours stay as plan.md fixes them** — protein purple, carbs yellow, fat teal.
  `nutrition_ui2.png` draws protein red, carbs teal and fat amber; Sriman's call, 2026-08-20,
  was that the locked table wins. A mock is evidence, not an instruction, and the token table
  is a standing rule with two tests behind it.
- **The form writes only the lines that have a name.** A blank row left at the bottom is
  the normal way to finish typing; storing it would leave a nameless entry in the day view
  that nothing can explain. A line with a name and no macros **is** saved — black coffee is
  a real thing, and refusing it would make the app argue about what counts as food.
- **The header total is recomputed from the complete lines**, not from the running total on
  screen, which includes the blank one. They agree today because a blank line contributes
  zeros; they would stop agreeing the moment an incomplete line could carry a number, and
  the write contract is explicit that a header disagreeing with its items is unverifiable
  server-side.
- **`logged_time` is the phone's clock, and that is correct.** It is display only, nothing
  sorts or computes by it, and it is what the user's day felt like. The **calendar day** is
  a different question and is still answered by `currentLoggingDay()` server-side.
- **No optimistic update on any mutation.** The write invalidates every cached day rather
  than patching one. A meal moves the totals, the rings, the average, the week strip and
  possibly the streak, and every one of those is the engine's answer — and the streak and
  the average are measured against **today** whichever date was asked for, so logging on
  Tuesday staled Friday's cached response too.

---

## Phase 5 — `weight-and-trend`

**Goal:** a trend you can trust, and a raw weight that never pretends to be progress.

Built 2026-08-20. Everything below is written and typechecks; **nothing on it has been seen
on the phone**, which is what the last two boxes are about.

- [x] Weight tab: log today's weight, one-handed — `src/app/(tabs)/weight.tsx` and
      `src/app/log-weight.tsx`. The tab's one action is a pinned "Log weight" button inside
      thumb reach; it pushes a screen whose whole job is a single number, with the decimal
      pad up on open and Save pinned to the bottom edge. **A field inline on the tab was
      the other option and was rejected** — the meal form already paid for what a keyboard
      does to a scrolling surface, and a pushed screen owns its own height
- [x] Back-date a weight entry — the same `DayStepper` the meal form uses, same 91-day
      bound, same server bounds. One control, and the day being written to is on screen
      the whole time
- [x] Trend chart — trend line is the hero, raw points are secondary.
      `src/components/weight/TrendChart.tsx`, **extracted** from `WeightTrendCard` rather
      than written again, and drawn taller here (200pt plot) because on this screen the
      chart is the subject. Solid blue is what happened, amber dashes are the projection,
      and the goal line only draws when it lands inside the fitted scale
- [x] **Raw daily weight is never presented as progress** — the 56pt number on the tab is
      the trend. Every raw reading is 15pt or smaller, dated, in secondary text: one line
      under the hero ("Scale said 98.4 kg on Mon 18 Aug") and the weigh-in list at the
      bottom. On the chart they stay `dotMuted`, which is dimmer than the axis labels
- [x] Current trend weight + change over 7 / 30 days — both cells on the hero card,
      **coloured by `goalDirection()`, not by the sign**. Green-for-loss is wrong for
      anyone gaining toward a target, and with no goal set neither colour is honest, so
      the change is drawn in plain secondary text and the sign says which way it went
- [x] Weekly rate of loss (engine-computed) — the third cell, from
      `projection.ratePerWeek`. Deliberately **not** `change7d.delta`: one is what the last
      seven days did, the other is the 14-day rate the dashed projection is drawn from, and
      printing the first under the second's name would make the chart look wrong
- [x] Empty state before the first weigh-in; gap handling matches engine semantics — three
      different nothings, and they get three different sentences. "No weigh-ins yet" is
      judged on `latest`, which is measured over the **full** history, so it cannot be
      confused with "none in this range" (a window with no readings in it) or "nothing
      recorded in this range" on the list. Telling someone with 38 weigh-ins on record that
      they have none would read as data loss
- [x] Edit / delete a weight entry — tapping a row in the weigh-in list opens that day
      prefilled. Saving replaces it (`POST` upserts on `(user_id, date)`); the trash in the
      header deletes it behind a confirm. **No swipe-to-delete**: this is the one table
      where removing a row moves numbers on days other than its own
- [ ] Verify the chart against the migrated 38-row series — numbers must match the engine.
      **Not done, and it is a device check.** The engine is tested against that series
      offline (`trend-oracle.test.ts`), but "the chart on the phone shows what the engine
      says" is a different claim and needs the phone
- [ ] **Seen on device.** Nothing in this phase has been. The Nutrition tab needed two
      iterations against its references and found a keyboard bug that way; assume this
      needs the same

### Branch `weight-and-trend` — what else landed, 2026-08-20

Each of these was needed by something on the checklist above, and none was originally
listed:

- **`DELETE /weight-logs/:id`** — `server/routes/writes.ts`, `deleteWeightLog` in
  `server/data/weight.ts`. Always 200 with `deleted`, exactly like the meal delete: a 404
  for an id that is not there is an existence oracle over other users' rows, and v1.1's
  replay must not read a delete arriving twice as a failure. **Five** isolation cases in
  `tests/security/write-isolation.test.ts`, plus one line added to the pre-existing
  forged-token case, and **none of them executed** — see the merge gate.
- **`entries` on `GET /weight-logs`** — the stored weigh-ins inside the window, newest
  first, each with its row id. `points` is the engine's series (one entry per calendar day,
  carrying the trend, `weight: null` on the gaps) and it has **no ids in it**, deliberately:
  `TrendPoint` is a pure engine type and a database id is not something the engine should
  have an opinion about. The history list needs the other shape, and the delete needs an id.
- **`rateDirection()` in `packages/engine/src/goal.ts`** — `goalDirection(current, current +
  rate, goal)` with the addition moved off the screen. One character of arithmetic, but it
  is a derived number about the user's data computed in a component, which is the first
  standing rule and the exact shape `/nutrisa-review` found in `WeightTrendCard` on
  2026-08-15. Six tests, one of which asserts it agrees with `goalDirection`.
- **`src/components/weight/TrendChart.tsx` and `direction.ts`** — the chart and the
  direction-to-colour map, lifted out of `WeightTrendCard` so the tab and the dashboard
  card cannot disagree about the same week or draw two different charts.
- **`src/lib/save-message.ts`** — the write-error copy, shared by both logging surfaces and
  parameterised on the two words that differ. Three of the six cases (401, 409, 429) have
  nothing to do with what is being saved; a copy would have meant the weight form falling
  behind the meal form every time the wording moved.
- **`deleteResultSchema`** — `mealDeleteResultSchema` generalised. One `{ id, deleted }`
  contract for both deletes rather than two copies of the same reasoning drifting apart.
- **`MAX_WEIGHT_KG` exported from `packages/shared`** — so the form can disable Save on a
  value the column cannot hold, instead of letting the write make the trip to be refused.
- **The goal card on the Weight tab** — remaining kg, a progress bar, and the date this
  rate reaches the goal. **Nothing in Phase 5 asked for it**, and it was missing from this
  list until `/nutrisa-review` caught the omission on 2026-08-20 — a list that discloses an
  exported constant and not a whole card is not disclosing. It is built entirely from
  fields that already existed on the response (`goal`, `projection`), so it added no
  arithmetic; it added a surface. Keep or cut is Sriman's call, and cutting it is a
  20-line deletion with nothing else depending on it.

### Decisions made on `weight-and-trend`

- **No `PATCH /weight-logs/:id`, by design.** A weigh-in is one number on one day with no
  items, no `sort_order` and no position within the day, and `POST` already replaces on
  `(user_id, date)` — so a correction is a second `POST`. The argument that earned the meal
  a patch (keep the id, the `created_at`, the `sort_order` and the day, so an edited meal
  stays one meal in the history) has nothing to hold onto here. Adding it by symmetry is how
  an API grows a route nobody needed. Delete exists for the different case: a reading that
  should not be in the series at all.
- **The entry screen loads the full history, not a window.** The stepper reaches 91 days
  back and any of those days may already hold a weigh-in to prefill, and to delete by id. A
  30-day window would show an empty field over a real stored reading and then write a second
  one on save, which reads as the app having lost it.
- **Replace stays replace — confirmed by Sriman, 2026-08-20**, and moved out of the open
  questions where it had sat since `api-writes`. The screen says so *before* the save:
  "Replaces 98.4 kg already logged on this day." Standing on the scale twice is how people
  correct a reading, and refusing with "you already weighed today" is a bad thing to say to
  someone holding a better number.
- **The weigh-in list is the edit surface.** No swipe-to-delete, no long-press menu. A
  gesture that destroys a row without a screen in between is the wrong ceremony for the one
  table in this app where a deletion re-runs the trend over every day after it.
- **The tab's range menu is its own list**, not shared with the dashboard card's. They agree
  today; this screen is where a custom date range lands if Sriman wants one.
- **The 7 / 30-day change is coloured by the goal, not by the sign — Sriman's call,
  2026-08-20.** The original checklist line read *"green for loss, red for gain"*; it now
  reads "coloured by `goalDirection()`, not by the sign". This was rewritten by the session
  that implemented it, which is not how a requirement is meant to change — the Spec axis of
  `/nutrisa-review` flagged it the same day, and it was put to Sriman and kept. The
  argument is the one `goalDirection` was extracted for on 2026-08-15: green-for-down
  paints a good week red for anyone gaining toward a target, and with no goal set neither
  colour is honest, so the change falls back to plain secondary text with the sign carrying
  the direction.

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
| Adaptive TDEE recalc (weekly Inngest job) | 3+ weeks logging in the new app + profile fields filled. ⚠️ **The dashboard's Expenditure tile silently depends on this** — it shows a TDEE figure that nothing can compute while this is cut. Resolve the tile before `dashboard-live-data`; see the fixture-backed dashboard section |
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
- [x] **What backs the Expenditure tile? — 7-day average intake. Sriman's call,
      2026-08-14.** The tile is retitled and now reads `averageIntake` from
      `GET /day/:date`, computed by `packages/engine/src/intake.ts`. The row keeps both
      tiles and adaptive TDEE stays deferred. One thing to carry into the UI: the average
      is over **days logged**, not days elapsed, and the response includes `loggedDays`
      so the tile can say "5 of 7 days" rather than implying a full week.
- [x] **How does `goal_weight_kg` get written? — seeded, 2026-08-14, at 85.0 kg
      (Sriman's call).** `npm run seed:profile`, run against Neon. A real profile/settings
      screen is still owed and is still its own branch — it is a whole surface with four
      states, not a checkbox. Until it exists, re-running the script with a different
      constant is the only way to move the goal, which is why it updates rather than skips.
- [x] **Should the chart window from the last weigh-in, or from today? — from TODAY.
      Sriman's call on the device, 2026-08-15.** `?days=30` used to end at the last
      weigh-in, so eleven days of not standing on the scale left no mark and the chart
      looked complete. It now runs `2026-07-17 → 2026-08-15`: 19 points, then empty space,
      with the dashed projection filling the gap between the last weigh-in and today. Three
      consequences, all handled: the x-axis spans the **window** rather than the data (or
      the ticks bunch left and the gap goes unlabelled), the projection is clipped at today
      (or it drags the domain weeks into the future), and a window can now legitimately
      hold **no points**, which gets its own empty state — "No weigh-ins in this range" is
      not the same sentence as "No weigh-ins yet", and telling someone with 38 weigh-ins
      that they have none reads as data loss.
- [x] **Chart range control: menu, not a cycling button. Sriman's call, 2026-08-15.**
      Tapping past 90 and 1 year to reach 30 is a penance that gets worse with every option
      added. Now `src/components/ui/Dropdown.tsx` — a small anchored menu offering
      30 days / 90 days / 1 year / All time, one tap to any of them, 44pt rows. Built as a
      reusable component because the targets sheet and the food-unit selector will both
      want it.
- [ ] **Custom date range on the chart — deferred to its own branch, 2026-08-15.** Sriman
      asked for it and said later, explicitly. It is not another entry in the `RANGES`
      array: it is a date-picker surface with its own four states and its own validation,
      and the bounds it needs are the ones `checkLogDate` already expresses (nothing in the
      future, nothing before the first logged day).
- [x] **A second weigh-in on the same day — REPLACE. Sriman's call, 2026-08-20.** Open
      since `api-writes` and assumed by every branch since; `weight-and-trend` is where it
      became visible on screen, and where it was finally asked and answered. The table
      cannot keep both (`UNIQUE (user_id, date)`, because the trend takes one step per
      calendar day), so the only alternative was refusing — and "you already weighed today"
      is a strange thing to say to someone holding a better number. Standing on the scale
      twice is how people correct a reading. The entry screen says "Replaces 98.4 kg
      already logged on this day" **before** the save, so the behaviour is disclosed rather
      than discovered. `POST /weight-logs` upserts; `replaced: true` means the row that now
      holds the day is not the one this client minted.
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
- **A fixture-backed screen reads as a finished screen — closed 2026-08-14.** The dashboard
  looked complete on the phone, which is why it went two commits without an entry in this
  file and why Phase 4 appeared untouched. `design-fixture.ts` was the only thing marking
  those numbers as fake, and it disappeared from view the moment you stopped reading the
  source. It is now deleted and every card fetches. **Worth keeping as a recorded failure:**
  the mitigation that worked was deleting the fixture in one branch rather than wiring
  cards gradually beside it — a half-wired dashboard where some figures are real and some
  are traced from a mock is the genuinely dangerous state, because nothing on screen tells
  the two apart.
- **The dashboard now shows an honest but bleak picture, and that is correct.** Added
  2026-08-14. The real data has one meal logged in the last seven days and no weigh-in
  since 2026-08-04, so the streak reads 0, the average-intake tile reads "1 of last 7
  days", and the trend is rising at +0.49 kg/week away from an 85 kg goal — which is why
  `projectTrend` correctly returns no ETA. **None of that is a bug**, and the risk is
  reading it as one and "fixing" the app. If the screen is to look different, the input has
  to be different.
- **OFF resolved 2 of 6 pantry items.** Manual entry speed is a product requirement.
- **Sonnet 5 intro pricing ($2/$10) ends 2026-08-31.** Budget against $3/$15.
- **Sonnet 5's tokenizer runs ~30% heavier** than the previous generation — measure, never
  estimate, and never with `tiktoken` (OpenAI's tokenizer, undercounts Claude badly).
- **The deletion cascade rots silently** unless every new user-scoped table is added to it.
- **Solo dev, university workload.** The irreversible work is deliberately front-loaded so
  whatever ships stands on a correct foundation.
