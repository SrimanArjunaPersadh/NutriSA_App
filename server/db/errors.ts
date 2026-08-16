/**
 * Reading a Postgres error well enough to answer it with the right status.
 *
 * Almost every database failure is a 500 and should be: the client cannot act
 * on it and the detail belongs in the log, never in a response body. A unique
 * violation on a write is the exception. It is not a server fault at all — it
 * is the caller naming an id that is already taken — and answering it with 500
 * tells the client to retry, which will fail in exactly the same way forever.
 *
 * ## Why both places are checked
 *
 * The Neon serverless driver throws a `NeonDbError` carrying Postgres's own
 * `code`. Drizzle sometimes rethrows that object and sometimes wraps it, in
 * which case the original is on `cause` — which is where `retry.ts` looks for
 * the same field, and for the same reason. Checking one place works right up
 * until the version that changes it, and the failure would be silent: a 409
 * quietly becoming a 500.
 */

/** `unique_violation` — a duplicate key. https://www.postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = "23505"

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = (error as { code?: unknown }).code
  if (typeof direct === "string") return direct
  const cause = (error as { cause?: { code?: unknown } }).cause
  if (cause && typeof cause.code === "string") return cause.code
  return undefined
}

/**
 * True when a write failed because a unique index already holds that value.
 *
 * On this API that means one thing: the client-minted id is taken. The
 * (user, day) uniqueness on weigh-ins and targets is never reached this way —
 * those writes name it as their conflict target and update instead.
 */
export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === UNIQUE_VIOLATION
}
