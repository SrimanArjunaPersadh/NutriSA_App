import { Pressable, Text, View } from "react-native"

import type { Macros } from "@shared"

import { ChevronRight, PlusIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { foodEmoji } from "@/lib/food-emoji"
import { formatGrams, formatKcal } from "@/lib/format"

/**
 * One row of the food list — `src/design/nutrition_ui.png`.
 *
 * Emoji, name, a macro line, a portion line, and a round action on the right,
 * with a hairline under everything but the last row. Three lines of decreasing
 * weight: the name is what you read, the macros are what you check, the portion
 * is what you confirm if the first two surprised you.
 *
 * ## The macro line runs protein, carbs, fat
 *
 * `nutrition_ui.png` prints its rows protein, fat, carbs. `nutrition_ui2.png`
 * puts its three macro cards in protein, carbs, fat. The two references
 * disagree; Sriman's call on 2026-08-20 was carbs second, matching the
 * dashboard's rings and the entry form. `MacrosCard.tsx` is where that order is
 * argued and where it changes if it ever does.
 *
 * "Cal" rather than "kcal" is kept from the reference, and is the one unit
 * string in the app that is not "kcal". Still open.
 */

/** Colour per macro, so the letters carry the same meaning they do everywhere. */
const MACRO_TONE = {
  protein: "text-protein",
  carbs: "text-carbs",
  fat: "text-fats",
} as const

export function FoodRow({
  name,
  macros,
  detail,
  action,
  onPress,
  last,
}: {
  name: string
  macros: Macros
  /** The portion line: "1 breast (166 grams)", "1.5 cups". Hidden when empty. */
  detail?: string | undefined
  /** `add` draws the reference's `+`; `open` draws a chevron for an existing row. */
  action: "add" | "open"
  onPress: () => void
  last?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        action === "add"
          ? `Add ${name}, ${formatKcal(macros.kcal)} calories`
          : `${name}, ${formatKcal(macros.kcal)} calories. Tap to edit.`
      }
      onPress={onPress}
      className={`flex-row items-center py-[12px] active:opacity-70 ${
        last ? "" : "border-b border-cardBorder"
      }`}
    >
      <View className="h-[38px] w-[38px] items-center justify-center">
        {/* See ShortcutRow for why the line height is set by hand. */}
        <Text accessible={false} style={{ fontSize: 25, lineHeight: 30 }}>
          {foodEmoji(name)}
        </Text>
      </View>

      <View className="ml-[10px] flex-1">
        <Text numberOfLines={1} className="font-barlow-semibold text-[15px] text-white">
          {name}
        </Text>

        <Text className="mt-[2px] font-barlow text-[13px] text-textSecondary">
          {formatKcal(macros.kcal)} Cal
          <Text className="text-textSecondary"> • </Text>
          <Text className={MACRO_TONE.protein}>{formatGrams(macros.protein)}P</Text>
          <Text className="text-textSecondary"> • </Text>
          <Text className={MACRO_TONE.carbs}>{formatGrams(macros.carbs)}C</Text>
          <Text className="text-textSecondary"> • </Text>
          <Text className={MACRO_TONE.fat}>{formatGrams(macros.fat)}F</Text>
        </Text>

        {detail ? (
          <Text numberOfLines={1} className="mt-[3px] font-barlow text-[12px] text-dotMuted">
            {detail}
          </Text>
        ) : null}
      </View>

      <View className="ml-[10px] h-[30px] w-[30px] items-center justify-center rounded-full border border-buttonBorder">
        {action === "add" ? (
          <PlusIcon size={15} color={colors.textSecondary} />
        ) : (
          <ChevronRight size={15} />
        )}
      </View>
    </Pressable>
  )
}
