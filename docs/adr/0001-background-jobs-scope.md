# Background jobs read user data through `scopeForJob`

Every read of a user's rows goes through a `UserScope`, and until Phase 10 the only maker
was the Clerk middleware, from a verified session token. The weekly report runs from an
Inngest cron on Sunday evening with no session, yet has to read one user's logs, weigh-ins
and targets. Decided 2026-10-29 (Phase 10 grill, Q23): a second, job-only maker,
`scopeForJob(clerkId)`, which mints a scope only after finding that id's `users` row, and
which a static test lets nothing outside `server/inngest/` import. The job then reuses the
same scoped readers as the routes, with the same ownership filter.

## Considered options

- **Widen the existing exception** (`server/inngest/functions.ts` may import `db`) and
  query directly. Rejected: a second copy of every reader, with nothing enforcing that a
  job reads one user's rows. That exception stays for what it was granted for, writing
  the `users` mirror row from the Clerk webhook, and for the retention cleanups that
  delete across users by age.

## Consequences

- The rule "`user_id` is never accepted from the client" still holds: the id comes from
  the event the cron itself built from the `users` table, never from a request.
- A scope is no longer proof of a live session, only of a known user. Anything that
  needs a session (a route) still gets its scope from the middleware.
