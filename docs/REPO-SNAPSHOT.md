# NutriSA — Repository Snapshot

Prepared for an external architecture review. Captured 2026-08-12 from
`C:\Users\Administrator\NutriSA_APP`, branch `main`, working tree clean at commit
`9f52578`.

Read-only snapshot. Nothing in the repository was changed to produce it, and no fixes
were applied to anything recorded in section 6.

---

## 1. Verbatim project instructions

`CLAUDE.md` is a single line — `@AGENTS.md` — so the two files below are the whole of the
standing instruction set.

### AGENTS.md

````markdown
# NutriSA — Agent Instructions

## Before writing any code

**Expo has changed.** Read the exact versioned docs before writing Expo code:
https://docs.expo.dev/versions/v54.0.0/ — not blog posts, not memory, not `latest`.

⚠️ **`latest` in the Expo docs is not the version this project runs.** See the SDK pin below.

Then read `plan.md` for the current phase, the standing rules, and the design tokens.
The full spec, with the reasoning behind every decision, lives at:
`~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md`

## Stack — decided, do not substitute

| Layer | Choice |
|---|---|
| App | Expo SDK **54**, React Native 0.81.5 — **pinned, see below** |
| Routing | expo-router — file-based, `typedRoutes`, React Compiler on |
| Navigation | **Native Tabs** — see the rule below. Never JS tabs. |
| Styling | NativeWind v4, `className` only |
| Server state | React Query + a typed client over shared zod schemas |
| API | Hono on Vercel |
| Database | **Neon** (serverless Postgres) |
| ORM | **Drizzle** + `drizzle-kit` for migrations |
| Auth | **Clerk** — skills in `.agents/skills/clerk-expo` |
| Background jobs | **Inngest** |
| Images | **ImageKit** — optimization and delivery |
| Errors & monitoring | **Sentry** — `sendDefaultPii: false` |
| Tests | Vitest |

Shared zod schemas live in `packages/shared/` and are imported by both client and server.
There is one source of truth per contract; never redeclare a shape on one side.

## The SDK is pinned to 54 — do not upgrade it

**Expo Go from the App Store supports exactly one SDK at a time, and right now that is 54.**
Newer SDKs exist in the docs and on npm long before the Expo Go binary clears Apple review.
Phase 3 runs on Expo Go because it is the only free path onto the iPhone, so **the App Store
Expo Go build — not the docs — decides this project's SDK.**

This has already been learned the hard way: an upgrade to SDK 57 typechecked clean and
passed `expo-doctor` 20/20, then failed on the device with *"Project is incompatible with
this version of Expo Go"* and had to be fully reverted.

- Do not run `npx expo install expo@^<newer> --fix`, and do not "helpfully" bump the SDK.
- `eas go` builds a personal Expo Go for a newer SDK, but **requires the paid Apple
  Developer account** — that is Phase 12, not now.
- The SDK moves only when Sriman confirms the Expo Go app on the iPhone reports a new
  number. Verify against the device, never against `docs.expo.dev/versions/latest`.

## Native tabs — always

The app's tab bar is **always** the platform-native tab bar:

```tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs';
```

- **Never** use the JavaScript `Tabs` from `expo-router`, and never
  `@react-navigation/bottom-tabs`. If you are reaching for either, stop and ask.
- The `unstable-` import path is correct and expected — Native Tabs is still alpha and the
  API is subject to change, and it changed between SDK 54 and 55. Check the **SDK 54** docs
  for the current shape before editing the tab layout; do not copy another SDK's API.
- Native Tabs under Expo Go on SDK 54 is **unverified** — see the open question in `plan.md`.
- If a design need appears to require a JS tab bar, that is a question for Sriman, not a
  decision to make in code.

## Non-negotiables

The complete list is in `plan.md` under "Standing rules" — copy that block into every
branch review. These are the ones that most often get violated by default:

- **Zero arithmetic in the model.** Every computed number comes from the deterministic
  engine in `packages/engine/`. The model transcribes, classifies and explains; it never
  calculates.
- **Four states on every surface**: empty, loading, error, happy. No exceptions.
- **`user_id` is never accepted from the client.** It is derived server-side from the
  verified Clerk token and injected through the scoped query layer.
- **One time authority.** All dates come from `currentLoggingDay()` (Africa/Johannesburg).
  No stray `new Date()`, no client-supplied day key.
- **Dark only.** No light theme, no toggle, no `dark:` variants. Tokens are fixed in `plan.md`.
- **44×44px minimum touch targets**, primary actions within thumb reach.
- **New user-scoped table?** Add it to the POPIA deletion cascade *and* the export in the
  same branch. A table that escapes the cascade is a silent legal hole.

## Data & privacy boundaries

- **ImageKit is for stored, displayed images only** — progress photos and food imagery.
  It is **never** in the label-OCR path. OCR photos are ephemeral: captured, sent to the
  model, discarded. Never uploaded, never retained.
- ImageKit private keys stay server-side. Only the public URL endpoint may reach the client.
- Never log weight, macro values, or request bodies to Sentry.
- Secrets come from `.env`, are never hard-coded, and are never committed.

## Do not, by default

- Do not `npm install` an Expo package — use `npx expo install` so versions stay aligned.
- Do not edit `android/` or `ios/` by hand. This project uses Continuous Native Generation:
  change `app.json` and config plugins instead.
- Do not import from `@react-navigation/*` directly — go through expo-router.
- Do not use `StyleSheet.create` or inline style objects for layout. NativeWind `className`.
- Do not use relative imports across features — use the `@/*` and `@/assets/*` aliases.
- Do not add a runtime dependency to `packages/engine/`. It stays pure TypeScript so it can
  be tested in isolation and shared by both sides.
- Do not write raw SQL where Drizzle expresses it; do not bypass the scoped query layer.
- **Never run the app.** Sriman always has it running in a separate terminal. Do not run
  `npm start`, `expo start`, `expo run:android`, `expo run:ios`, or any dev server — a
  second instance fights the first for the port and the Metro cache. Metro hot-reloads
  your edits into the running app on its own. When you need to see the result, describe
  what to look at and ask; do not start it yourself.
- **Do not run git.** Never commit, push, or create branches. Report what changed and let
  Sriman run the command.

## Workflow

One feature per branch, one fresh session per branch. At the end of a session, stop and
hand off — suggest the next branch name, don't create it.

## Commands

```bash
npx expo install <pkg>   # never plain npm install for Expo packages
npx tsc --noEmit         # typecheck
npx vitest               # engine suite — must be green before merge
npx drizzle-kit generate # after any schema change
```

`npm start` / `expo start` are **Sriman's to run**, never yours — see "Do not, by default".
````

### plan.md

````markdown
# NutriSA — Build Plan

Living checklist. Tick items as they land; don't delete them — a completed history is
useful. Full reasoning behind every decision lives in the spec:
`~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md`

**Workflow:** one feature per branch, one fresh session per branch, all git run manually.

**Status (2026-08-12):** Phase 0 done bar the Anthropic spend cap · **Phase 1 engine and
migration complete** — all 11 tables live in Neon, the 38-row history migrated and verified,
73 engine tests green · **the trend algorithm was corrected from per-row to per-calendar-day
after checking it against the real data; the spec's stated hypothesis was wrong** ·
**Phase 3 auth shipped early and verified on device** · Clerk → Neon sync live via Inngest
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
      — **still open: none of these tables exist yet.** The job currently deletes the
      only user-scoped table there is (`users`). Each table above must be added to the
      cascade in the branch that creates it
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
````

---

## 2. Directory tree (3 levels)

Excludes `node_modules/`, `.git/`, `.expo/`. Everything else present on disk is listed,
including untracked and gitignored paths — `android/`, `data/` and `.env` are all
gitignored but do exist locally.

```
NutriSA_APP/
├── .agents/
│   └── skills/
│       ├── clerk/
│       ├── clerk-backend-api/
│       ├── clerk-cli/
│       ├── clerk-custom-ui/
│       ├── clerk-expo/
│       ├── clerk-setup/
│       └── clerk-webhooks/
├── .claude/
│   └── settings.json
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── android/                          (gitignored, CNG-generated)
│   ├── .gitignore
│   ├── .gradle/
│   ├── .kotlin/
│   ├── app/
│   ├── build/
│   ├── build.gradle
│   ├── gradle/
│   ├── gradle.properties
│   ├── gradlew
│   ├── gradlew.bat
│   ├── sentry.properties
│   └── settings.gradle
├── assets/
│   ├── expo.icon/
│   │   ├── Assets/
│   │   └── icon.json
│   └── images/
│       ├── android-icon-background.png
│       ├── android-icon-foreground.png
│       ├── android-icon-monochrome.png
│       ├── expo-badge.png
│       ├── expo-badge-white.png
│       ├── expo-logo.png
│       ├── favicon.png
│       ├── icon.png
│       ├── logo-glow.png
│       ├── react-logo.png
│       ├── react-logo@2x.png
│       ├── react-logo@3x.png
│       ├── splash-icon.png
│       ├── tabIcons/
│       └── tutorial-web.png
├── data/                             (gitignored — real health data)
│   └── supabase_export/
│       ├── custom_foods_rows.csv
│       ├── custom_meals_rows.csv
│       ├── meal_logs_rows.csv
│       └── weight_logs_rows.csv
├── packages/
│   └── engine/
│       └── src/
├── scripts/
│   ├── csv.ts
│   └── migrate-supabase-to-neon.ts
├── server/
│   ├── db/
│   │   ├── index.ts
│   │   ├── migrations/
│   │   └── schema.ts
│   ├── inngest/
│   │   ├── client.ts
│   │   └── functions.ts
│   ├── env.ts
│   ├── index.ts
│   └── README.md
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   └── sso-callback.tsx
│   ├── components/
│   │   ├── dashboard/
│   │   ├── icons/
│   │   ├── nativewind-interop.ts
│   │   └── TabPlaceholder.tsx
│   └── design/
│       ├── app_ui_design_inspiration.png
│       ├── auth_screen_bg.webp
│       ├── auth_ui_design.png
│       ├── design_system.png
│       ├── home_screen_ui.png
│       ├── home_screen_ui2.png
│       ├── logo.png
│       ├── logo-mark.png
│       └── nutrition_tab_ui.png
├── .env                              (gitignored)
├── .env.example
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── LICENSE
├── README.md
├── app.json
├── assets.d.ts
├── babel.config.js
├── drizzle.config.ts
├── expo-env.d.ts
├── global.css
├── metro.config.js
├── nativewind-env.d.ts
├── package.json
├── package-lock.json
├── plan.md
├── skills-lock.json
├── tailwind.config.js
├── tsconfig.json
└── vitest.config.mts
```

Directories that the instructions reference but that do not exist: `packages/shared/`,
`docs/` (this file creates it), `ios/`.

---

## 3. Verbatim configuration and engine core

### package.json

```json
{
  "name": "nutrisa_app",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "dependencies": {
    "@clerk/backend": "^3.16.1",
    "@clerk/expo": "^4.2.3",
    "@expo-google-fonts/barlow": "^0.4.1",
    "@expo-google-fonts/barlow-condensed": "^0.4.1",
    "@hono/node-server": "^2.1.0",
    "@neondatabase/serverless": "^1.1.0",
    "@sentry/react-native": "~7.2.0",
    "drizzle-orm": "^0.45.2",
    "expo": "~54.0.36",
    "expo-auth-session": "~7.0.11",
    "expo-constants": "~18.0.13",
    "expo-dev-client": "~6.0.21",
    "expo-device": "~8.0.10",
    "expo-font": "~14.0.12",
    "expo-image": "~3.0.11",
    "expo-linear-gradient": "~15.0.8",
    "expo-linking": "~8.0.12",
    "expo-router": "~6.0.24",
    "expo-secure-store": "~15.0.8",
    "expo-splash-screen": "~31.0.13",
    "expo-status-bar": "~3.0.9",
    "expo-system-ui": "~6.0.9",
    "expo-web-browser": "~15.0.11",
    "hono": "^4.13.1",
    "inngest": "^4.18.0",
    "isexe": "^4.0.0",
    "nativewind": "^4.2.6",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-svg": "15.12.1",
    "react-native-web": "^0.21.0",
    "react-native-worklets": "0.5.1",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^26.2.0",
    "@types/react": "~19.1.10",
    "babel-preset-expo": "~54.0.10",
    "dotenv": "^17.4.2",
    "drizzle-kit": "^0.31.10",
    "prettier-plugin-tailwindcss": "^0.5.14",
    "tailwindcss": "^3.4.19",
    "tsx": "^4.23.11",
    "typescript": "~5.9.2",
    "vitest": "^4.1.10"
  },
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "server": "tsx watch server/index.ts",
    "inngest:dev": "npx inngest-cli@latest dev -u http://localhost:3000/api/inngest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "migrate:supabase": "tsx scripts/migrate-supabase-to-neon.ts",
    "migrate:supabase:dry": "tsx scripts/migrate-supabase-to-neon.ts --dry-run"
  },
  "private": true
}
```

### tailwind.config.js

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Fixed token table — plan.md. Dark only, no light theme.
        ground: "#0D0F14",
        card: "#13161E",
        secondary: "#1A1E29",
        primary: "#0066FF",
        // Slightly brighter blue the reference uses for inline text links.
        link: "#1A7CFC",
        ok: "#22C55E",
        danger: "#FF3B30",
        amber: "#F59E0B",
        protein: "#A78BFA",
        carbs: "#FCD34D",
        fats: "#2DD4BF",
      },
      fontFamily: {
        // React Native resolves a font by family name only — never pair these
        // with font-bold / italic utilities, the file already carries the weight.
        display: ["BarlowCondensed_800ExtraBold_Italic"],
        barlow: ["Barlow_400Regular"],
        "barlow-medium": ["Barlow_500Medium"],
        "barlow-semibold": ["Barlow_600SemiBold"],
        "barlow-bold": ["Barlow_700Bold"],
      },
    },
  },
  plugins: [],
}
```

### app.json

```json
{
  "expo": {
    "name": "NutriSA_APP",
    "slug": "NutriSA_APP",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "nutrisaapp",
    "userInterfaceStyle": "dark",
    "ios": {
      "icon": "./assets/expo.icon"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false,
      "package": "com.anonymous.NutriSA_APP"
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ],
      [
        "@sentry/react-native",
        {
          "organization": "sriman-arjuna-persadh",
          "project": "nutrisa"
        }
      ],
      "@clerk/expo",
      "expo-secure-store"
    ],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

### packages/engine/src/time.ts

```ts
/**
 * The single time authority. Every date in the app comes from here.
 *
 * South Africa is UTC+2 year round and has never observed daylight saving, so
 * the offset is a constant rather than an Intl lookup. That is the only reason
 * this module can be pure and dependency-free — the moment the app goes
 * international (a named v2 trigger in plan.md) this becomes a real timezone
 * conversion and every caller has to pass a zone.
 */

/** A calendar day in Africa/Johannesburg, `YYYY-MM-DD`. */
export type LogDay = string

/** UTC+02:00, no DST, ever. */
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * The calendar day an instant belongs to in SAST.
 *
 * The instant is shifted by the offset and then read with the `getUTC*`
 * accessors, so the result never depends on the timezone of the machine
 * running it. A server in UTC, a phone in SAST and a laptop in CAT all agree.
 *
 * This is the "00:40 case": at 00:40 SAST the UTC instant is 22:40 the previous
 * day, so anything that reaches for the UTC date directly logs the meal against
 * yesterday. Anyone logging a late-night snack would have it silently land on
 * the wrong day, and the day's macro totals would be wrong for two days at once.
 */
export function currentLoggingDay(now: Date = new Date()): LogDay {
  return toLogDay(now)
}

/** The SAST calendar day for any instant. `currentLoggingDay` is this, for now. */
export function toLogDay(instant: Date): LogDay {
  const shifted = new Date(instant.getTime() + SAST_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * The SAST month a day falls in, `YYYY-MM`.
 *
 * The AI budget gate sums spend per calendar month in Africa/Johannesburg, not
 * UTC. Deriving it from the day rather than the instant means the month
 * boundary and the day boundary can never disagree — a turn at 00:30 SAST on
 * the 1st belongs to the new month, the same way it belongs to the new day.
 */
export function logMonth(day: LogDay): string {
  return day.slice(0, 7)
}

/** True if `value` is a well-formed `YYYY-MM-DD` that names a real date. */
export function isLogDay(value: string): value is LogDay {
  if (!DAY_PATTERN.test(value)) return false
  // Catches 2026-02-30 and 2026-13-01, which the pattern alone lets through.
  // Parsed as plain UTC midnight, deliberately — validating through
  // startOfLogDayUtc would shift the day back two hours and fail every date
  // against itself.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  )
}

/**
 * The UTC instant at which a SAST calendar day begins — 22:00 UTC the day
 * before. Used for range queries against `timestamptz` columns.
 */
export function startOfLogDayUtc(day: LogDay): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - SAST_OFFSET_MS)
}

/** Whole days from `from` to `to`, negative if `to` is earlier. */
export function daysBetween(from: LogDay, to: LogDay): number {
  const ms = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)
  return Math.round(ms / 86_400_000)
}

/** `day` shifted by `delta` calendar days. */
export function addDays(day: LogDay, delta: number): LogDay {
  const shifted = new Date(Date.parse(`${day}T00:00:00.000Z`) + delta * 86_400_000)
  return shifted.toISOString().slice(0, 10)
}

export type LogDateBounds = {
  /** Today in SAST. Nothing may be logged after this. */
  today: LogDay
  /**
   * The user's earliest logged day, if they have one. Nothing may be logged
   * before it — a back-date into a period the user was not tracking would show
   * up as a trend point with no history behind it.
   */
  firstLogDay?: LogDay
}

export type LogDateRejection =
  | "malformed"
  | "in-the-future"
  | "before-first-log"

/**
 * Whether a user-supplied `date` may be written.
 *
 * Back-dating is a real feature, not a loophole, so this bounds it rather than
 * forbidding it. Returns the reason on failure because each one needs different
 * words on screen: a future date is a mistake, a pre-history date is a
 * limitation worth explaining.
 */
export function checkLogDate(
  date: string,
  bounds: LogDateBounds,
): { ok: true; day: LogDay } | { ok: false; reason: LogDateRejection } {
  if (!isLogDay(date)) return { ok: false, reason: "malformed" }
  if (daysBetween(bounds.today, date) > 0) {
    return { ok: false, reason: "in-the-future" }
  }
  if (bounds.firstLogDay && daysBetween(bounds.firstLogDay, date) < 0) {
    return { ok: false, reason: "before-first-log" }
  }
  return { ok: true, day: date }
}

/** Convenience wrapper for callers that only need a yes or no. */
export function isValidLogDate(date: string, bounds: LogDateBounds): boolean {
  return checkLogDate(date, bounds).ok
}
```

### packages/engine/src/index.ts — the engine's exports file

`packages/engine/` has no `package.json`. It is not an npm workspace; it is resolved
through the `@engine` / `@engine/*` path aliases in `tsconfig.json`, so this file is the
package's entire public surface.

```ts
/**
 * The deterministic engine. Pure TypeScript, zero runtime dependencies, no DB
 * access and no imports from `server/` or `src/` — that is what lets it be
 * tested in isolation and imported by both sides.
 *
 * Every number a user sees comes from here. Nothing downstream — least of all
 * the model — is allowed to do the arithmetic itself.
 */

export { roundTo } from "./round"

export {
  currentLoggingDay,
  toLogDay,
  logMonth,
  isLogDay,
  startOfLogDayUtc,
  daysBetween,
  addDays,
  checkLogDate,
  isValidLogDate,
  type LogDay,
  type LogDateBounds,
  type LogDateRejection,
} from "./time"

export {
  trendWeightSeries,
  latestTrend,
  loggedPoints,
  trendChangeOverDays,
  type WeightEntry,
  type TrendPoint,
  type TrendChange,
} from "./trend"

export {
  dayTotals,
  remainingMacros,
  macroProgress,
  ZERO_MACROS,
  type Macros,
  type LoggedItem,
} from "./macros"

export { resolveTargetForDate, type TargetRow } from "./targets"

export {
  goalProgress,
  projectTrend,
  type GoalProgress,
  type Projection,
  type ProjectionOptions,
  type ProjectionPoint,
} from "./goal"

export {
  computeUsageCost,
  sumUsageCosts,
  CURRENT_RATE_VERSION,
  type ModelId,
  type RateVersion,
  type TokenUsage,
  type UsageCost,
} from "./cost"
```

---

## 4. File-by-file purpose

Every file below was read in full. Purposes are taken from the code and its docblocks,
not inferred from the filename.

### packages/engine/src/

| File | Purpose |
|---|---|
| `index.ts` | The engine's single public surface — re-exports every function and type from the six modules; nothing outside imports a module directly. |
| `round.ts` | `roundTo()`, half-up via scale → round → unscale. Its docblock records that it deliberately uses `Math.round` rather than `toFixed` in order to match the previous implementation, and names itself the first thing to change if the oracle test fails. |
| `time.ts` | The single time authority. `currentLoggingDay()` / `toLogDay()` derive the SAST calendar day by adding a constant +2h offset and reading `getUTC*`, so the result never depends on the host machine's zone. Also `logMonth`, `isLogDay`, `startOfLogDayUtc`, `daysBetween`, `addDays`, and `checkLogDate` / `isValidLogDate` for bounded back-dating. |
| `time.test.ts` | 132 lines. Pins the SAST-vs-UTC day boundary (the 00:40 case), the 22:00 UTC rollover to the millisecond, month and year rollover, and the back-date bounds. |
| `trend.ts` | `trendWeightSeries()` — EWMA bodyweight, `tw[0] = w[0]`, `tw[i] = round(0.1*w[i] + 0.9*tw[i-1], 2)`, rounded at every step and fed forward. Steps **once per calendar day, not once per weigh-in**, carrying the last known reading across gaps. Also `latestTrend`, `loggedPoints`, and `trendChangeOverDays` (trend-to-trend only, never raw-to-raw). |
| `trend.test.ts` | 205 lines. Restates the formula step by step so the tests do not re-declare it; covers seeding, consecutive days, gap days, duplicate-day last-write-wins, and windows longer than the history. |
| `trend-oracle.test.ts` | 86 lines. The branch's merge gate — replays the 38 offset readings through the engine and locks all 92 days. Its docblock states plainly what it proves (regression guard anchored to one confirmed figure) and what it does not (a byte-for-byte replay of a recorded series, which never existed). |
| `__fixtures__/trend-oracle.ts` | 177 lines, marked `GENERATED — do not edit by hand`. The 38 real weigh-ins with 9.0 kg subtracted from every reading, plus the expected trend series and final value. Exports `ORACLE_OFFSET_KG`, `oracleReadings`, `oracleTrend`, `oracleFinal`. |
| `macros.ts` | `dayTotals()`, `remainingMacros()`, `macroProgress()`. Accumulates at full precision and rounds once at the end (the opposite of the trend, because nothing feeds forward). Leaves remainders negative and ratios above 1 unclamped so an over-target day is visible; a zero target yields 0 rather than `Infinity`. |
| `macros.test.ts` | 86 lines. Covers the round-once behaviour with a 30×0.04 g case, negative remainders, and the zero-target guard. |
| `targets.ts` | `resolveTargetForDate()` — the row with the greatest `validFrom` not after the day. Documents why there is deliberately no `valid_to` column, and why editing targets never rewrites the past. |
| `targets.test.ts` | 53 lines. Effective-dating on the boundary day, the pre-history null, and tie-breaking if two rows ever share a `validFrom`. |
| `goal.ts` | `goalProgress()` drives the "% of the way" ring, clamped 0–1 (unlike the macro rings — past the goal is arrival, not information). `projectTrend()` draws the dashed amber line from a 14-day rate, and returns no ETA when the rate is flat, points away from the goal, or lands more than 365 days out. |
| `goal.test.ts` | 160 lines. Exercises both against a synthetic steady-loss series built with `addDays` — the helper's docblock records that formatting an incrementing day number produced `2026-05-32` and silently emptied the series. |
| `cost.ts` | `computeUsageCost()` prices a model call in USD from a versioned per-million rate table, with cache reads at 0.1× and 5-minute cache writes at 1.25× the input rate. Throws on an unknown model rather than defaulting to zero. `sumUsageCosts()` adds already-priced rows so a month spanning a rate change stays correct. |
| `cost.test.ts` | 133 lines. Asserts the published Sonnet 5 and Haiku 4.5 rates, both cache multipliers, six-decimal rounding, and the throw on an unknown model or rate version. |

### src/app/

| File | Purpose |
|---|---|
| `_layout.tsx` | Root layout. Calls `Sentry.init` with an inline DSN and `sendDefaultPii: false`, wraps the tree in `ClerkProvider` with the secure token cache, loads the five Barlow faces and holds the splash until they land, sets `StatusBar style="light"` once at the root, and renders a headerless `Stack`. Default-exported through `Sentry.wrap`. |
| `sso-callback.tsx` | Landing route for the OAuth redirect. Exists because under Expo Go the deep link reaches the router rather than being swallowed by the auth session, which would otherwise render "Unmatched Route". Waits for Clerk to load, then redirects to `/` or `/sign-in`. |
| `(auth)/_layout.tsx` | Keeps signed-in users out of the auth screens. Checks `isLoaded` before `isSignedIn` so the screen does not flash on every cold start while Clerk restores the session. |
| `(auth)/sign-in.tsx` | The single sign-in screen, traced from `src/design/auth_ui_design.png`. Background photo plus a five-stop gradient, the NutriSA wordmark, Google and Apple buttons driven by `useSSO()`, one zero-height absolutely-positioned error line so a message cannot shift the layout, three feature columns, and the terms text. Logs SSO errors only under `__DEV__`, because a Clerk error object can carry the user's email. |
| `(tabs)/_layout.tsx` | The signed-in shell. Auth guard plus the four tabs via `expo-router/unstable-native-tabs`, using the SDK 54 shape (`Icon` / `Label` imported alongside `NativeTabs`). SF Symbols per tab, `disableTransparentOnScrollEdge` set because the dashboard ends in a static View. |
| `(tabs)/index.tsx` | Dashboard, traced from `src/design/home_screen_ui.png`. Happy state only — the docblock says the other three states are owed and were not sketched because they depend on a query that does not exist yet. Renders `TrendWeightCard`, `MacrosCard`, `WeightTrendCard` inside a `ScrollView` that is deliberately the first child, with a manual `insets.top`. |
| `(tabs)/nutrition.tsx` | Four lines. Renders `<TabPlaceholder title="Nutrition" …>`. |
| `(tabs)/weight.tsx` | Four lines. Renders `<TabPlaceholder title="Weight" …>`. |
| `(tabs)/assistant.tsx` | Four lines. Renders `<TabPlaceholder title="AI Assistant" …>`. |

`TabPlaceholder` itself lives at `src/components/TabPlaceholder.tsx` and also carries the
only sign-out control in the app, parked there until a Settings screen exists.

---

## 5. Standing rules

Every rule below is quoted from where it actually lives. These are treated as binding, not
advisory.

### From AGENTS.md — non-negotiables

> - **Zero arithmetic in the model.** Every computed number comes from the deterministic
>   engine in `packages/engine/`. The model transcribes, classifies and explains; it never
>   calculates.
> - **Four states on every surface**: empty, loading, error, happy. No exceptions.
> - **`user_id` is never accepted from the client.** It is derived server-side from the
>   verified Clerk token and injected through the scoped query layer.
> - **One time authority.** All dates come from `currentLoggingDay()` (Africa/Johannesburg).
>   No stray `new Date()`, no client-supplied day key.
> - **Dark only.** No light theme, no toggle, no `dark:` variants. Tokens are fixed in `plan.md`.
> - **44×44px minimum touch targets**, primary actions within thumb reach.
> - **New user-scoped table?** Add it to the POPIA deletion cascade *and* the export in the
>   same branch. A table that escapes the cascade is a silent legal hole.

### From AGENTS.md — the SDK pin

> **Expo Go from the App Store supports exactly one SDK at a time, and right now that is 54.**
> […] Do not run `npx expo install expo@^<newer> --fix`, and do not "helpfully" bump the SDK.
> […] The SDK moves only when Sriman confirms the Expo Go app on the iPhone reports a new
> number. Verify against the device, never against `docs.expo.dev/versions/latest`.

### From AGENTS.md — navigation

> - **Never** use the JavaScript `Tabs` from `expo-router`, and never
>   `@react-navigation/bottom-tabs`. If you are reaching for either, stop and ask.

### From AGENTS.md — data and privacy boundaries

> - **ImageKit is for stored, displayed images only** […] It is **never** in the label-OCR
>   path. OCR photos are ephemeral: captured, sent to the model, discarded. Never uploaded,
>   never retained.
> - ImageKit private keys stay server-side. Only the public URL endpoint may reach the client.
> - Never log weight, macro values, or request bodies to Sentry.
> - Secrets come from `.env`, are never hard-coded, and are never committed.

### From AGENTS.md — do not, by default

> - Do not `npm install` an Expo package — use `npx expo install` so versions stay aligned.
> - Do not edit `android/` or `ios/` by hand. This project uses Continuous Native Generation […]
> - Do not import from `@react-navigation/*` directly — go through expo-router.
> - Do not use `StyleSheet.create` or inline style objects for layout. NativeWind `className`.
> - Do not use relative imports across features — use the `@/*` and `@/assets/*` aliases.
> - Do not add a runtime dependency to `packages/engine/`. It stays pure TypeScript […]
> - Do not write raw SQL where Drizzle expresses it; do not bypass the scoped query layer.
> - **Never run the app.** […] Do not run `npm start`, `expo start`, `expo run:android`,
>   `expo run:ios`, or any dev server […]
> - **Do not run git.** Never commit, push, or create branches.

### From plan.md — standing rules block

> - [ ] **Zero arithmetic in the model.** Every number comes from the deterministic engine.
> - [ ] **Four states on every surface.** Empty, loading, error, happy. No exceptions.
> - [ ] **`user_id` never accepted from the client.** […]
> - [ ] **One time authority.** All dates flow from `currentLoggingDay()` (Africa/Johannesburg). […]
> - [ ] **44×44px minimum touch targets**, primary actions in thumb reach.
> - [ ] **Colour is semantic, never decoration.**
> - [ ] **New user-scoped table?** Add it to the POPIA deletion cascade *and* the export
>       in the same branch. […]
> - [ ] **Any real bodyweight entering a committed fixture gets −9.0kg first.**
> - [ ] **ImageKit is for stored, displayed images only.** […]
> - [ ] Engine test suite green before merge.

`plan.md` also fixes the design token table (Background `#0D0F14`, Card `#13161E`,
Secondary `#1A1E29`, Primary `#0066FF`, Green `#22C55E`, Red `#FF3B30`, Amber `#F59E0B`,
Protein `#A78BFA`, Carbs `#FCD34D`, Fats `#2DD4BF`) and the type ramp (Barlow Condensed
800 italic for stats and titles, Barlow 400–600 for body).

### From inline comments

`packages/engine/src/cost.ts` — the versioned rate table:

> So: never edit a published version. Add a new one, point `CURRENT_RATE_VERSION`
> at it, and leave the old entries where they are.

`packages/engine/src/trend.ts` — the per-day iteration:

> **This was verified against the real data on 2026-08-12 and it contradicted
> the spec.** […] Per calendar day it is.

`packages/engine/src/time.ts` — why the offset is a constant:

> South Africa is UTC+2 year round and has never observed daylight saving, so
> the offset is a constant rather than an Intl lookup. That is the only reason
> this module can be pure and dependency-free — the moment the app goes
> international […] this becomes a real timezone conversion and every caller has
> to pass a zone.

`.gitignore` — the health-data exclusion:

> \# Real health data — the Supabase export and any local backup of it.
> \# Weight and meal history is personal health data under POPIA. It is read by
> \# the migration script and by the trend oracle test, and it must never reach
> \# git: a commit is public the moment the repo is, and history is forever.

`vitest.config.mts` — why the suite is engine-only:

> The engine is the one thing that can break silently: a wrong trend does not
> throw, it just shows a number that is a lie.

---

## 6. Known inconsistencies

Observations only. Nothing here was fixed, and several are deliberate or already
acknowledged elsewhere in the repo — that is noted where it applies.

### Colour: `app.json` against the fixed token table

1. **`app.json:33` — splash `backgroundColor: "#208AEF"`.** Matches no token. It is neither
   the Background `#0D0F14` nor the Primary `#0066FF`. The first thing a user sees on
   launch is a colour that is not in the design system.
2. **`app.json:16` — `android.adaptiveIcon.backgroundColor: "#E6F4FE"`.** A near-white, in
   an app whose standing rule is "Dark only". Also matches no token.

### Colour: hexes hard-coded in components rather than read from tokens

3. **Declared token values are re-typed as literals in eight places.** Each of these has a
   `tailwind.config.js` token holding the identical value:

   | Hex | Token | Literal occurrences |
   |---|---|---|
   | `#0D0F14` | `ground` | `src/app/_layout.tsx:67`, `src/app/(auth)/_layout.tsx:23`, `src/app/(tabs)/_layout.tsx:28` |
   | `#0066FF` | `primary` | `src/app/(tabs)/_layout.tsx:29`, `src/components/dashboard/WeightTrendCard.tsx:18`, `src/components/dashboard/TrendWeightCard.tsx:60`, `src/components/dashboard/design-fixture.ts:64` |
   | `#22C55E` | `ok` | `src/components/dashboard/WeightTrendCard.tsx:20`, `src/components/dashboard/TrendWeightCard.tsx:22`, `src/components/icons/UiIcons.tsx:15` |
   | `#FF3B30` | `danger` | `src/components/dashboard/TrendWeightCard.tsx:22` |
   | `#F59E0B` | `amber` | `src/components/dashboard/WeightTrendCard.tsx:19` |
   | `#A78BFA` / `#FCD34D` / `#2DD4BF` | `protein` / `carbs` / `fats` | `src/components/dashboard/design-fixture.ts:73,82,91` |
   | `#1A7CFC` | `link` | `src/components/icons/BrandIcons.tsx:40` |

   A large share is forced by the platform rather than chosen: `contentStyle`, `NativeTabs`
   colour props and `react-native-svg` `fill`/`color` props all take values, not
   `className`. The rule as written has no escape hatch for those, and no shared constants
   module exists to give them one.

4. **Nine colours are in the code that are in no token table.** These entered the system
   without passing through `plan.md`:

   | Hex | Where | Note |
   |---|---|---|
   | `#8A8F98` | `(tabs)/_layout.tsx:30`, `TabPlaceholder.tsx:19`, `TrendWeightCard.tsx:48,68`, `Card.tsx:28`, `WeightTrendCard.tsx:16`, `UiIcons.tsx:38` | The de-facto secondary text grey. Seven occurrences, no token. |
   | `#6E7686` | `WeightTrendCard.tsx:17` | Raw-weight scatter dots. |
   | `#1E222B` | `(tabs)/_layout.tsx:31` | Tab bar hairline. |
   | `#20242D` | `Card.tsx:18` | Card border. |
   | `#2A2F3B` | `WeightTrendCard.tsx:66` | Button border. |
   | `#252A35` | `ProgressRing.tsx:30` | Ring track. |
   | `#B07CF6` | `FeatureIcons.tsx:14` | Near-miss of Protein `#A78BFA`. |
   | `#5FE3C6` | `FeatureIcons.tsx:15` | Near-miss of Fats `#2DD4BF`. |
   | `#F9B81A` | `FeatureIcons.tsx:16` | Near-miss of Amber `#F59E0B`. |

   The last three are the notable ones: three macro/warning tokens exist, and the sign-in
   feature icons use three visibly similar but different colours beside them.

5. **Genuinely external hexes, listed for completeness.** `src/components/icons/BrandIcons.tsx`
   carries Google's four brand colours (`#EA4335`, `#4285F4`, `#FBBC05`, `#34A853`) and
   `#000000` for the Apple mark and the button spinner. These are third-party brand assets
   and should not be tokenised.
6. **`src/app/(auth)/sign-in.tsx:74-79` uses `rgba(9,11,16,…)` for its five gradient stops** —
   `#090B10`, close to but not the same as the `#0D0F14` ground it sits against.

### Documentation that contradicts other documentation

7. **AGENTS.md: "Native Tabs under Expo Go on SDK 54 is **unverified** — see the open
   question in `plan.md`."** That open question is closed in `plan.md`: *"Do Native Tabs
   work in Expo Go on SDK 54? Yes — verified on the iPhone 15, 2026-08-10."* AGENTS.md is
   stale on its own cross-reference.
8. **AGENTS.md: "Shared zod schemas live in `packages/shared/`."** That directory does not
   exist. `plan.md` acknowledges this deliberately — *"`packages/shared/` **not created**
   […] Creating it empty now would just be a directory"* — so the two files disagree about
   whether it is a present fact or a future one.
9. **`round.ts` and `trend-oracle.test.ts` disagree about whether an oracle exists.**
   `round.ts` states: *"The trend series is checked byte-for-byte against 38 rows produced
   by the previous implementation."* `trend-oracle.test.ts` states the opposite in its own
   docblock: *"The plan expected to assert the trend 'byte-for-byte' against the old app's
   stored values. **Those do not exist.**"* The test is the file that was corrected;
   `round.ts`'s docblock still describes the abandoned premise.
10. **`plan.md` Phase 11 says the tables do not exist.** *"**still open: none of these
    tables exist yet.** The job currently deletes the only user-scoped table there is
    (`users`)."* Phase 1 of the same document says all eleven are live: *"All 11 tables are
    live in Neon as of 2026-08-12 […] 10 cascading FKs point at `users`."* One of the two
    passages was not updated when the migration landed.
11. **Water tracking is recorded as cut in three places and still listed in a fourth.**
    The Phase 11 cascade line still enumerates `water_logs` among the tables to delete.
    The deferred backlog explains this is intentional (the empty table remains in Neon), so
    the inconsistency is in emphasis rather than in fact.
12. **`plan.md`'s status header says Phase 3 shipped** — *"**Phase 3 auth shipped early and
    verified on device**"* — while the Phase 3 checklist has four unticked items, including
    the React Query provider, the shared `<Empty>/<Loading>/<ErrorState>` components, and
    the 44×44 verification pass.

### Naming drift between the plan and the code

13. **The token table names differ from the implemented token names.** `plan.md` calls them
    Background, Green and Red; `tailwind.config.js` implements `ground`, `ok` and `danger`,
    and adds a `link` `#1A7CFC` that is not in the table. `plan.md` Phase 3 documents both
    deviations explicitly, so this is recorded drift, not silent drift.
14. **`macros.ts` type comment describes keys the type does not have.** `LoggedItem` is a
    bare alias of `Macros` (`kcal/protein/carbs/fat`), but its docblock says *"Keys match
    the `items` jsonb written by the migration (`{name, qty, kcal, pro, carb, fat}`)"*. The
    phrase "once mapped" carries the whole distinction, and the mapping layer does not
    exist yet.

### Structural

15. **`packages/engine/` has no `package.json`.** AGENTS.md says *"Do not add a runtime
    dependency to `packages/engine/`"*, which reads as though it were a real package with a
    manifest to add one to. It is a source directory resolved through the `@engine` alias in
    `tsconfig.json`; nothing mechanically enforces the zero-dependency rule.
16. **`@engine` has no consumers.** Nothing in `src/` or `server/` imports it. `plan.md`
    flags the Metro half as *"**unverified** on device because nothing imports it yet"* —
    so the engine is fully tested but has never been resolved by the bundler.
17. **`expo-dev-client` is a dependency** (`package.json:17`) while the project is pinned to
    Expo Go and the dev client is scheduled for Phase 12, behind the $99 Apple account.
18. **`android/` exists on disk but is gitignored** (`.gitignore:51`), and AGENTS.md forbids
    editing it by hand under CNG. It is generated output that survived locally; `ios/` is
    ignored too and is absent.
19. **The Sentry DSN is inline** at `src/app/_layout.tsx:23` rather than coming from `.env`.
    A DSN is a public write-only key rather than a secret, so this does not breach the rule
    as written — but it is the one hard-coded credential-shaped literal in the app, and it
    sits directly under the rule that says secrets come from `.env`.
20. **`package.json` ships `start`, `android` and `ios` scripts** (`expo start`,
    `expo run:android`, `expo run:ios`) that AGENTS.md forbids an agent from running. Not a
    contradiction — they are Sriman's to run — but the prohibition lives only in prose.

### Dates and time

21. **The one-time-authority rule currently holds, with two uses worth naming.** A sweep for
    `new Date(` and `toISOString` across the repo (excluding `node_modules/`) returns:

    - `packages/engine/src/time.ts` — the default parameter of `currentLoggingDay()` and
      internal arithmetic. `toISOString().slice(0, 10)` appears at lines 65 and 86, both
      against a value already pinned to UTC midnight, so it is a formatter there and not a
      timezone conversion.
    - `server/inngest/functions.ts:48` — `updatedAt: new Date()`. A row timestamp, not a
      calendar day key, so outside what the rule governs.
    - `scripts/csv.ts:111` — parses a timestamp out of the Supabase export. Migration-time,
      not app-time.
    - `src/components/dashboard/design-fixture.ts:103` — a comment, not a call, stating that
      the real chart will key off `currentLoggingDay()` *"never a `new Date()` in the
      component"*.

    Nothing in `src/app/` calls `new Date()` at all. Note that no UI consumes the engine
    yet, so the rule has not yet been tested by a real consumer.
