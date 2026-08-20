import { normaliseMacros, ZERO_MACROS, type Macros } from "./macros"

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
export const PORTION_UNITS = ["g", "slice", "piece", "tbsp", "tsp", "cup", "ml"] as const

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
