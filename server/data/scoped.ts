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
 * The `as never` on `.from()` is load-bearing. It is one of only two casts in
 * this file — see `updateOwned` for the other, which is the same problem in a
 * different Drizzle method.
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

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * ## Why the write helpers are not wrapped in `withRetry`
 *
 * `../db/retry.ts` spells this out and it is worth repeating where the code
 * is: a retried `POST /meal-logs` whose first attempt actually succeeded before
 * the response was lost would log the meal twice. The reads above are safe to
 * replay because re-running a `SELECT` cannot change anything; an `INSERT` is
 * the opposite.
 *
 * Retrying a lost write is the **client's** job, and it is safe there because
 * the id came from the client: the same UUIDv7 arrives again, `ON CONFLICT DO
 * NOTHING` swallows it, and the second response says `created: false`. That is
 * the whole idempotency story, and adding a retry here would replace it with a
 * worse one — a duplicate meal, silently, on a flaky connection.
 *
 * `tests/write-safety.test.ts` fails if a `withRetry` ever appears in this
 * section.
 *
 * ## Why every helper takes the scope even where it looks unnecessary
 *
 * An insert does not need a `WHERE`, so a scope could be argued to be
 * decoration on `insertOwned`. It is not: the scope is where `user_id` comes
 * from. Stamping it here rather than in the caller means no data module can
 * write a row owned by anyone but the verified user, in the same way no data
 * module can read one.
 */

/** A user-scoped table with a client-minted primary key. */
type IdentifiedTable = UserScopedTable & { id: PgColumn }

/**
 * What a write in `server/data/` answers with.
 *
 * A union rather than a thrown error, because "that id is taken" is an ordinary
 * outcome of a public write route — it is what a client sees the first time it
 * mints an id badly — and an outcome the route has to turn into a specific
 * status. Thrown, it would land in `app.onError` with everything genuinely
 * broken and come back as a 500 that tells the client to retry forever.
 */
export type WriteOutcome<T, Reason extends string = "id-taken"> =
  | { ok: true; value: T }
  | { ok: false; reason: Reason }

/**
 * `INSERT … ON CONFLICT (id) DO NOTHING`, with `user_id` stamped from the
 * scope. Returns the inserted row, or **nothing** if the id was already taken.
 *
 * An empty result is not an error and not necessarily a duplicate submit: the
 * id is unique across the whole table, so it also covers the (vanishingly
 * unlikely, or deliberate) case of an id that belongs to another user. The
 * caller has to tell those apart, because only it can — by asking whether it
 * can see a row with that id, which goes through `selectOwned` and therefore
 * through the ownership filter.
 *
 * `values` cannot carry a `userId`: the type removes it, so an attempt to pass
 * one does not compile rather than being silently overwritten.
 */
export async function insertOwned<T extends IdentifiedTable>(
  scope: UserScope,
  table: T,
  values: Omit<T["$inferInsert"], "userId">,
): Promise<T["$inferSelect"][]> {
  const rows = await db
    .insert(table)
    .values({ ...values, userId: scope.userId } as T["$inferInsert"])
    .onConflictDoNothing({ target: table.id })
    .returning()

  return rows as T["$inferSelect"][]
}

export type ScopedUpsert = {
  /**
   * The unique index that decides "this row already exists". It must include
   * `user_id` — see the note in `upsertOwned`.
   */
  target: PgColumn[]
  /** The columns to overwrite on the existing row. */
  set: Record<string, unknown>
}

/**
 * `INSERT … ON CONFLICT (…) DO UPDATE`, for the two tables where a day may only
 * hold one row: a weigh-in, and a set of targets taking effect.
 *
 * ## The conflict target must include `user_id`
 *
 * Both callers conflict on `(user_id, date)` or `(user_id, valid_from)`, so the
 * row being updated is by construction the caller's own — Postgres found it by
 * matching this user's id. A target that omitted `user_id` would find *anyone's*
 * row for that day and overwrite it, which is the worst bug this layer could
 * have.
 *
 * `setWhere` re-applies the ownership filter to the update anyway. It is
 * redundant while every caller passes a correct target, and that is exactly why
 * it is there: the redundancy is what a future caller with a wrong target runs
 * into instead of a cross-user overwrite.
 *
 * An empty result therefore means the update matched nothing — unreachable
 * through a correct target, and a signal the caller should refuse rather than
 * paper over.
 */
export async function upsertOwned<T extends IdentifiedTable>(
  scope: UserScope,
  table: T,
  values: Omit<T["$inferInsert"], "userId">,
  conflict: ScopedUpsert,
): Promise<T["$inferSelect"][]> {
  const rows = await db
    .insert(table)
    .values({ ...values, userId: scope.userId } as T["$inferInsert"])
    .onConflictDoUpdate({
      target: conflict.target,
      set: conflict.set,
      setWhere: ownedBy(scope, table),
    })
    .returning()

  return rows as T["$inferSelect"][]
}

/**
 * `UPDATE <table> SET … WHERE user_id = <scope> [AND …]`, returning what changed.
 *
 * ## It cannot move a row to another owner
 *
 * `values` has `userId` and `id` removed by the type, so neither can be set.
 * That is not tidiness: an `UPDATE` that could write `user_id` would let a
 * patch hand one user's meal to another, and unlike the read helpers there is
 * no `WHERE` clause that catches it — the ownership filter selects the row
 * *before* the new owner is written. The only defence is that the column is not
 * settable, so it is not settable.
 *
 * The `id` is excluded for a smaller reason and a firm one: the id is the row's
 * identity and the idempotency key every write on this API is built around.
 * Changing it under a client that is holding it is how a retry becomes a
 * duplicate.
 *
 * An empty result means nothing matched — already deleted, or never this
 * user's. The caller decides what that is worth; `../data/meals.ts` turns it
 * into a 404 that says the same thing for both, the same way `deleteOwned`'s
 * caller does.
 *
 * Not retried, like every other mutation here. An `UPDATE` with a fixed `SET`
 * is in fact idempotent, so a retry would be harmless — but the rule this
 * section holds is "no mutation in this file is wrapped in `withRetry`", and a
 * rule with one carefully-argued exception in it is a rule the next person
 * copies the exception from. `tests/write-safety.test.ts` enforces it flatly.
 */
export async function updateOwned<T extends IdentifiedTable>(
  scope: UserScope,
  table: T,
  values: Partial<Omit<T["$inferInsert"], "userId" | "id">>,
  where?: SQL | undefined,
): Promise<T["$inferSelect"][]> {
  const rows = await db
    .update(table)
    // The second cast in this file, and the same class of problem as the
    // `as never` on `.from()` above: Drizzle's `.set()` parameter is a mapped
    // type over the table's columns, and it cannot be reduced while `T` is
    // still an unresolved type parameter. The signature above carries the real
    // constraint — `userId` and `id` are removed there — so nothing a caller
    // can write is loosened by this.
    .set(values as Record<string, unknown>)
    .where(ownedBy(scope, table, where))
    .returning()

  return rows as T["$inferSelect"][]
}

/**
 * `DELETE FROM <table> WHERE user_id = <scope> [AND …]`, returning what went.
 *
 * The ownership filter is applied here rather than by the caller for the same
 * reason `selectOwned` does it, only louder: a `DELETE` that loses its `WHERE`
 * does not return the wrong rows, it destroys everybody's.
 *
 * An empty result means there was nothing matching **that this user owns**. The
 * caller cannot tell "already gone" from "not yours", and neither can the
 * client — that is deliberate, and `deleteResultSchema` explains why.
 */
export async function deleteOwned<T extends UserScopedTable>(
  scope: UserScope,
  table: T,
  where?: SQL | undefined,
): Promise<T["$inferSelect"][]> {
  const rows = await db.delete(table).where(ownedBy(scope, table, where)).returning()

  return rows as T["$inferSelect"][]
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
