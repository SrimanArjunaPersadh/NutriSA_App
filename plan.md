# NutriSA — Build Plan

Living checklist. Tick items as they land; don't delete them — a completed history is
useful. Full reasoning behind every decision lives in the spec:
`~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md`

**Workflow:** one feature per branch, one fresh session per branch, all git run manually.

**Status (2026-08-11):** Phase 0 all but done · Phase 1 started (deps + Clerk-mirror
schema **applied to Neon**; engine not begun) · **Phase 3 auth shipped early and verified
on device** · **Clerk → Neon sync live: `user.created` / `user.updated` / `user.deleted`
via Inngest in dev mode, verified end to end on real accounts** · Phase 11 is part-ticked
as a result, but its cascade only covers `users` because no other user-scoped table exists
yet · Phases 2, 4–12 otherwise not started · v1.1 deferred

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
- [ ] Add `MIGRATION_TARGET_USER_ID` to `.env` (never hard-code, never commit) —
      **un-ticked 2026-08-11: the line is still not in `.env`.** It was ticked on trust
      and never was true. Phase 1's migration cannot run without it
- [x] Create Neon project, add `DATABASE_URL` to `.env`
- [ ] Confirm current macro targets — assumed **2300 kcal / 167P / 195C / 60F**
      *(still open — see Open questions; blocks the Phase 1 migration)*
- [ ] Set **$10/month hard spend cap** in the Anthropic Console
- [x] Verify `.env` is gitignored — `.gitignore:12`, re-confirmed 2026-08-11
- [ ] Export the Supabase data (all 5 tables) and keep a local backup before touching anything

> ⚠️ **`.env` re-read 2026-08-11, later the same day.** `DATABASE_URL` and
> `CLERK_WEBHOOK_SIGNING_SECRET` are now filled in and both are proven working — the
> migration applied and real Clerk deliveries verified against the signature. Still
> **empty**: `OPENAI_API_KEY`, `UNSPLASH_*`, `IMAGEKIT_*`. Still **absent entirely**:
> `MIGRATION_TARGET_USER_ID`, which is why the tick above was removed.
> **Phase 1's migration cannot run until that line exists.**

---

## Phase 1 — `engine-and-migration`

**Goal:** a proven deterministic engine and 60 days of history living in Neon, verified
byte-for-byte against the oracle. No auth, no server, no UI, no spend.

### Housekeeping
- [x] Investigate and remove the stray `src/node_modules/` — gone as of the SDK 57 upgrade
- [x] Install Drizzle, `drizzle-kit`, `@neondatabase/serverless`, `tsx` —
      `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `@neondatabase/serverless` 1.1.0,
      `tsx` 4.23.11. `drizzle.config.ts` points at `server/db/schema.ts`
- [ ] **Install Vitest** — still absent from `package.json`. The `npx vitest` merge gate
      below currently has nothing to run, so "engine suite green" cannot be satisfied
- [ ] Create `packages/engine/` (pure TS, zero runtime deps) and `packages/shared/`
      *(neither directory exists yet)*
- [ ] Wire path aliases in `tsconfig.json` so client and server can both import them
      *(`tsconfig.json` currently defines only `@/*` and `@/assets/*`)*

### Schema — `server/db/schema.ts`

Only one table exists so far, and it wasn't on this list: it arrived with the Clerk
webhook work rather than the migration work. Every table below is still unwritten.

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

- [x] Install Expo Go on the iPhone 15, confirm `expo start` connects over LAN —
      sign-in exercised on the device 2026-08-10/11
- [x] Barlow + Barlow Condensed via `expo-font` — all five faces loaded in
      `src/app/_layout.tsx`, splash held until they land
- [x] Theme module with the fixed token table — dark-first, **no light theme, no toggle**.
      Lives in `tailwind.config.js` as NativeWind colour tokens rather than a separate
      module. Two deliberate deviations from the table above: `ok`/`danger` are the token
      names for Green/Red, and a `link` blue `#1A7CFC` was added for inline text links
- [ ] Four bottom tabs: Dashboard, Nutrition, Weight, Library
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
| Device-timezone support | Going international — v2 migration, clear trigger |
| ~~Apple Developer Program + EAS dev client~~ | *Promoted to **Phase 12** — it's a real v1 requirement, not a cut. Deferred on cost, not scope.* |

---

## Open questions

- [ ] Trend semantics across the 37-day gap — rows or calendar days? *(blocks Phase 1)*
- [ ] Trend seed — is `tw[0] = w[0]`? *(blocks Phase 1)*
- [ ] Confirm targets 2300/167/195/60 *(blocks Phase 1 migration)*
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
- [ ] **Which SDK does App Store Expo Go support?** A moving external dependency that gates
      the entire free runway. Re-check before any SDK bump; verify on the device.
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
