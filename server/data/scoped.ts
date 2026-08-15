import { and, asc, eq, getTableName, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import type { LogDay } from "@engine"

import type { UserScope } from "../auth/user-scope"
import { db } from "../db"
import { withRetry } from "../db/retry"

/**
 * The scoped query layer. **The only module in `server/` that may import `db`.**
 *
 * ## What this buys
 *
 * plan.md: "Scoped query layer — data functions **cannot be called** without a
 * `UserScope`." Two halves make that true, and neither works alone:
 *
 * 1. A `UserScope` can only be minted by the Clerk middleware — see the brand
 *    symbol in `../auth/user-scope.ts`. Holding one is proof of a verified
 *    token, not proof that someone typed the right variable name.
 * 2. Everything below takes one as its **first** parameter and applies the
 *    `user_id` filter itself. The caller never receives a query builder with no
 *    `WHERE` clause and a reminder to add one, because forgetting that is a
 *    cross-user data leak and it fails silently — the query still returns rows,
 *    just everybody's.
 *
 * `tests/scoped-access.test.ts` enforces the "only module that imports db"
 * half, which is the part a future file can quietly break. The two security
 * tests in `tests/security/` prove the outcome against real Postgres.
 *
 * ## Why this returns rows and not a builder
 *
 * A builder would let a caller chain `.where(...)`, and Drizzle's `.where()`
 * **replaces** the condition rather than adding to it — one innocuous-looking
 * line would drop the ownership filter and widen the query to every user in the
 * table. Handing back a finished promise makes that unexpressible. Ordering and
 * limits are parameters instead, which covers every read this API has.
 *
 * ## What it deliberately does not cover
 *
 * `foods` has a nullable `user_id` — a global row belongs to nobody and is
 * readable by everyone — so it cannot go through `ownedBy` and gets its own
 * function when Phase 6/7 need it. It is the one table where "scoped to this
 * user" is the wrong question, and it should look different in the source.
 */

/** A table with a non-null `user_id`. Every user-scoped table except `foods`. */
type UserScopedTable = PgTable & { userId: PgColumn }

/**
 * The `WHERE` clause that makes a query this user's.
 *
 * Exported for the rare query `selectOwned` cannot express — an aggregate, or a
 * join. Reach for `selectOwned` first: this hands back a condition that still
 * has to be attached to something, and a condition nobody attached is exactly
 * the failure this layer exists to prevent.
 */
export function ownedBy(
  scope: UserScope,
  table: UserScopedTable,
  extra?: SQL | undefined,
): SQL {
  const owned = eq(table.userId, scope.userId)
  return extra ? (and(owned, extra) as SQL) : owned
}

export type ScopedSelectOptions = {
  /** Extra conditions, ANDed with the ownership filter. Never replaces it. */
  where?: SQL | undefined
  orderBy?: SQL | SQL[] | undefined
  limit?: number | undefined
}

/**
 * `SELECT * FROM <table> WHERE user_id = <scope> [AND ...]`, executed.
 *
 * Retried through transient transport failures — see `../db/retry.ts`, which
 * records why that is not defensive padding here. Safe without qualification
 * because every query this builds is a `SELECT`: re-running one cannot change
 * anything, and a write helper added later must not simply copy this.
 *
 * The `as never` on `.from()` is load-bearing and is the only cast here.
 * Drizzle guards `.from()` with a conditional type that checks the table has a
 * non-empty selection, and that conditional cannot be reduced while `T` is
 * still an unresolved type parameter — so a generic helper over "any
 * user-scoped table" cannot be written without it. The declared return type
 * carries the real shape, so callers still get `T`'s columns fully typed and
 * nothing downstream is loosened.
 */
export async function selectOwned<T extends UserScopedTable>(
  scope: UserScope,
  table: T,
  options: ScopedSelectOptions = {},
): Promise<T["$inferSelect"][]> {
  const build = () => {
    let query = db
      .select()
      .from(table as never)
      .where(ownedBy(scope, table, options.where))
      .$dynamic()

    if (options.orderBy) {
      query = query.orderBy(
        ...(Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy]),
      )
    }
    if (options.limit !== undefined) {
      query = query.limit(options.limit)
    }
    return query
  }

  // Rebuilt per attempt rather than awaited twice: a Drizzle query builder is a
  // thenable that caches its result, so retrying the same object would replay
  // the settled promise instead of issuing a new statement.
  return (await withRetry(`select ${String(getTableName(table))}`, () =>
    build().execute(),
  )) as T["$inferSelect"][]
}

/** A user-scoped table that records which calendar day a row belongs to. */
type DatedTable = UserScopedTable & { date: PgColumn }

/**
 * The distinct calendar days this user has a row on, oldest first.
 *
 * `SELECT DISTINCT date`, not `SELECT *` filtered afterwards. The streak only
 * needs to know *which* days carry a log, and pulling every meal row to work
 * that out would fetch the entire logging history — every item, every macro —
 * on every dashboard load, and grow linearly with use forever. Postgres answers
 * this from the `(user_id, date)` index without touching the rows.
 */
export async function selectOwnedDays<T extends DatedTable>(
  scope: UserScope,
  table: T,
): Promise<LogDay[]> {
  // Same `as never` on `.from()` as above, and the same reason. It erases the
  // row type along with the table type, so the projection's shape is restated
  // on the result — it is the one written two lines up, not an assumption.
  const rows = (await withRetry(`distinct days ${String(getTableName(table))}`, () =>
    db
      .selectDistinct({ day: table.date })
      .from(table as never)
      .where(ownedBy(scope, table))
      .orderBy(asc(table.date))
      .execute(),
  )) as { day: LogDay }[]

  return rows.map((row) => row.day)
}
