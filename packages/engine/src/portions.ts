import { normaliseMacros, ZERO_MACROS, type Macros } from "./macros"
import { roundTo } from "./round"

/**
 * Quantity times per-unit macros — the one calculation the manual entry form
 * makes, and therefore the one it is not allowed to make itself.
 *
 * plan.md, Phase 4: "Macros always `quantity × per-unit`, **unit label always
 * visible**". That multiplication is a number the user reads off the screen, so
 * by the first standing rule it lives here rather than inside a `TextInput`'s
 * `onChangeText`. The component's job is to collect a quantity, a unit and four
 * per-unit figures and hand them over.
 *
 * ## Two bases, not one
 *
 * A packet of rice says "per 100 g". A loaf says "per slice". Both are how the
 * label is actually printed, and asking someone to divide 340 by 100 in their
 * head before typing is how a logging app gets abandoned. So a unit carries the
 * basis its macros are quoted against — 100 for the weight and volume units, 1
 * for the countable ones — and the scale is `quantity / basis`.
 *
 * The basis is a property of the unit and not a separate control. A "per 100 g
 * / per 1 g" toggle beside the unit selector would be a second thing to get
 * wrong, and every South African label this app will meet quotes weight per
 * 100.
 */

/**
 * The units a portion may be entered in.
 *
 * plan.md's list, in its order: "g, slices, pieces, tbsp, tsp, cup, ml". Stored
 * singular because the label is built for display — "1 slices" is not a thing
 * anyone writes — and the plural belongs to whatever is rendering it.
 *
 * `ml` sits last in the plan's list and last here. It is the only weight/volume
 * unit besides `g`, so the pair that carries a 100-basis is not contiguous in
 * this array; `PORTION_BASIS` is a lookup rather than an index range for
 * exactly that reason.
 */
export const PORTION_UNITS = ["g", "slice", "piece", "tbsp", "tsp", "cup", "ml", "serving"] as const

export type PortionUnit = (typeof PORTION_UNITS)[number]

/**
 * How many units the entered macros describe.
 *
 * 100 for the units a label quotes per 100 of, 1 for the ones it quotes per
 * one. Written out per unit rather than as `unit === "g" || unit === "ml" ? 100
 * : 1` so that adding a unit forces a decision about its basis instead of
 * silently inheriting 1.
 */
export const PORTION_BASIS: Record<PortionUnit, number> = {
  g: 100,
  ml: 100,
  slice: 1,
  piece: 1,
  tbsp: 1,
  tsp: 1,
  cup: 1,
  /**
   * One serving of whatever the line is, with its macros as one serving. Added
   * and withdrawn on 2026-10-20: weightless lines were scaled as servings, and
   * Sriman rejected it because a serving says nothing about grams. Kept so the
   * few lines already saved in it still read; nothing offers or writes it now
   * (those lines are weighed first, `WeighSheet`).
   */
  serving: 1,
}

/** Narrows a stored string back to a unit. Anything else is not one. */
export function isPortionUnit(value: string): value is PortionUnit {
  return (PORTION_UNITS as readonly string[]).includes(value)
}

/**
 * The macros in `quantity` of `unit`, given what one basis-worth contains.
 *
 * Rounded through `normaliseMacros`, the same rounding the day totals use, so a
 * one-item meal's header and its single line print the same numbers. Rounding
 * here rather than only at the total is deliberate and is the opposite of
 * `sumMacros`' rule: this value is **stored** on the item and shown beside it,
 * so it has to be the number the user agreed to rather than a full-precision
 * figure that displays as something else.
 *
 * A non-finite or negative quantity yields zeros rather than throwing. The
 * caller is a text field mid-edit: "" and "-" and "1.2.3" are all states a
 * keyboard passes through on the way to a real number, and a form that throws
 * on the way to being filled in correctly is not usable.
 */
export function scalePortion(per: Macros, quantity: number, unit: PortionUnit): Macros {
  const basis = PORTION_BASIS[unit]
  if (!Number.isFinite(quantity) || quantity < 0) return ZERO_MACROS

  const factor = quantity / basis
  return normaliseMacros({
    kcal: per.kcal * factor,
    protein: per.protein * factor,
    carbs: per.carbs * factor,
    fat: per.fat * factor,
  })
}

/**
 * The `qty` string stored beside the macros, e.g. `"150 g"`, `"2 slices"`.
 *
 * `meal_logs.items[].qty` is free text and is **never parsed** — see
 * `packages/shared/src/meal-items.ts`. This builds it; nothing reads it back.
 * The portion that produced it is stored separately and structurally, which is
 * what the edit surface reloads.
 *
 * The unit label is part of the string on purpose: plan.md requires the unit to
 * be visible, and a "150" with the unit living only in a dropdown two lines
 * away is the ambiguity that rule exists to remove.
 */
export function portionLabel(quantity: number, unit: PortionUnit): string {
  const amount = Number.isFinite(quantity) ? String(quantity) : "0"
  if (unit === "g" || unit === "ml") return `${amount} ${unit}`
  // Countable units pluralise; "1 slice", "2 slices". `tbsp` and `tsp` are
  // abbreviations and take no plural in the way anyone writes them.
  if (unit === "tbsp" || unit === "tsp") return `${amount} ${unit}`
  return `${amount} ${unit}${quantity === 1 ? "" : "s"}`
}

/**
 * The amount slider's scale — what the far end means, and how far one notch is.
 *
 * Added for the food detail sheet (`nutrition_tabs.jpeg`, 2026-10-19), which
 * drags an amount instead of only typing one. Here rather than in the
 * component for the reason every number is: dragging produces a quantity the
 * user logs, and turning a thumb position into grams is arithmetic about their
 * food.
 *
 * Three servings or a sensible floor, whichever is more — a 20 g serving of
 * beans still needs a slider that reaches a plateful. Weight and volume move in
 * 5s; countable units in halves, because half a slice is real and a tenth of
 * one is not.
 */
export type PortionRange = { max: number; step: number }

export function portionRange(unit: PortionUnit, serving: number): PortionRange {
  const weighed = PORTION_BASIS[unit] === 100
  const step = weighed ? 5 : 0.5
  const floor = weighed ? 300 : 4
  const servings = Number.isFinite(serving) && serving > 0 ? serving * 3 : 0
  return { max: Math.ceil(Math.max(floor, servings) / step) * step, step }
}

/**
 * The quantity at a point along the slider, snapped to the step.
 *
 * Never below one step: the left end is "a little", not "none". A zero would
 * disable the Add button under the user's thumb and read as the slider
 * breaking.
 */
export function quantityAtFraction(fraction: number, range: PortionRange): number {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  const snapped = Math.round((clamped * range.max) / range.step) * range.step
  return roundTo(Math.max(range.step, snapped), 2)
}

/** Where a typed quantity sits on the slider, 0 to 1. Past the end pins to the end. */
export function fractionOfQuantity(quantity: number, range: PortionRange): number {
  if (!Number.isFinite(quantity) || quantity <= 0 || range.max <= 0) return 0
  return Math.min(1, quantity / range.max)
}

/**
 * One notch up or down from `quantity` — VoiceOver's increment and decrement
 * on the slider. Snapped to the grid and kept inside the range, through the
 * same `quantityAtFraction` a drag uses, so the two can never disagree.
 */
export function stepQuantity(quantity: number, direction: 1 | -1, range: PortionRange): number {
  const from = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
  return quantityAtFraction((from + direction * range.step) / range.max, range)
}

/**
 * One-tap amounts for the food panel, under the amount field.
 *
 * Most edits to a serving are "the usual", "a round 100 g" or "half of it", so
 * those are offered as chips before anyone reaches for the slider — the
 * remembered-serving pattern MacroFactor and Lose It lead with
 * (`research designs/README.md`, pattern 9).
 *
 * - Weighed units (g, ml): the serving, then 100, then half the serving.
 * - Countable units (slices, cups...): the serving, half of it, double it.
 *
 * A chip that would repeat another amount, or land under one slider step, is
 * left out. Every quantity is snapped to the same grid as the slider, so a chip
 * and a drag can never disagree about where "half" is.
 */
export type ServingPreset = { kind: "serving" | "hundred" | "half" | "double"; quantity: number }

export function servingPresets(unit: PortionUnit, serving: number): ServingPreset[] {
  const weighed = PORTION_BASIS[unit] === 100
  const { step } = portionRange(unit, serving)
  const snap = (value: number) => roundTo(Math.round(value / step) * step, 2)
  const valid = Number.isFinite(serving) && serving > 0

  const candidates: ServingPreset[] = []
  if (valid) candidates.push({ kind: "serving", quantity: serving })
  if (weighed) candidates.push({ kind: "hundred", quantity: 100 })
  if (valid) candidates.push({ kind: "half", quantity: snap(serving / 2) })
  if (valid && !weighed) candidates.push({ kind: "double", quantity: snap(serving * 2) })

  const seen = new Set<number>()
  return candidates.filter((preset) => {
    if (preset.quantity < step || seen.has(preset.quantity)) return false
    seen.add(preset.quantity)
    return true
  })
}

/**
 * A natural unit for a weighed food: "slice" is 35 g of bread, "banana" is
 * 118 g of banana.
 *
 * Sriman (2026-10-20): amounts should read "1 slice of bread", "1 banana",
 * not default to 100 g. A measure rides along with a g or ml amount; the
 * amount itself stays in grams (or ml), so every stored line still scales
 * through `scalePortion` on its label's per-100 figures, and the measure only
 * changes how the amount is shown and entered. Where a measure comes from (the
 * packet's serving size, or a short list of common foods) is `@shared`'s
 * `naturalMeasure`.
 */
export type Measure = { noun: string; grams: number }

/**
 * The noun for a count: "banana" for 1, "bananas" otherwise. Only the last
 * word changes, so "medium banana" becomes "medium bananas". English rules
 * cover the words a serving is named with (slice, banana, egg, biscuit, peach,
 * berry); nothing here needs to be perfect, it is a label.
 */
export function pluralNoun(noun: string, count: number): string {
  if (count === 1) return noun
  const words = noun.split(" ")
  const last = words[words.length - 1] ?? ""
  let plural: string
  if (/(s|x|z|ch|sh)$/i.test(last)) plural = `${last}es`
  else if (/[^aeiou]y$/i.test(last)) plural = `${last.slice(0, -1)}ies`
  else plural = `${last}s`
  return [...words.slice(0, -1), plural].join(" ")
}

/** How many measures an amount is: 177 g of 118 g bananas is 1.5. To 2 decimals. */
export function measureCount(amount: number, measure: Measure): number {
  if (!Number.isFinite(amount) || amount <= 0 || !(measure.grams > 0)) return 0
  return roundTo(amount / measure.grams, 2)
}

/** The amount in grams (or ml) for a count of measures: 1.5 bananas is 177 g. To 1 decimal. */
export function amountForMeasure(count: number, measure: Measure): number {
  if (!Number.isFinite(count) || count <= 0 || !(measure.grams > 0)) return 0
  return roundTo(count * measure.grams, 1)
}

/**
 * One measure's weight, when a label states several: "2 biscuits (25 g)" makes
 * a biscuit 12.5 g. Null when either number is unusable.
 */
export function gramsPerMeasure(total: number, count: number): number | null {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(count) || count <= 0) return null
  return roundTo(total / count, 1)
}

/** "1 banana (118 g)", "1.5 bananas (177 g)", "2 slices (70 g)". */
export function measureLabel(amount: number, measure: Measure, unit: PortionUnit): string {
  const count = measureCount(amount, measure)
  return `${count} ${pluralNoun(measure.noun, count)} (${portionLabel(roundTo(amount, 1), unit)})`
}

/**
 * Per-100 macros from a total and the weight it came in: 180 kcal in 76 g is
 * 236.8 kcal per 100 g.
 *
 * For lines saved with absolute macros and no weight (the old app's history):
 * once the user says what the amount weighed, the line can be scaled in grams
 * like any other (2026-10-20). Null for a weight that is not positive.
 */
export function perHundredFrom(total: Macros, amount: number): Macros | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  const factor = 100 / amount
  return normaliseMacros({
    kcal: total.kcal * factor,
    protein: total.protein * factor,
    carbs: total.carbs * factor,
    fat: total.fat * factor,
  })
}

/**
 * Whether a weight could hold these calories. Nothing edible is denser than fat
 * at about 9 kcal a gram; above 9.5 the "grams" were never grams. The old app
 * stored "0.75g" for three quarters of a scoop of whey (99 kcal) and "2g" for
 * two slices of bread (180 kcal).
 */
export function isPlausibleWeight(kcal: number, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false
  if (!Number.isFinite(kcal) || kcal <= 0) return true
  return kcal / amount <= 9.5
}
