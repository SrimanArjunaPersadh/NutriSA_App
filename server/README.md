# server/

Dev-only API. Two unrelated jobs live here.

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

Two fields on the day response are **as of today, not as of `:date`**: `streak`
and `loggedDays`. The flame in the dashboard header answers "have I logged
today", and that does not change because the user scrolled the week strip back
to last Tuesday.

`days` narrows what is **drawn**, never what is **computed** — the trend carries
its whole history forward, so it is always calculated over every weigh-in and
sliced afterwards. See `data/weight.ts`.

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

Any other subscribed event is verified and acknowledged with 200, never acted
on. A green "Succeeded" in Clerk therefore means *accepted*, not *applied*.

## Files

| File | Purpose |
|---|---|
| `env.ts` | Loads the root `.env`, asserts required vars at boot |
| `auth/user-scope.ts` | Verifies the Clerk session token; mints the `UserScope`. **The only place a user id enters the system.** |
| `data/scoped.ts` | The scoped query layer. **The only module allowed to import `db`.** |
| `data/day.ts` | Assembles `GET /day/:date` from rows + engine calls |
| `data/weight.ts` | Assembles `GET /weight-logs` from rows + engine calls |
| `routes/reads.ts` | Both read routes, mounted behind `requireUser` |
| `observability/sentry.ts` | Sentry init, `sendDefaultPii: false`, scrubbing |
| `db/schema.ts` | All 11 tables, keyed by Clerk id |
| `db/index.ts` | Drizzle client over the Neon HTTP driver |
| `db/retry.ts` | Retries transient `fetch failed` transport errors |
| `inngest/client.ts` | Inngest client + the three `clerk/user.*` event types (zod) |
| `inngest/functions.ts` | The three sync jobs, plus the shared `upsertUser` helper |
| `index.ts` | Hono app: `/`, `/health`, `/api/*`, `/api/webhooks/clerk`, `/api/inngest` |

`client.ts` declares *what events exist*; `functions.ts` declares *what happens
when they fire*; `index.ts` is only the HTTP edge. Nothing in `index.ts` touches
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

- **Dev only.** `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are deliberately
  unset, which puts the SDK in dev mode against `127.0.0.1:8288`.
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
