import { Pressable, Text, View } from "react-native"

import { PORTION_BASIS, PORTION_UNITS, type Macros, type PortionUnit } from "@engine"

import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown"
import { CloseIcon } from "@/components/icons/UiIcons"
import { NumberField, TextField, FieldLabel } from "@/components/logging/fields"
import { formatGrams, formatKcal } from "@/lib/format"
import type { DraftItem } from "@/lib/meal-draft"

/**
 * One line of the manual entry form.
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
}

const UNIT_OPTIONS: readonly DropdownOption<PortionUnit>[] = PORTION_UNITS.map((unit) => ({
  value: unit,
  label: UNIT_LABELS[unit],
}))

/** "per 100 g", "per slice" — the basis the four fields below are quoted against. */
function basisLabel(unit: PortionUnit): string {
  const basis = PORTION_BASIS[unit]
  return basis === 1 ? `per ${unit}` : `per ${basis} ${unit}`
}

export function MealItemRow({
  item,
  macros,
  index,
  onChange,
  onRemove,
  removable,
}: {
  item: DraftItem
  /** Engine-computed, from the debounced draft. This component never multiplies. */
  macros: Macros
  index: number
  onChange: (next: DraftItem) => void
  onRemove: () => void
  /** False for the last remaining line — a meal with no items is not a meal. */
  removable: boolean
}) {
  const set = (patch: Partial<DraftItem>) => onChange({ ...item, ...patch })
  const setPer = (patch: Partial<DraftItem["per"]>) =>
    onChange({ ...item, per: { ...item.per, ...patch } })
  const setMacros = (patch: Partial<DraftItem["macros"]>) =>
    onChange({ ...item, macros: { ...item.macros, ...patch } })

  return (
    <View className="rounded-[14px] border border-cardBorder bg-card p-[14px]">
      <View className="flex-row items-start">
        <TextField
          label={`Item ${index + 1}`}
          value={item.name}
          onChangeText={(name) => set({ name })}
          placeholder="What did you eat?"
          accessibilityLabel={`Item ${index + 1} name`}
          maxLength={200}
        />
        {removable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove item ${index + 1}`}
            onPress={onRemove}
            // 18pt of ink slopped out to the 44×44 minimum, the same way the
            // barcode button in the quick-action bar does it.
            hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
            className="ml-[12px] mt-[24px] active:opacity-70"
          >
            <CloseIcon size={18} />
          </Pressable>
        ) : null}
      </View>

      {item.mode === "portion" ? (
        <>
          <View className="mt-[12px] flex-row items-end gap-[10px]">
            <NumberField
              label="Amount"
              value={item.quantity}
              onChangeText={(quantity) => set({ quantity })}
              accessibilityLabel={`Item ${index + 1} amount`}
            />
            <View>
              <FieldLabel>Unit</FieldLabel>
              <Dropdown
                value={item.unit}
                options={UNIT_OPTIONS}
                onChange={(unit) => set({ unit })}
                accessibilityLabel={`Item ${index + 1} unit`}
              />
            </View>
          </View>

          <Text className="mt-[14px] font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
            Macros {basisLabel(item.unit)}
          </Text>
          <MacroFields
            values={item.per}
            onChange={setPer}
            accessibilityPrefix={`Item ${index + 1}`}
          />
        </>
      ) : (
        <>
          {/*
            The migrated-row path. `qty` is free text and is never parsed, so it
            is shown as text and edited as text — and the macros beside it are
            the absolute stored figures, not a per-unit rate. The heading says
            so, because the same four boxes mean something different two lines
            up in the other mode.
          */}
          <View className="mt-[12px]">
            <TextField
              label="Amount"
              value={item.qty}
              onChangeText={(qty) => set({ qty })}
              placeholder="1 slice"
              accessibilityLabel={`Item ${index + 1} amount`}
              maxLength={60}
            />
          </View>
          <Text className="mt-[14px] font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
            Macros for this amount
          </Text>
          <MacroFields
            values={item.macros}
            onChange={setMacros}
            accessibilityPrefix={`Item ${index + 1}`}
          />
        </>
      )}

      <View className="mt-[14px] flex-row items-center border-t border-cardBorder pt-[10px]">
        <Text className="font-barlow text-[13px] text-textSecondary">This item</Text>
        <View className="flex-1" />
        <Text className="font-barlow-semibold text-[14px] text-white">
          {formatKcal(macros.kcal)} kcal
        </Text>
        <Text className="ml-[10px] font-barlow text-[13px] text-protein">
          P {formatGrams(macros.protein)}
        </Text>
        <Text className="ml-[8px] font-barlow text-[13px] text-carbs">
          C {formatGrams(macros.carbs)}
        </Text>
        <Text className="ml-[8px] font-barlow text-[13px] text-fats">
          F {formatGrams(macros.fat)}
        </Text>
      </View>
    </View>
  )
}

/**
 * The four macro boxes: energy, then protein, carbs, fat.
 *
 * Energy first because it is the number the dashboard leads with. The three
 * macros then run in the app's one display order — see `MacrosCard.tsx`, which
 * argues it — so the eye learns a single sequence and the fields line up with
 * the row the meal will become.
 */
function MacroFields({
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
          suffix="kcal"
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
