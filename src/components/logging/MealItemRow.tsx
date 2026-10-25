import { View } from "react-native"

import { PORTION_BASIS, PORTION_UNITS, type PortionUnit } from "@engine"

import { type DropdownOption } from "@/components/ui/Dropdown"
import { NumberField } from "@/components/logging/fields"

/**
 * The food form's unit vocabulary and its macro fields — what is left of the
 * manual entry form's line editor (`log-meal.tsx` and its `MealItemRow` were
 * deleted on `food-logger`, 2026-10-20). Used by `create-food.tsx`, the Quick
 * Add panel and the amount panel.
 *
 * ## The unit is a control, and the label follows it everywhere
 *
 * plan.md: "Unit type selector: g, slices, pieces, tbsp, tsp, cup, ml" and
 * "**unit label always visible**". Changing the unit changes what the four
 * macro fields *mean* — per 100 g, or per one slice — so the heading above them
 * is written from the unit rather than fixed. Getting that wrong by ten decades
 * is one tap, and a static "per 100g" label is how it happens.
 *
 * ## The computed total is read-only and always shown
 *
 * It is the number that will be stored, and it is the only number here nobody
 * typed. Showing it beside the inputs that produce it is what makes the
 * multiplication checkable at a glance — and it is `props.macros`, computed by
 * the engine from the debounced draft, never worked out in this file.
 */

const UNIT_LABELS: Record<PortionUnit, string> = {
  g: "g",
  ml: "ml",
  slice: "slices",
  piece: "pieces",
  tbsp: "tbsp",
  tsp: "tsp",
  cup: "cups",
  serving: "servings",
}

/**
 * Every unit but `serving`: a serving says nothing about grams (Sriman,
 * 2026-10-20), so it is only ever read back from lines already saved in it,
 * never offered.
 */
export const UNIT_OPTIONS: readonly DropdownOption<PortionUnit>[] = PORTION_UNITS.filter(
  (unit) => unit !== "serving",
).map((unit) => ({
  value: unit,
  label: UNIT_LABELS[unit],
}))

/** "per 100 g", "per slice" — the basis the four fields below are quoted against. */
export function basisLabel(unit: PortionUnit): string {
  const basis = PORTION_BASIS[unit]
  return basis === 1 ? `per ${unit}` : `per ${basis} ${unit}`
}

/**
 * The four macro boxes: energy, then protein, carbs, fat.
 *
 * Energy first because it is the number the dashboard leads with. The three
 * macros then run in the app's one display order — see `MacrosCard.tsx`, which
 * argues it — so the eye learns a single sequence and the fields line up with
 * the row the meal will become.
 */
export function MacroFields({
  values,
  onChange,
  accessibilityPrefix,
}: {
  values: { kcal: string; protein: string; carbs: string; fat: string }
  onChange: (patch: Partial<{ kcal: string; protein: string; carbs: string; fat: string }>) => void
  accessibilityPrefix: string
}) {
  return (
    <>
      <View className="mt-[8px] flex-row gap-[10px]">
        <NumberField
          label="Energy"
          value={values.kcal}
          onChangeText={(kcal) => onChange({ kcal })}
          suffix="cal"
          accessibilityLabel={`${accessibilityPrefix} energy in kilocalories`}
        />
        <NumberField
          label="Protein"
          value={values.protein}
          onChangeText={(protein) => onChange({ protein })}
          suffix="g"
          accessibilityLabel={`${accessibilityPrefix} protein in grams`}
        />
      </View>
      <View className="mt-[10px] flex-row gap-[10px]">
        <NumberField
          label="Carbs"
          value={values.carbs}
          onChangeText={(carbs) => onChange({ carbs })}
          suffix="g"
          accessibilityLabel={`${accessibilityPrefix} carbohydrates in grams`}
        />
        <NumberField
          label="Fat"
          value={values.fat}
          onChangeText={(fat) => onChange({ fat })}
          suffix="g"
          accessibilityLabel={`${accessibilityPrefix} fat in grams`}
        />
      </View>
    </>
  )
}
