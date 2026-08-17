import { asc, eq } from "drizzle-orm"

import { nextSortOrder, type LogDay } from "@engine"
import { fromMacros, type MealDeleteResult, type MealWriteResult, type WriteMeal } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { mealLogs, type MealItem } from "../db/schema"
import { deleteOwned, insertOwned, selectOwned, type WriteOutcome } from "./scoped"

/**
 * Writing and removing a logged meal.
 *
 * **Nothing here does arithmetic**, the same as `day.ts`. The header totals
 * arrive already agreed by the user and are stored verbatim; the one number
 * this module produces that nobody sent is the meal's position in its day, and
 * that comes from the engine's `nextSortOrder`.
 *
 * ## `created_at` is never taken from the client
 *
 * plan.md, Phase 2: "Back-date support: `date` accepted and validated,
 * `created_at` always real instant". `date` is the day the meal belongs to and
 * the user may choose it; `created_at` is when the row was written and defaults
 * in the column. There is no path below that sets it, which is what keeps a
 * back-dated meal honest: it says "this was eaten on Tuesday" and "this was
 * entered on Friday" at the same time, and both are true.
 */

export async function writeMealLog(
  scope: UserScope,
  day: LogDay,
  input: WriteMeal,
): Promise<WriteOutcome<MealWriteResult>> {
  const sortOrder = input.sortOrder ?? (await appendPosition(scope, day))

  const items: MealItem[] = input.items.map((item) => ({
    name: item.name,
    qty: item.qty,
    ...fromMacros(item.macros),
  }))

  const inserted = await insertOwned(scope, mealLogs, {
    id: input.id,
    date: day,
    name: input.name,
    ...fromMacros(input.macros),
    items,
    loggedTime: input.loggedTime ?? null,
    sortOrder,
    libId: input.libId ?? null,
    // No createdAt. See the note above — the column's default is the real
    // instant, and that is the only thing allowed to set it.
  })

  const row = inserted[0]
  if (row) {
    return {
      ok: true,
      value: { id: row.id, date: row.date, sortOrder: row.sortOrder, created: true },
    }
  }

  /**
   * The insert conflicted, so this id is already in the table. Two very
   * different situations look identical from here, and only a scoped read can
   * separate them:
   *
   * - **the same write, arriving twice** — a retry after a lost response, which
   *   is what the client-minted id is for. The row is this user's, nothing
   *   changed, and the honest answer is the row that is already there.
   * - **an id belonging to someone else** — which random v7 ids do not collide
   *   into, so it is a client minting them badly or a caller probing. Refused,
   *   with no hint about whose it is.
   *
   * A replay is answered with the **stored** row rather than the request's own
   * values. If the two disagree — same id, different meal — the first write is
   * what happened, and reporting the second would describe a row that does not
   * exist.
   */
  const existing = await selectOwned(scope, mealLogs, {
    where: eq(mealLogs.id, input.id),
    limit: 1,
  })

  const owned = existing[0]
  if (!owned) return { ok: false, reason: "id-taken" }

  return {
    ok: true,
    value: { id: owned.id, date: owned.date, sortOrder: owned.sortOrder, created: false },
  }
}

/**
 * Where a new meal goes in the day it is being logged to.
 *
 * Read at write time, not sent by the client, because the client's copy of the
 * day can be stale — see `packages/engine/src/ordering.ts`. The extra query is
 * the cost of the day view having a stable order.
 */
async function appendPosition(scope: UserScope, day: LogDay): Promise<number> {
  const existing = await selectOwned(scope, mealLogs, {
    where: eq(mealLogs.date, day),
    orderBy: asc(mealLogs.sortOrder),
  })
  return nextSortOrder(existing.map((row) => row.sortOrder))
}

/**
 * Removes one logged meal.
 *
 * Idempotent, and quiet about why nothing happened: `deleted: false` covers
 * "already gone" and "never yours" alike. Distinguishing them would answer, for
 * any id anyone cares to send, whether a row with that id exists — and the
 * client does the same thing either way, which is refetch the day.
 */
export async function deleteMealLog(
  scope: UserScope,
  id: string,
): Promise<MealDeleteResult> {
  const removed = await deleteOwned(scope, mealLogs, eq(mealLogs.id, id))
  return { id, deleted: removed.length > 0 }
}
