import { z } from "zod"

import { macrosSchema } from "./common"
import { dayMealItemSchema } from "./day"
import {
  clientIdSchema,
  MAX_ITEMS,
  MAX_NAME_CHARS,
  writeMacrosSchema,
  writeMealItemSchema,
} from "./writes"

/**
 * Saved meals — the `custom_meals` table, plan.md Phase 6's "library".
 *
 * A saved meal is a logged meal without a day: the same header, the same items
 * jsonb, the same item shape on the read side (`dayMealItemSchema`, portion and
 * all). That is not an accident to tidy away; it is what makes "log this saved
 * meal" a copy rather than a conversion. The write contract for its items is
 * literally `writeMealItemSchema`.
 *
 * The header macros are authoritative here exactly as on a logged meal. The 4
 * migrated rows carry headers that the item lines do not necessarily sum to,
 * and a later change to rounding must not move a total the user already saw.
 */

/** Short — it is a filter chip, not a description. */
export const MAX_CATEGORY_CHARS = 40
/** The migrated rows' notes run to a sentence or two. Generous over that. */
export const MAX_NOTE_CHARS = 500

export const savedMealSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  note: z.string().nullable(),
  macros: macrosSchema,
  items: z.array(dayMealItemSchema),
})

export type SavedMeal = z.infer<typeof savedMealSchema>

/** `GET /saved-meals` — every saved meal this user has, by name. */
export const savedMealsSchema = z.object({
  meals: z.array(savedMealSchema),
})

export type SavedMeals = z.infer<typeof savedMealsSchema>

/**
 * `POST /saved-meals`.
 *
 * At least one item. A saved meal is a shortcut for logging several foods at
 * once; an empty one is a name that logs nothing.
 */
export const writeSavedMealSchema = z.object({
  id: clientIdSchema,
  name: z.string().trim().min(1).max(MAX_NAME_CHARS),
  category: z.string().trim().max(MAX_CATEGORY_CHARS).nullish(),
  note: z.string().trim().max(MAX_NOTE_CHARS).nullish(),
  macros: writeMacrosSchema,
  items: z.array(writeMealItemSchema).min(1).max(MAX_ITEMS),
})

export type WriteSavedMeal = z.infer<typeof writeSavedMealSchema>

/**
 * `PATCH /saved-meals/:id` — only what changed.
 *
 * `items` and `macros` travel together or not at all. Renaming a migrated
 * meal must not rewrite its authoritative header from items that never summed
 * to it, so a rename sends neither; an edit to the lines sends both, the header
 * recomputed by the engine from the lines being written.
 *
 * `null` clears a category or a note; omitting the field leaves it alone. Same
 * convention as `loggedTime` on a meal patch.
 */
export const patchSavedMealSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_CHARS).optional(),
    category: z.string().trim().max(MAX_CATEGORY_CHARS).nullable().optional(),
    note: z.string().trim().max(MAX_NOTE_CHARS).nullable().optional(),
    macros: writeMacrosSchema.optional(),
    items: z.array(writeMealItemSchema).min(1).max(MAX_ITEMS).optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "Send at least one field to change.",
  })
  .refine((patch) => (patch.items === undefined) === (patch.macros === undefined), {
    message: "items and macros change together.",
  })

export type PatchSavedMeal = z.infer<typeof patchSavedMealSchema>

export const savedMealWriteResultSchema = z.object({
  meal: savedMealSchema,
  created: z.boolean(),
})

export type SavedMealWriteResult = z.infer<typeof savedMealWriteResultSchema>
