import { asc, eq } from "drizzle-orm"

import { nextSortOrder, type LogDay } from "@engine"
import {
  fromMacros,
  type MealDeleteResult,
  type MealPatchResult,
  type MealWriteResult,
  type PatchMeal,
  type WriteMeal,
} from "@shared"

import type { UserScope } from "../auth/user-scope"
import { mealLogs, type MealItem } from "../db/schema"
import {
  deleteOwned,
  insertOwned,
  selectOwned,
  updateOwned,
  type WriteOutcome,
} from "./scoped"

/**
 * Writing, correcting and removing a logged meal.
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

/**
 * One line of the request, in the shape the jsonb column holds.
 *
 * The macro vocabularies differ on either side of this function — the engine
 * and the wire say `protein`/`carbs`, the column says `pro`/`carb` — and
 * `fromMacros` is the only place that translation is allowed to happen. It runs
 * twice per item here: once for the line's own totals, once for the per-unit
 * figures inside `portion`, which are macros like any others.
 *
 * `portion` is dropped when absent rather than written as `null`. A key that is
 * not in the object reads back as `undefined` through `mealPortionSchema
 * .optional()`, which is the same state the 38 migrated rows are already in —
 * so old rows and new portionless ones are one case downstream instead of two.
 */
function toStoredItem(item: WriteMeal["items"][number]): MealItem {
  return {
    name: item.name,
    qty: item.qty,
    ...fromMacros(item.macros),
    ...(item.portion
      ? {
          portion: {
            quantity: item.portion.quantity,
            unit: item.portion.unit,
            per: fromMacros(item.portion.per),
          },
        }
      : {}),
  }
}

export async function writeMealLog(
  scope: UserScope,
  day: LogDay,
  input: WriteMeal,
): Promise<WriteOutcome<MealWriteResult>> {
  const sortOrder = input.sortOrder ?? (await appendPosition(scope, day))

  const items = input.items.map(toStoredItem)

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
 * Applies a correction to a meal that is already logged.
 *
 * ## Read, then update — and why that is safe here
 *
 * The row is fetched first because two of the decisions below need what is
 * currently stored: whether the day is changing (which is what triggers a fresh
 * position), and what to report as `previousDate`. That is a read-modify-write,
 * and in general those race. Here they do not race with anything that matters:
 * this is one person's own meal on their own phone, the only other writer is
 * another device of theirs, and the loser of such a race is the *earlier* edit —
 * which is the same answer a single `UPDATE` would give.
 *
 * The read also decides the 404. `updateOwned` alone cannot tell "no such meal"
 * from "a patch that changed nothing", because both return zero rows.
 *
 * ## A meal that moves day gets a new position
 *
 * `sort_order` is a position **within a day**. Carrying it across to another day
 * would drop the meal on top of whatever already holds that slot there, and the
 * day view would order the two arbitrarily. So a move without an explicit
 * `sortOrder` appends to the day it lands on, through the engine's
 * `nextSortOrder` — the same call a fresh log makes, for the same reason.
 *
 * A patch that does *not* change the day leaves the position alone. Re-appending
 * on every edit would send a corrected breakfast to the bottom of the day.
 *
 * ## What is never patched
 *
 * `id`, `user_id` and `created_at`. The first two are not settable through
 * `updateOwned` at all — see the note there. `created_at` is simply never in the
 * patch: it records when the row was written, and an edit does not rewrite
 * history, it corrects it.
 */
export async function patchMealLog(
  scope: UserScope,
  id: string,
  patch: PatchMeal,
  /**
   * The day the patch moves the meal to, already bounds-checked by the route.
   * Undefined when the request did not send a `date` — the meal stays where it
   * is. The route resolves this because the bounds depend on what day it is
   * now, which is not a fact this module should be forming an opinion about.
   */
  day: LogDay | undefined,
): Promise<WriteOutcome<MealPatchResult, "not-found">> {
  const existing = await selectOwned(scope, mealLogs, {
    where: eq(mealLogs.id, id),
    limit: 1,
  })

  const current = existing[0]
  if (!current) return { ok: false, reason: "not-found" }

  const movedTo = day && day !== current.date ? day : undefined

  const sortOrder =
    patch.sortOrder ?? (movedTo ? await appendPosition(scope, movedTo) : current.sortOrder)

  const updated = await updateOwned(
    scope,
    mealLogs,
    {
      ...(movedTo ? { date: movedTo } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.macros !== undefined ? fromMacros(patch.macros) : {}),
      ...(patch.items !== undefined ? { items: patch.items.map(toStoredItem) } : {}),
      // `null` clears the time and `undefined` leaves it: the two are different
      // requests, so the key is written only when the field was actually sent.
      ...(patch.loggedTime !== undefined ? { loggedTime: patch.loggedTime } : {}),
      sortOrder,
    },
    eq(mealLogs.id, id),
  )

  const row = updated[0]
  /**
   * Unreachable through the read above — the row was this user's a moment ago
   * and only this user can remove it. Treated as "not found" rather than
   * asserted, because the alternative is a 500 for a state that is, at worst, a
   * second device deleting the meal mid-edit.
   */
  if (!row) return { ok: false, reason: "not-found" }

  return {
    ok: true,
    value: {
      id: row.id,
      date: row.date,
      sortOrder: row.sortOrder,
      previousDate: current.date,
    },
  }
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
