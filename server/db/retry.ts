/**
 * Retries a statement through transient network failures.
 *
 * ## This is not defensive padding; it is the observed behaviour of the driver
 *
 * Neon's serverless driver reaches the database over `fetch`, and that
 * connection drops often enough to matter. Three separate occasions, all on
 * this project:
 *
 * - a 38-row insert failed during the Supabase migration while a 4-row one
 *   immediately after succeeded, with identical data
 * - the `profiles` seed failed on its first two statements seconds after a dry
 *   run against the same URL had gone through
 * - the read routes returned 500 on a *different* one of five requests on each
 *   of two consecutive smoke runs
 *
 * The third is why this moved out of `scripts/` and into the query path. A
 * script that dies can be re-run by the person watching it. A dashboard that
 * 500s on a random third of loads teaches the user the app is broken, and the
 * error state — which exists, and is correct — would be firing for something
 * that is not an error.
 *
 * ## Only transport errors, and only where a retry is safe
 *
 * A Postgres error carries a `code` (a constraint violation, a bad type), and
 * retrying one of those just produces the same failure more slowly while hiding
 * the real problem. Those are rethrown on the first attempt.
 *
 * Every current caller is either a `SELECT` or a script the operator is
 * watching, so a repeated attempt cannot double-write. **When the Phase 2 write
 * routes land, this must not simply be wrapped around them**: a retried
 * `POST /meal-logs` whose first attempt actually succeeded before the response
 * was lost would log the meal twice. The plan already answers that — writes
 * carry a client-minted UUIDv7 and insert `ON CONFLICT (id) DO NOTHING` — but
 * the safety comes from that idempotency, not from this function.
 */
export async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 4
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error: unknown) {
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause
      const isPostgresError = Boolean(cause?.code)
      if (isPostgresError || attempt === MAX_ATTEMPTS) throw error

      const waitMs = 400 * 2 ** (attempt - 1)
      console.log(
        `  ${label}: ${cause?.message ?? "connection failed"} — ` +
          `retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs}ms`,
      )
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}
