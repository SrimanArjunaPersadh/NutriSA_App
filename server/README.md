# server/

The API. Locally it runs behind ngrok (`npm run server`, below); in production
it is one Vercel function in `cle1`, built by `npm run build:server` (see
"Deploying" at the end). Two unrelated jobs live here.

**Reads** (branch `api-scope-and-reads`) — the dashboard's data, behind Clerk
session verification:

```
Expo app ──Bearer <Clerk session token>──▶ requireUser ──▶ UserScope
                                                             │
                                            server/data/scoped.ts  (adds WHERE user_id = …)
                                                             │
                                          Neon ──rows──▶ packages/engine ──numbers──▶ JSON
```

| Route | Returns |
|---|---|
| `GET /api/day/:date` | One day: targets, consumed, remaining, ring progress, meals, 7-day average intake, the streak, and the logged days behind the week strip. `:date` may be `today`. |
| `GET /api/weight-logs?days=30` | The trend series, latest point, 7- and 30-day change, goal weight, goal progress, projection. |
| `GET /api/targets` | The macro targets in force today, and every set on record. |
| `GET /api/profile` | The goal weight, or `null`. The only profile field v1 holds. |

Two fields on the day response are **as of today, not as of `:date`**: `streak`
and `loggedDays`. The flame in the dashboard header answers "have I logged
today", and that does not change because the user scrolled the week strip back
to last Tuesday.

`days` narrows what is **drawn**, never what is **computed** — the trend carries
its whole history forward, so it is always calculated over every weigh-in and
sliced afterwards. See `data/weight.ts`.

**Writes** (branch `api-writes`) — same session verification, plus a per-user
rate limit the reads do not carry.

| Route | Does | Answers |
|---|---|---|
| `POST /api/meal-logs` | Logs a meal | `201` written · `200` this id was already written |
| `PATCH /api/meal-logs/:id` | Changes a logged meal: name, time, day, or its lines and header together | `200` · `404` not this user's |
| `DELETE /api/meal-logs/:id` | Removes one | `200` always, with `deleted` |
| `DELETE /api/weight-logs/:id` | Removes a weigh-in | `200` always, with `deleted` |
| `POST /api/weight-logs` | Records a weigh-in | `201` new day · `200` that day's was replaced |
| `POST /api/targets` | Sets targets from a day. Bounded: 500–10,000 kcal, 0–1,000 g per macro | `201` new day · `200` that day's were replaced |
| `PUT /api/profile` | Sets or clears (`null`) the goal weight, 30–300 kg. Any other field in the body is dropped | `200` always |

**Foods and saved meals** (branch `food-logger`) — `routes/foods.ts`, mounted
before the writes router so its reads are not metered by the write limit. The
writes in it carry the same rate limit and the same client-minted id contract.

| Route | Does |
|---|---|
| `GET /api/foods/search?q=` | Your logged foods first (up to 5), then the `foods` table, then Open Food Facts (SA products) |
| `GET /api/foods/search/local?q=` | The same without Open Food Facts: the fast half the logger draws first |
| `GET /api/foods/recent?slot=` | Recently logged foods with last time's amount; with `slot`, the foods usual at that meal first |
| `GET /api/foods/barcode/:code` | Local `foods` row first, else Open Food Facts, cached as a global row |
| `POST /api/foods` | A food of the user's own: `source='manual'`, or `'label_scan'` when the body says so (only those two) |
| `GET /api/saved-meals` | The saved meal library (`custom_meals`) |
| `POST /api/saved-meals` | Saves a meal |
| `PATCH /api/saved-meals/:id` | Renames or re-categorises it, or rewrites its lines and header together |
| `DELETE /api/saved-meals/:id` | Removes it; meals logged from it stay logged |

**The label reader** (branch `label-ocr`, Phase 8) — `routes/label.ts`, mounted
before the writes router like the food routes. Metered twice: the write limit,
then 30 reads per user per hour, because a read costs money rather than a row.

| Route | Does | Answers |
|---|---|---|
| `POST /api/label-reads` | Sends a label photo (`{ image: <base64 JPEG> }`, about 1.9 MB of base64 at most) to `claude-haiku-5-5` and returns what it read. **Synchronous**, 15 s, no retries. Writes one `ai_usage` row (`feature='ocr'`) for every answered call; the photo is never stored. Since Phase 9 it passes the AI gate first (consent, the month's allowance) | `200` a `LabelReading` · `502` / `504` `upstream-failed` · `403` `ai-consent-required` · `429` the hourly cap or `ai-allowance-used` · `503` the ledger could not be read · `499` the user cancelled |

**The assistant** (branch `ai-chat`, Phase 9) — `routes/chat.ts`, mounted before
the writes router. Reading a chat is not metered as a write; the routes that change
something carry the write limit, and a turn also carries 60 per user per hour.

| Route | Does | Answers |
|---|---|---|
| `POST /api/chat/turns` | Sends one message (`{ conversationId, messageId, text }`, both ids client-minted v7, text ≤ 2,000 chars). Passes the AI gate, stores the message, then streams the reply as server-sent events (`ChatEvent`): `status` per lookup, `text` as it is written, a `proposal` card, then `done` or `error`. Sonnet 5.5 at low effort, Haiku 5.5 past $4 or when Sonnet is down. 45 s, at most 4 lookups. One `ai_usage` row (`feature='chat'`) per model call, cut-off calls included | `200` the stream · `400` · `403` `ai-consent-required` · `409` an id that is someone else's · `429` the hourly cap or `ai-allowance-used` · `503` the ledger could not be read |
| `GET /api/chat/conversations` | The chat list, newest first | `200` |
| `GET /api/chat/conversations/:id` | One chat, oldest message first; each card says whether it was confirmed (a meal log with its id exists) | `200` · `404` not this user's |
| `DELETE /api/chat/conversations/:id` | "Delete this chat" | `200` with `deleted` |
| `DELETE /api/chat/conversations` | "Delete all chats". The ledger stays | `200` with the count |
| `POST /api/chat/messages/:id/dismiss` | Dismisses a card. Confirming one is the ordinary `POST /api/meal-logs` with the card's body | `200` · `404` |
| `GET /api/ai/consent` · `PUT /api/ai/consent` | Reads, grants (`{ granted: true }`) or withdraws AI consent | `200` |
| `GET /api/ai/allowance` | This SAST month's spend, the $5 budget, the rung, and when it resets | `200` |

The assistant cannot write: its tools only read, and a card is a `POST /meal-logs` body
the user confirms. Anthropic receives the messages, the tool results and this server's IP:
no user id, no email, no database id. Food references are per-turn (`f1`, `m1`).

Anthropic sees the photo, a fixed prompt and this server's IP: no user id, no token, no
phone IP. The SDK's own tracing is off and its log level pinned (`ai/config.ts`), so neither
can carry the photo anywhere else. `ANTHROPIC_API_KEY`
is optional at boot; without it the route answers `502` and the form falls back to typing.

Open Food Facts sees the search text and barcodes, the server's IP and
`OFF_USER_AGENT`; never a user id, token or the phone's IP (the phone does load
OFF's product photos directly). `food/off.ts` never logs the query text.

**Every write carries a client-minted UUIDv7, and that is the only thing making
these routes safe to retry.** A logged meal has no natural key — same food, same
day, twice is a real thing people do — so the server cannot tell a duplicate
from a second helping. The client can, and says so by reusing the id or minting
a new one.

```
retry with the same id  ──▶  ON CONFLICT (id) DO NOTHING  ──▶  200 created:false
a genuine second meal   ──▶  a new id, no conflict        ──▶  201 created:true
somebody else's id      ──▶  no row this user can see     ──▶  409 conflict
```

⚠️ **No write is wrapped in `withRetry`.** A retried `POST` whose first attempt
succeeded before the response was lost would log the meal twice, and
`ON CONFLICT (id)` would not catch it — the ids match across attempts only when
the *client* is the one retrying. `tests/write-safety.test.ts` fails if a
`withRetry` ever appears beside a mutation.

`date` is optional on every write and means today, decided by
`currentLoggingDay()` — never by the phone. Sending one is back-dating: allowed,
bounded to the window the app can actually display, and never able to touch
`created_at`, which always records the real instant of the write.

**Sync** — Clerk fires a user lifecycle event → this app verifies the signature
and enqueues an Inngest event → an Inngest function writes the change into Neon.

```
Clerk  ──POST /api/webhooks/clerk──▶  Hono  ──inngest.send()──▶  Inngest dev server
                                                                        │
                                                        POST /api/inngest
                                                                        ▼
                                              sync-clerk-user-created ─┐
                                              sync-clerk-user-updated ─┤ Drizzle
                                              sync-clerk-user-deleted ─┘
                                                                        ▼
                                                                      Neon
```

The webhook route only verifies and enqueues. The database write happens in the
background job so a slow or failing write can never make Clerk's delivery time
out, and so Svix/Inngest retries land on an idempotent write.

| Clerk event | Job | Effect |
|---|---|---|
| `user.created` | `sync-clerk-user-created` | upsert the row |
| `user.updated` | `sync-clerk-user-updated` | upsert the row (Clerk sends the whole user, not a diff) |
| `user.deleted` | `sync-clerk-user-deleted` | delete the row — the POPIA cascade |
| daily, 03:00 SAST | `delete-stale-chats` | delete chats untouched for 12 months (Phase 9, Q17) |

Any other subscribed event is verified and acknowledged with 200, never acted
on. A green "Succeeded" in Clerk therefore means *accepted*, not *applied*.

## Files

| File | Purpose |
|---|---|
| `env.ts` | Loads the root `.env`, asserts required vars at boot |
| `auth/user-scope.ts` | Verifies the Clerk session token; mints the `UserScope`. **The only place a user id enters the system.** |
| `data/scoped.ts` | The scoped query layer. **The only module allowed to import `db`.** |
| `data/day.ts` | Assembles `GET /day/:date` from rows + engine calls |
| `data/weight.ts` | Assembles `GET /weight-logs`, and records a weigh-in |
| `data/meals.ts` | Writes and deletes a logged meal |
| `data/targets.ts` | Reads and sets the effective-dated macro targets |
| `data/profile.ts` | Reads and sets the goal weight (one `profiles` row per user) |
| `data/foods.ts` | Food search (local half and full), recents by meal, barcode lookup, creating a food |
| `data/saved-meals.ts` | Lists, creates, patches and deletes saved meals |
| `data/ai-usage.ts` | Writes one priced `ai_usage` ledger row per model call; reads the month's allowance |
| `data/chat.ts` | Conversations and messages: list, read with confirmed cards, history, store, delete, dismiss |
| `ai/config.ts` | Model ids as constants, the reader's and the chat's limits, the Anthropic client |
| `ai/label-reader.ts` | The label reader's model call: prompt, JSON schema, outcomes, bounds check |
| `ai/gate.ts` | Consent and the month's allowance before any model call; fails closed |
| `ai/chat-turn.ts` | One assistant turn: streaming, the lookup loop, deadline, Stop, fallback, spend |
| `ai/chat-tools.ts` | The six reads and the meal card, with per-turn food references |
| `ai/chat-prompt.ts` | The coach's instructions, SADAG's numbers, the date line |
| `ai/number-check.ts` | Finds numbers in a reply that no lookup or user message supplied |
| `db/uuidv7.ts` | Mints a card's meal-log id ahead of the client's write |
| `food/rows.ts` | Pure mappings: `foods` rows and Open Food Facts products to `Food`, logged lines to recents |
| `food/off.ts` | The Open Food Facts client: timeouts, a per-minute budget, a 10-minute search cache |
| `routes/foods.ts` | The food and saved-meal routes |
| `routes/label.ts` | `POST /label-reads` |
| `routes/chat.ts` | The assistant, AI consent and the allowance |
| `db/errors.ts` | Tells a unique violation (409) from a real failure (500) |
| `http/limits.ts` | Per-user write cap, hourly label-read and chat-turn caps; counts unauthenticated volume without storing an IP |
| `routes/reads.ts` | The three read routes, behind `requireUser` |
| `routes/writes.ts` | The meal, weight and target writes, behind `requireUser` + the rate limit |
| `observability/sentry.ts` | Sentry init, `sendDefaultPii: false`, scrubbing; traces the label read and nothing else |
| `db/schema.ts` | All 11 tables, keyed by Clerk id |
| `db/index.ts` | Drizzle client over the Neon HTTP driver |
| `db/retry.ts` | Retries transient `fetch failed` transport errors |
| `inngest/client.ts` | Inngest client + the three `clerk/user.*` event types (zod) |
| `inngest/functions.ts` | The three sync jobs, plus the shared `upsertUser` helper |
| `app.ts` | Hono app: `/`, `/health`, `/api/*`, `/api/webhooks/clerk`, `/api/inngest`. No listener; Vercel serves its default export |
| `index.ts` | The local listener around `app.ts` (`npm run server`). Never deployed |

`client.ts` declares *what events exist*; `functions.ts` declares *what happens
when they fire*; `app.ts` is only the HTTP edge. Nothing in `app.ts` touches
the database.

## The isolation rule, and what enforces it

`user_id` is never accepted from the client. It comes from `sub` on a verified
Clerk token and reaches Postgres only through `selectOwned`, which writes the
`WHERE user_id = …` itself.

Three things keep that true as the code grows, and none of them is a code review:

- **`UserScope` cannot be constructed** outside `auth/user-scope.ts` — it carries
  a property keyed by a module-private symbol, so `{ userId: body.userId } as
  UserScope` does not compile.
- **`tests/scoped-access.test.ts`** fails if any file outside `data/scoped.ts`
  imports `db`, if a route reads a user id from client input, or if a function in
  `data/` does not take `scope: UserScope` first. Runs in `npm test`.
- **`tests/security/user-isolation.test.ts`** proves the outcome against real
  Postgres: user A's requests return only A's rows, and an unauthenticated
  request is refused. Needs a Neon branch — `npm run test:security`.
- **`tests/security/write-isolation.test.ts`** proves the write half against the
  same branch: a `user_id` in the body changes nothing, an id belonging to
  someone else is refused without admitting whose it is, deleting another user's
  meal deletes nothing, and one user's weigh-in never overwrites another's on
  the same day.

## First run

1. Fill in `DATABASE_URL`, `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SIGNING_SECRET`
   (see `.env.example`). `CLERK_SECRET_KEY` is what verifies session tokens —
   without it the server refuses to boot rather than 401 every read.
2. Apply the schema: `npm run db:migrate`
3. Three terminals — **all three, every time**:

   ```bash
   npm run server        # http://localhost:3000
   npm run inngest:dev   # http://localhost:8288, then Apps → Sync
   ngrok http 3000 --url https://<your-permanent-domain>.ngrok-free.dev
   ```

4. Clerk Dashboard → **Webhooks** → add endpoint
   `https://<your-permanent-domain>.ngrok-free.dev/api/webhooks/clerk`,
   subscribe to **`user.created`**, **`user.updated`** and **`user.deleted`**,
   then copy that endpoint's **Signing Secret** into
   `CLERK_WEBHOOK_SIGNING_SECRET` and restart `npm run server`.
5. Sign up a throwaway user **on the phone** — see the web caveat below. Watch
   the run at http://localhost:8288, then confirm the row: `npm run db:studio`.

## Notes

- **Locally**, `INNGEST_DEV` puts the SDK in dev mode against `127.0.0.1:8288`
  and the two Inngest keys stay unset. inngest v4 defaults to cloud mode, so it
  is `INNGEST_DEV`, not the missing keys, that keeps a local run local.
  `GET /api/inngest` reports `"mode":"dev"` and `"function_count":3`.
- `INNGEST_DEV` is pinned to an explicit `http://127.0.0.1:8288` rather than `1`.
  The bare form resolves `localhost`, which fails to connect on Windows and
  surfaces only as a red "Not Synced" with `Failed to register; fetch failed`.
- **ngrok must be running or nothing arrives.** Sign-in still works without it,
  because the app talks to Clerk directly, which makes the tunnel easy to forget
  and the failure easy to misread. Check
  `https://<your-domain>.ngrok-free.dev/health` returns `{"ok":true}` before
  testing. Missed deliveries are not lost: Clerk retries, and
  Webhooks → your endpoint → the delivery log has a Resend button.
- Start ngrok with `--url`. Without it you get a random address that Clerk is not
  configured to post to.
- **Clerk sign-in cannot work on the web bundle**, only in Expo Go on the phone.
  The browser flow needs a `clerk-captcha` DOM element that React Native never
  renders, so it fails with `captcha_invalid` and no user is ever created.
- The Svix `svix-id` header is passed as the Inngest event id, so a redelivered
  webhook does not produce a second run.
- Neon's free tier suspends when idle. The first job after a quiet spell can take
  ~90s while the compute wakes; `retries: 3` covers it. Don't read that as failure.
- The same suspend/resume shows up on the read routes as `TypeError: fetch
  failed` from the Neon driver. `db/retry.ts` retries transport errors — never
  Postgres errors — so a waking compute does not become a 500 on the dashboard.
  A `select …: connection failed — retry 1/3` line in the log is that working,
  not breaking.
- `users` is user-scoped: any new column here must also be covered by the
  Phase 11 POPIA deletion cascade and the data export. Any new user-scoped
  **table** must be deleted in `sync-clerk-user-deleted` in the same branch that
  creates it.

## Deploying

```
npm run build:server   esbuild server/app.ts -> dist-server/index.mjs
                       (@engine / @shared inlined; npm packages stay external)
vercel.json            framework "hono", output dist-server, region cle1
.vercelignore          allowlist: only server/, packages/ and the package and
                       ts configs upload. Never .env, .expo/ or /data/
```

Vercel's own TypeScript build cannot resolve the `@engine` / `@shared` aliases,
which is why the bundle exists. Full reasoning, with sources:
`docs/research/vercel-hono-deploy.md`.

Production environment variables: `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SIGNING_SECRET` (the **Vercel** endpoint's secret, not ngrok's),
`ANTHROPIC_API_KEY`, `OFF_USER_AGENT`, `SENTRY_DSN`,
`SENTRY_ENVIRONMENT=production`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`.
**Never `INNGEST_DEV`**, and never `INNGEST_STREAMING` (the Hono adapter throws).
