import { asc, eq } from "drizzle-orm"

import {
  fromMacros,
  toMacros,
  type DeleteResult,
  type PatchSavedMeal,
  type SavedMeal,
  type SavedMeals,
  type SavedMealWriteResult,
  type WriteSavedMeal,
} from "@shared"

import type { UserScope } from "../auth/user-scope"
import { customMeals } from "../db/schema"
import { readMealItems, storedItemFromWrite } from "../food/rows"
import { deleteOwned, insertOwned, selectOwned, updateOwned, type WriteOutcome } from "./scoped"

/**
 * Saved meals: `custom_meals`, every row owned, every query through the scoped
 * layer exactly like `meals.ts`.
 *
 * Nothing here does arithmetic. The header arrives already computed by the
 * engine on the client and agreed by the user, and is stored verbatim — the
 * same rule as a logged meal, for the same reason.
 *
 * `custom_meals` is already in the POPIA cascade (`user_id` references `users`
 * with `ON DELETE CASCADE`), so this branch adds no table to it.
 */

function fromRow(row: typeof customMeals.$inferSelect): SavedMeal {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    note: row.note,
    // The stored header, never re-derived from the items. See the module note
    // in `packages/shared/src/saved-meals.ts`.
    macros: toMacros(row),
    items: readMealItems(row.items),
  }
}

/** `GET /saved-meals` — by name, because the list is scanned for a name. */
export async function listSavedMeals(scope: UserScope): Promise<SavedMeals> {
  const rows = await selectOwned(scope, customMeals, { orderBy: asc(customMeals.name) })
  return { meals: rows.map(fromRow) }
}

/**
 * `POST /saved-meals` — idempotent on the client-minted id, like every create:
 * a retry finds its own row and answers `created: false`; an id that is
 * somebody else's is refused without saying whose.
 */
export async function createSavedMeal(
  scope: UserScope,
  input: WriteSavedMeal,
): Promise<WriteOutcome<SavedMealWriteResult>> {
  const inserted = await insertOwned(scope, customMeals, {
    id: input.id,
    name: input.name,
    category: input.category ?? null,
    note: input.note ?? null,
    ...fromMacros(input.macros),
    items: input.items.map(storedItemFromWrite),
  })

  if (inserted[0]) return { ok: true, value: { meal: fromRow(inserted[0]), created: true } }

  const own = await selectOwned(scope, customMeals, { where: eq(customMeals.id, input.id), limit: 1 })
  if (own[0]) return { ok: true, value: { meal: fromRow(own[0]), created: false } }

  return { ok: false, reason: "id-taken" }
}

/**
 * `PATCH /saved-meals/:id` — not-found is the same answer for "no such id" and
 * "somebody else's", so, as with the meal patch, it is not an existence oracle.
 */
export async function patchSavedMeal(
  scope: UserScope,
  id: string,
  patch: PatchSavedMeal,
): Promise<WriteOutcome<SavedMeal, "not-found">> {
  const updated = await updateOwned(
    scope,
    customMeals,
    {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.macros !== undefined ? fromMacros(patch.macros) : {}),
      ...(patch.items !== undefined ? { items: patch.items.map(storedItemFromWrite) } : {}),
    },
    eq(customMeals.id, id),
  )

  return updated[0] ? { ok: true, value: fromRow(updated[0]) } : { ok: false, reason: "not-found" }
}

/** `DELETE /saved-meals/:id` — always an answer, never a 404. See the meal delete. */
export async function deleteSavedMeal(scope: UserScope, id: string): Promise<DeleteResult> {
  const removed = await deleteOwned(scope, customMeals, eq(customMeals.id, id))
  return { id, deleted: removed.length > 0 }
}
