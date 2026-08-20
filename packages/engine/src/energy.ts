import { roundTo } from "./round"
import { type Macros } from "./macros"

/**
 * Where a day's calories came from.
 *
 * `src/design/nutrition_ui2.png` draws the calorie ring as **one ring split into
 * three coloured arcs** rather than a single-colour progress arc. The arc
 * lengths are the share of the day's energy contributed by each macro, and that
 * is a calculation — so it lives here and not in the component that draws it,
 * by plan.md's first standing rule.
 *
 * ## The Atwater factors
 *
 * 4 kcal per gram of protein, 4 per gram of carbohydrate, 9 per gram of fat.
 * These are the general Atwater factors, which is what every food label in
 * South Africa is computed with — so they are the right constants for a number
 * shown beside label-derived data, even though the specific-factor system is
 * more accurate for individual foods.
 *
 * Alcohol is 7 kcal/g and is **not** here. Nothing in this app records it as a
 * macro; a beer is logged with its energy and its carbohydrate, which is how
 * every label prints it. Adding a fourth factor with no column behind it would
 * be a number that could never be non-zero.
 *
 * ## Why the shares are computed from grams and then rescaled
 *
 * The stored `kcal` on a meal is **authoritative and is not re-derived** — see
 * `packages/shared/src/writes.ts`. So the sum of the macro energies routinely
 * disagrees with it: a user types the label's calorie figure, and labels round.
 * Rather than pick a winner, the shares are worked out from the grams and then
 * expressed as fractions of *their own* total. The ring is then drawn across
 * whatever the authoritative `kcal` progress is, so the arcs always fill exactly
 * the ring the calorie number earned, and their proportions still describe
 * where that energy came from.
 */

/** kcal per gram. General Atwater factors. */
export const ATWATER = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const

export type MacroShares = {
  protein: number
  carbs: number
  fat: number
}

/** Every share zero — a day with nothing logged, and the honest answer for it. */
export const NO_SHARES: MacroShares = { protein: 0, carbs: 0, fat: 0 }

/**
 * Each macro's share of the energy in `macros`, as fractions summing to 1.
 *
 * Zeroes when there is nothing to divide — an empty day, or a day of pure
 * water. **Not** an even third each: a ring drawn from thirds on an empty day
 * would claim a composition nobody ate.
 *
 * Rounded to four places, the same precision `macroProgress` uses, because
 * these end up as arc lengths and a full-precision float would make two
 * consecutive renders differ in the last bit of a `strokeDasharray`.
 */
export function macroEnergyShares(macros: Macros): MacroShares {
  const protein = Math.max(0, macros.protein) * ATWATER.protein
  const carbs = Math.max(0, macros.carbs) * ATWATER.carbs
  const fat = Math.max(0, macros.fat) * ATWATER.fat

  const total = protein + carbs + fat
  if (!Number.isFinite(total) || total <= 0) return NO_SHARES

  return {
    protein: roundTo(protein / total, 4),
    carbs: roundTo(carbs / total, 4),
    fat: roundTo(fat / total, 4),
  }
}

/**
 * Which macro contributed the most energy, or null when nothing did.
 *
 * Used to colour a meal's accent bar in the day list. That is what makes the
 * colour semantic rather than decorative — plan.md's standing rule — and it is
 * why a rotating palette by row index was not good enough: two meals of the
 * same shape would get different colours purely because of the order they were
 * eaten in.
 *
 * Ties go to protein, then carbs, then fat. An arbitrary rule for an
 * arbitrarily rare case, fixed here so the same meal always draws the same
 * colour rather than depending on object key order somewhere upstream.
 */
export function dominantMacro(macros: Macros): keyof MacroShares | null {
  const shares = macroEnergyShares(macros)
  if (shares.protein === 0 && shares.carbs === 0 && shares.fat === 0) return null

  if (shares.protein >= shares.carbs && shares.protein >= shares.fat) return "protein"
  if (shares.carbs >= shares.fat) return "carbs"
  return "fat"
}
