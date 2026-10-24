import { Pressable, Text, View } from "react-native"

import { dominantMacro } from "@engine"
import type { SavedMeal } from "@shared"

import { ChevronRight } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { formatKcal } from "@/lib/format"

import { MacroLine } from "./FoodRow"
import { ShortcutCard, ShortcutStrip } from "./ShortcutCard"

/**
 * Saved meals, drawn two ways: as cards in the logger's strip, and as rows in
 * the library.
 *
 * The cards are `src/design/nutrition_tabs.jpeg`'s recents — "Oats & Berries,
 * 1 cup Oats, 1/3 cup Blueberries" — which is a saved meal in this app's
 * vocabulary. Same two-target rule as a food: `+` puts the whole meal on the
 * plate, the card opens it.
 */

const ACCENT = {
  protein: colors.protein,
  fat: colors.fats,
  carbs: colors.carbs,
} as const

function itemCount(meal: SavedMeal): string {
  return `${meal.items.length} ${meal.items.length === 1 ? "item" : "items"}`
}

/**
 * "2 slices Brown bread" — a meal's lines, as the card's subtitle. The amount
 * leads, without its weight in brackets ("2 slices (76 g)" → "2 slices"), so
 * the unit is the part that stays on screen when a long name is cut short.
 */
function itemLines(meal: SavedMeal): string[] {
  return meal.items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => {
      const amount = item.qty.replace(/\s*\([^)]*\)\s*$/, "").trim()
      return amount ? `${amount} ${item.name}` : item.name
    })
}

/** The logger's strip. Renders nothing when there is nothing saved. */
export function SavedMealStrip({
  meals,
  heading,
  onOpen,
  onAdd,
  onSeeAll,
}: {
  meals: readonly SavedMeal[]
  heading: string
  onOpen: (meal: SavedMeal) => void
  onAdd: (meal: SavedMeal) => void
  onSeeAll?: (() => void) | undefined
}) {
  return (
    <ShortcutStrip
      heading={heading}
      empty={meals.length === 0}
      action={onSeeAll ? { label: "See all", onPress: onSeeAll } : undefined}
    >
      {meals.map((meal) => (
        <ShortcutCard
          key={meal.id}
          title={meal.name}
          lines={itemLines(meal)}
          macros={meal.macros}
          onOpen={() => onOpen(meal)}
          onAdd={() => onAdd(meal)}
          openLabel={`${meal.name}, ${formatKcal(meal.macros.kcal)} calories, ${itemCount(meal)}. Open it.`}
          addLabel={`Add ${meal.name} to the plate`}
        />
      ))}
    </ShortcutStrip>
  )
}

/**
 * One saved meal in the library list. The whole row opens it — through
 * `SwipeActions` in the library, which owns the tap so a swipe never lands as
 * one; `onPress` is for a row used on its own.
 */
export function SavedMealRow({ meal, onPress }: { meal: SavedMeal; onPress?: (() => void) | undefined }) {
  const detail = [meal.category, itemCount(meal)].filter(Boolean).join("  ·  ")
  const dominant = dominantMacro(meal.macros)

  const content = (
    <>
      <View
        className="w-[4px] self-stretch"
        style={{ backgroundColor: dominant ? ACCENT[dominant] : colors.buttonBorder }}
      />
      <View className="flex-1 py-[12px] pl-[14px] pr-[8px]">
        <Text numberOfLines={1} className="font-barlow-semibold text-[16px] text-white">
          {meal.name}
        </Text>
        <MacroLine macros={meal.macros} />
        <Text numberOfLines={1} className="mt-[2px] font-barlow text-[12px] text-textSecondary">
          {detail}
        </Text>
      </View>
      <View className="pr-[12px]">
        <ChevronRight size={16} />
      </View>
    </>
  )

  if (!onPress) {
    return (
      <View className="flex-row items-center overflow-hidden rounded-[14px] border border-cardBorder bg-card">
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meal.name}, ${formatKcal(meal.macros.kcal)} calories, ${itemCount(meal)}. Open it.`}
      onPress={onPress}
      className="flex-row items-center overflow-hidden rounded-[14px] border border-cardBorder bg-card active:opacity-80"
    >
      {content}
    </Pressable>
  )
}
