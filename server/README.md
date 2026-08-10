# server/

Dev-only API. Clerk fires `user.created` → this app verifies the signature and
enqueues an Inngest event → an Inngest function upserts the user into Neon.

```
Clerk  ──POST /api/webhooks/clerk──▶  Hono  ──inngest.send()──▶  Inngest dev server
                                                                        │
                                                        POST /api/inngest
                                                                        ▼
                                                       sync-clerk-user-created
                                                                        │
                                                                  Drizzle upsert
                                                                        ▼
                                                                      Neon
```

The webhook route only verifies and enqueues. The database write happens in the
background job so a slow or failing write can never make Clerk's delivery time
out, and so Svix/Inngest retries land on an idempotent upsert.

## Files

| File | Purpose |
|---|---|
| `env.ts` | Loads the root `.env`, asserts required vars at boot |
| `db/schema.ts` | `users` table, keyed by Clerk id |
| `db/index.ts` | Drizzle client over the Neon HTTP driver |
| `inngest/client.ts` | Inngest client + the `clerk/user.created` event type (zod) |
| `inngest/functions.ts` | `sync-clerk-user-created` — the upsert job |
| `index.ts` | Hono app: `/health`, `/api/webhooks/clerk`, `/api/inngest` |

## First run

1. Fill in `DATABASE_URL` and `CLERK_WEBHOOK_SIGNING_SECRET` (see `.env.example`).
2. Apply the schema: `npm run db:migrate`
3. Three terminals:

   ```bash
   npm run server        # http://localhost:3000
   npm run inngest:dev   # http://localhost:8288, discovers /api/inngest
   ngrok http 3000
   ```

4. Clerk Dashboard → **Webhooks** → add endpoint
   `https://<your-ngrok-subdomain>.ngrok-free.app/api/webhooks/clerk`,
   subscribe to **`user.created`**, then copy that endpoint's **Signing Secret**
   into `CLERK_WEBHOOK_SIGNING_SECRET` and restart `npm run server`.
5. Sign up a throwaway user. Watch the run at http://localhost:8288, then
   confirm the row: `npm run db:studio`.

## Notes

- **Dev only.** `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are deliberately
  unset, which puts the SDK in dev mode against `127.0.0.1:8288`.
  `GET /api/inngest` reports `"mode":"dev"`.
- The Svix `svix-id` header is passed as the Inngest event id, so a redelivered
  webhook does not produce a second run.
- `users` is user-scoped: any new column here must also be covered by the
  Phase 11 POPIA deletion cascade and the data export.
