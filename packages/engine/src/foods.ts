import { roundTo } from "./round"

/**
 * The two numbers the food logger needs that are not portions.
 *
 * Both are small, and both are here rather than beside the code that calls them
 * for the reason every function in this package is: one is a number the user
 * reads off the screen, the other is a word derived from the time authority.
 */

/**
 * Kilojoules in one kilocalorie — the thermochemical calorie, which is the one
 * food labels use.
 *
 * Open Food Facts records energy as entered from the label, and South African
 * labels lead with kJ. Plenty of SA products in OFF carry `energy-kj_100g` and
 * no `energy-kcal_100g` at all, so a product whose kcal is missing is not a
 * product with no energy — it is a product that needs this.
 */
export const KJ_PER_KCAL = 4.184

/**
 * Kilocalories from kilojoules, to the whole kcal — the precision
 * `normaliseMacros` holds every stored kcal at, so a converted figure and a
 * typed one round the same way.
 *
 * A non-finite or negative input yields `null` rather than a number. The caller
 * is parsing a third-party record, and an unreadable energy value has to stay
 * distinguishable from a label that genuinely prints zero, or a product with
 * broken data would be logged as free food.
 */
export function kcalFromKj(kj: number): number | null {
  if (!Number.isFinite(kj) || kj < 0) return null
  return roundTo(kj / KJ_PER_KCAL, 0)
}

/**
 * The four meals the food logger offers, in the order a day runs.
 *
 * The logger shows these as a row of buttons with `mealNameFor`'s answer
 * selected, so the guess from the clock is visible and one tap from changed.
 * It used to be visible only inside the plate sheet, and on the iPhone
 * (2026-10-19) that read as the app deciding "Dinner" for you.
 */
export const MEAL_SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const

export type MealSlot = (typeof MEAL_SLOTS)[number]

/**
 * The name a meal gets when the food logger saves it without being given one.
 *
 * `meal_logs.name` is required, and the logger is built around not having to
 * type anything: search, tap `+`, tap Log Foods. So the plate is named for the
 * time of day it was eaten, which is how people name meals anyway. The plate
 * sheet shows the name and lets it be changed before saving; this is only the
 * default.
 *
 * Takes the `HH:MM` that `currentClockTime()` produces — SAST, from the time
 * authority — rather than a `Date`, so nothing here can read the phone's own
 * clock.
 *
 * The bands are deliberately coarse. Anything outside the three main meals is a
 * snack, including the small hours: a 01:00 plate is not breakfast.
 */
export function mealNameFor(clockTime: string): MealSlot {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clockTime)
  if (!match) return "Snack"

  const hour = Number(match[1])
  if (hour >= 4 && hour < 11) return "Breakfast"
  if (hour >= 11 && hour < 15) return "Lunch"
  if (hour >= 17 && hour < 22) return "Dinner"
  return "Snack"
}

/**
 * Which of the four slots a logged meal belongs under on the day view.
 *
 * The Nutrition tab draws Breakfast, Lunch, Dinner and Snack as cards, each with
 * its own `+` — the pattern Yazio, Lose It and MyFitnessPal share, and the fix
 * for the logger guessing the meal (`research designs/README.md`, pattern 1).
 * Every meal on the day then has to land in exactly one of them.
 *
 * A meal named for a slot is that slot, in any case: the logger names every
 * plate this way. Anything else — the migrated history, a meal renamed in the
 * editor, "Post-workout" — goes where the clock puts it, through `mealNameFor`,
 * so a 13:00 "Chicken wrap" sits under Lunch. With no time either, `mealNameFor`
 * answers Snack, the one slot that makes no claim about when.
 */
export function slotOfMeal(name: string, loggedTime: string | null): MealSlot {
  const named = name.trim().toLowerCase()
  const slot = MEAL_SLOTS.find((candidate) => candidate.toLowerCase() === named)
  return slot ?? mealNameFor(loggedTime ?? "")
}
