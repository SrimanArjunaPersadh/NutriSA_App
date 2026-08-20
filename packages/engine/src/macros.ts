import { roundTo } from "./round"

/**
 * Macro arithmetic. Every number the dashboard, the day view and the chat
 * assistant show comes through here — the model is never allowed to add up a
 * day itself.
 */

/** Grams of each macro plus energy. The shape used everywhere. */
export type Macros = {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/**
 * One logged item, in the engine's own shape.
 *
 * ⚠️ **These are not the keys in the database.** The `items` jsonb on
 * `meal_logs` and `custom_meals` uses `{name, qty, kcal, pro, carb, fat}` —
 * the migration preserved the old app's abbreviations verbatim rather than
 * rewriting 38 rows of history. The engine uses `{kcal, protein, carbs, fat}`,
 * so `pro` → `protein` and `carb` → `carbs` on every read.
 *
 * That translation is owned by the Phase 2 zod mapping layer in
 * `packages/shared/`, **which does not exist yet**. Until it does, nothing may
 * hand a jsonb row to this engine directly: three of the four keys would come
 * through as `undefined` and `dayTotals` would return `NaN` for every macro
 * except calories, silently, with no throw anywhere.
 */
export type LoggedItem = Macros

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

/** Energy is whole; grams carry one decimal. */
const DECIMALS: Record<keyof Macros, number> = {
  kcal: 0,
  protein: 1,
  carbs: 1,
  fat: 1,
}

/**
 * Round each field to the precision it is read at.
 *
 * Exported because `portions.ts` scales macros and must land on the same
 * decimals — a portion rounded to four places and a day total rounded to one
 * would print two different numbers for the same single-item meal.
 */
export function normaliseMacros(macros: Macros): Macros {
  return {
    kcal: roundTo(macros.kcal, DECIMALS.kcal),
    protein: roundTo(macros.protein, DECIMALS.protein),
    carbs: roundTo(macros.carbs, DECIMALS.carbs),
    fat: roundTo(macros.fat, DECIMALS.fat),
  }
}

/**
 * Sum of everything logged on a day.
 *
 * Accumulates at full precision and rounds once at the end, the opposite of the
 * trend. Nothing feeds forward here, so rounding per item would just scatter
 * error across the total: thirty items each rounded to one decimal can miss the
 * true sum by more than a gram, and the user would see totals that do not add up
 * against the items printed directly above them.
 */
export function dayTotals(items: readonly LoggedItem[]): Macros {
  return sumMacros(items)
}

/**
 * Sum of any set of macros, rounded once at the end.
 *
 * The same arithmetic `dayTotals` needs, under the name the *other* caller
 * needs: the manual entry form adds its lines up into a running total for one
 * meal, and calling that a "day total" in the component that draws it would be
 * a lie that reads fine and confuses the next person to open the file.
 *
 * `dayTotals` delegates here rather than the two keeping their own loops. One
 * of them would eventually round differently.
 */
export function sumMacros(items: readonly LoggedItem[]): Macros {
  const total = items.reduce<Macros>(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    ZERO_MACROS,
  )
  return normaliseMacros(total)
}

/**
 * Target minus consumed.
 *
 * Goes negative once a target is passed, and is left that way on purpose.
 * Clamping to zero would hide the one case the user most needs to see, and the
 * red "over target" token exists precisely to show it.
 */
export function remainingMacros(consumed: Macros, target: Macros): Macros {
  return normaliseMacros({
    kcal: target.kcal - consumed.kcal,
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
  })
}

/**
 * How far past a target a `remaining` value has gone.
 *
 * `remainingMacros` goes negative on purpose and every surface leaves it that
 * way, because over-target is a designed state rather than a minus sign — the
 * copy reads "180 kcal over" rather than "-180 kcal left". Turning the sign
 * into that figure is the last step of that calculation, so it belongs here
 * rather than as a `Math.abs` in whichever component happens to print it.
 *
 * Added on `meal-logging` after a review found the same `Math.abs(remaining)`
 * in two components. Two copies of one line is how a rule stops being a rule.
 *
 * Zero when the target has not been passed, so a caller can print this without
 * first asking whether it applies.
 */
export function amountOver(remaining: number): number {
  if (!Number.isFinite(remaining) || remaining >= 0) return 0
  return -remaining
}

/**
 * Share of each target consumed, as a 0–1 fraction for the dashboard rings.
 *
 * Not clamped, for the same reason as above — a ring at 1.2 is the caller's cue
 * to render an over-target state. A zero or missing target yields 0 rather than
 * Infinity, which would otherwise reach a `strokeDashoffset` and blank the ring.
 */
export function macroProgress(consumed: Macros, target: Macros): Macros {
  const ratio = (a: number, b: number) => (b > 0 ? roundTo(a / b, 4) : 0)
  return {
    kcal: ratio(consumed.kcal, target.kcal),
    protein: ratio(consumed.protein, target.protein),
    carbs: ratio(consumed.carbs, target.carbs),
    fat: ratio(consumed.fat, target.fat),
  }
}
