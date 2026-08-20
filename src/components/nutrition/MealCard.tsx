import { Pressable, Text, View } from "react-native"

import { dominantMacro } from "@engine"
import type { DayMeal } from "@shared"

import { colors } from "@/design/tokens"
import { formatKcal } from "@/lib/format"

/**
 * One logged meal — `src/design/nutrition_ui2.png`.
 *
 * A card with a coloured bar down its leading edge, the meal's name, what was
 * in it, and its calories on the right. The whole card is the control that
 * opens it for editing; a pencil at the end would be a smaller target for the
 * same job.
 *
 * ## The bar's colour is the meal's dominant macro
 *
 * plan.md's standing rule: **colour is semantic, never decoration.** The
 * reference alternates red and teal down the list, which by itself is a
 * rotation by row index — and that would give two identical meals different
 * colours purely because of the order they were eaten in.
 *
 * So the bar takes the token colour of whichever macro carried the most
 * *energy* in that meal, via the engine's `dominantMacro`. It lands in almost
 * the same place visually — a breakfast and a lunch usually do differ — and it
 * means something: a row of yellow bars is a day of carbohydrate, at a glance,
 * without reading a number.
 *
 * A meal with no macros at all (black coffee) gets the neutral border colour
 * rather than a macro's. Nothing is dominant, and picking one would be the
 * decoration the rule forbids.
 */

const BAR_COLOUR = {
  protein: colors.protein,
  fat: colors.fats,
  carbs: colors.carbs,
} as const

export function MealCard({ meal, onPress }: { meal: DayMeal; onPress: () => void }) {
  const dominant = dominantMacro(meal.macros)
  const accent = dominant ? BAR_COLOUR[dominant] : colors.buttonBorder

  const items = meal.items
    .map((item) => item.name)
    .filter((name) => name.length > 0)
    .join(" · ")

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meal.name}, ${formatKcal(meal.macros.kcal)} calories. Tap to edit.`}
      onPress={onPress}
      // `overflow-hidden` is what lets the bar sit flush in the rounded corner.
      // Without it the bar draws as a square block over the radius.
      className="flex-row items-center overflow-hidden rounded-[14px] border border-cardBorder bg-card active:opacity-80"
    >
      <View accessible={false} style={{ width: 4, alignSelf: "stretch", backgroundColor: accent }} />

      <View className="flex-1 py-[13px] pl-[14px] pr-[10px]">
        <Text numberOfLines={1} className="font-barlow-semibold text-[16px] text-white">
          {meal.name}
        </Text>

        {/*
          The items, and the time if there is one. plan.md wants `logged_time`
          shown on this screen and this is the line it fits on — it is a label
          either way, and nothing on this card sorts by it.
        */}
        {items || meal.loggedTime ? (
          <Text numberOfLines={1} className="mt-[3px] font-barlow text-[13px] text-textSecondary">
            {[meal.loggedTime, items].filter(Boolean).join("  ·  ")}
          </Text>
        ) : null}
      </View>

      <Text className="pr-[16px] font-barlow-bold text-[18px] text-white">
        {formatKcal(meal.macros.kcal)}
      </Text>
    </Pressable>
  )
}
