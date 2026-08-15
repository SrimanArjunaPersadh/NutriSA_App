import { z } from "zod"

import type { Macros } from "@engine"

/**
 * The `items` jsonb shape, and the one place it is translated into the engine's
 * macro shape.
 *
 * ## Two vocabularies, one translation
 *
 * The database says `{name, qty, kcal, pro, carb, fat}`. The engine says
 * `{kcal, protein, carbs, fat}`. Neither is going to change: the abbreviations
 * are what 38 rows of migrated history already hold, preserved byte-identical
 * so the migration was a straight JSON parse with no chance to transpose a
 * macro; the engine's long names are what every calculation and every component
 * reads.
 *
 * `macros.ts` in the engine carries the warning this module answers:
 *
 * > Until [the shared mapping] exists, nothing may hand a jsonb row to this
 * > engine directly: three of the four keys would come through as `undefined`
 * > and `dayTotals` would return `NaN` for every macro except calories,
 * > silently, with no throw anywhere.
 *
 * So the translation lives here, once, and both sides import it. A second copy
 * on the client is the bug that warning describes, arriving by a different road.
 */

/**
 * `qty` is a **string, verbatim**, and is never parsed.
 *
 * The old data holds "1 slice" and "2.5" in the same column. Nothing computes
 * from it — the macros on the same object are authoritative — so parsing it
 * could only ever destroy what the user actually typed.
 */
export const mealItemSchema = z.object({
  name: z.string(),
  qty: z.string(),
  kcal: z.number(),
  pro: z.number(),
  carb: z.number(),
  fat: z.number(),
})

export type MealItem = z.infer<typeof mealItemSchema>

/**
 * A jsonb column read back from Postgres is `unknown` until something checks it.
 *
 * Parsed leniently on purpose: a single malformed item must not take down the
 * whole day view. The items are a record of what was entered, and the header
 * totals stored beside them are authoritative and unaffected — so dropping an
 * unreadable line loses a detail row, whereas throwing loses the day.
 */
export function parseMealItems(value: unknown): MealItem[] {
  if (!Array.isArray(value)) return []
  const items: MealItem[] = []
  for (const entry of value) {
    const parsed = mealItemSchema.safeParse(entry)
    if (parsed.success) items.push(parsed.data)
  }
  return items
}

/** The engine's shape, in the engine's vocabulary. `pro` → protein, `carb` → carbs. */
export function toMacros(item: {
  kcal: number
  pro: number
  carb: number
  fat: number
}): Macros {
  return {
    kcal: item.kcal,
    protein: item.pro,
    carbs: item.carb,
    fat: item.fat,
  }
}

/** The database's shape, for the Phase 2 write routes. The inverse of `toMacros`. */
export function fromMacros(macros: Macros): {
  kcal: number
  pro: number
  carb: number
  fat: number
} {
  return {
    kcal: macros.kcal,
    pro: macros.protein,
    carb: macros.carbs,
    fat: macros.fat,
  }
}
