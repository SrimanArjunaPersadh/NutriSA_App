import { Pressable, Text, View } from "react-native"

import { isPortionUnit, measureLabel, portionLabel, type Macros } from "@engine"
import type { Food } from "@shared"

import { PlusIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { formatGrams, formatKcal } from "@/lib/format"
import { foodServingMacros } from "@/lib/meal-draft"

import { FoodThumb } from "./FoodThumb"

/**
 * One search result — `src/design/nutrition_tabs.jpeg`, second screen.
 *
 * Photo, name, "170 g · Fage" under it, the serving's kcal and P/C/F on the
 * right, and a `+`. Two targets with two jobs, MacroFactor's split and the
 * reason the logger is fast: **`+` adds the default serving and stays on the
 * list**, and **the row opens the food** to choose an amount.
 *
 * The reference draws the `+` orange. Orange is not in the locked token table,
 * so it is `primary`: the `+` is this row's primary action, which is what that
 * token is for.
 *
 * `badge` marks a row as one of **your** foods ("Yours") in search, the
 * MyNetDiary pattern of putting what you have logged before above the database.
 *
 * Every number comes from `foodServingMacros`, which is the engine's
 * `scalePortion`. Nothing here multiplies.
 */
export function FoodRow({
  food,
  onOpen,
  onQuickAdd,
  badge,
}: {
  food: Food
  onOpen: () => void
  onQuickAdd: () => void
  badge?: string | undefined
}) {
  const macros = foodServingMacros(food)
  const serving = servingText(food)
  const detail = [serving, food.brand].filter(Boolean).join(" · ")

  return (
    <View className="flex-row items-center border-b border-hairline">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${food.name}, ${formatKcal(macros.kcal)} calories per ${serving}. Choose an amount.`}
        onPress={onOpen}
        className="flex-1 flex-row items-center py-[10px] active:opacity-70"
      >
        <FoodThumb name={food.name} imageUrl={food.imageUrl} macros={food.per} size={40} />

        <View className="ml-[12px] flex-1 pr-[8px]">
          <View className="flex-row items-center">
            <Text numberOfLines={1} className="shrink font-barlow-semibold text-[15px] text-white">
              {food.name}
            </Text>
            {badge ? (
              <Text className="ml-[6px] font-barlow-semibold text-[10px] uppercase tracking-[0.5px] text-link">
                {badge}
              </Text>
            ) : null}
          </View>
          {/* Two lines: "1.5 tablespoons (24 g) · Black Cat" must keep its unit. */}
          <Text numberOfLines={2} className="mt-[1px] font-barlow text-[13px] text-textSecondary">
            {detail}
          </Text>
        </View>

        <View className="items-end">
          <Text className="font-barlow-semibold text-[15px] text-white">
            {formatKcal(macros.kcal)} cal
          </Text>
          <MacroCompact macros={macros} />
        </View>
      </Pressable>

      <AddButton label={`Add ${serving} of ${food.name}`} onPress={onQuickAdd} />
    </View>
  )
}

/**
 * The `+`: a grey circle with a white plus, MacroFactor's
 * (`research designs/macrofactor/app-store/02.jpg`), 32pt of ink inside a 44pt
 * target. It was a blue-tinted square until the 2026-10-20 restyle. Shared by
 * the rows and the cards so every "add this" in the logger is the same control.
 */
export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="ml-[6px] h-[44px] w-[44px] items-center justify-center active:opacity-60"
    >
      <View className="h-[32px] w-[32px] items-center justify-center rounded-full bg-secondary">
        <PlusIcon size={16} color={colors.white} />
      </View>
    </Pressable>
  )
}

/**
 * "P 18g   C 4g   F 0g" — the compact macro line, each in its token colour.
 *
 * Three separate pieces with an 8pt gap, at 11pt. It was one run of text,
 * "P23g C52g F7g", with only a space between, and under a meal's calories on
 * the Nutrition tab the three read as one crowded string (iPhone, 2026-10-20).
 */
export function MacroCompact({ macros }: { macros: Macros }) {
  return (
    <View
      accessible
      accessibilityLabel={`Protein ${formatGrams(macros.protein)} grams, carbs ${formatGrams(macros.carbs)} grams, fat ${formatGrams(macros.fat)} grams`}
      className="mt-[2px] flex-row flex-wrap gap-x-[8px]"
    >
      <Text className="font-barlow-bold text-[11px] text-protein">P {formatGrams(macros.protein)}g</Text>
      <Text className="font-barlow-bold text-[11px] text-carbs">C {formatGrams(macros.carbs)}g</Text>
      <Text className="font-barlow-bold text-[11px] text-fats">F {formatGrams(macros.fat)}g</Text>
    </View>
  )
}

/** "95 kcal · P 5 · C 16.5 · F 0.5", protein-carbs-fat, the app's settled order. */
export function MacroLine({ macros, size = 13 }: { macros: Macros; size?: 13 | 15 }) {
  const text = size === 15 ? "text-[15px]" : "text-[13px]"
  return (
    <View className="mt-[2px] flex-row items-baseline">
      <Text className={`font-barlow-medium ${text} text-white`}>{formatKcal(macros.kcal)} cal</Text>
      <Text className={`ml-[8px] font-barlow-bold ${text} text-protein`}>P {formatGrams(macros.protein)}</Text>
      <Text className={`ml-[6px] font-barlow-bold ${text} text-carbs`}>C {formatGrams(macros.carbs)}</Text>
      <Text className={`ml-[6px] font-barlow-bold ${text} text-fats`}>F {formatGrams(macros.fat)}</Text>
    </View>
  )
}

/**
 * The serving as the user should read it: by the food's natural unit when it
 * has one ("1 banana (118 g)", "2 slices (76 g)"), else the label's own words
 * ("30 g"), else the engine's `portionLabel` ("150 g").
 */
export function servingText(food: Food): string {
  const unit = isPortionUnit(food.unit) ? food.unit : "piece"
  if (food.measure && (unit === "g" || unit === "ml")) return measureLabel(food.serving.quantity, food.measure, unit)
  if (food.serving.label) return food.serving.label
  return portionLabel(food.serving.quantity, unit)
}
