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
 * One logged item. Keys match the `items` jsonb written by the migration
 * (`{name, qty, kcal, pro, carb, fat}`) once mapped, so there is a single
 * translation point rather than the abbreviations leaking through the engine.
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

function normalise(macros: Macros): Macros {
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
  const total = items.reduce<Macros>(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    ZERO_MACROS,
  )
  return normalise(total)
}

/**
 * Target minus consumed.
 *
 * Goes negative once a target is passed, and is left that way on purpose.
 * Clamping to zero would hide the one case the user most needs to see, and the
 * red "over target" token exists precisely to show it.
 */
export function remainingMacros(consumed: Macros, target: Macros): Macros {
  return normalise({
    kcal: target.kcal - consumed.kcal,
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
  })
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
