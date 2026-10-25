import { useMemo, useState } from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { currentLoggingDay, isLogDay, MEAL_SLOTS, slotOfMeal, sumMacros, type LogDay, type MealSlot } from "@engine"

import { IngredientLine, TotalsCard } from "@/components/food/MealBreakdown"
import { ChevronLeft, ChevronRight } from "@/components/icons/UiIcons"
import { ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { formatDayWithWeekday, formatKcal } from "@/lib/format"
import { storedItemQty } from "@/lib/meal-draft"
import { useDaySummary } from "@/lib/queries"

/**
 * Everything eaten at one meal of a day: all of Lunch, across every lunch
 * logged.
 *
 * Opened by tapping a meal card's heading on the Nutrition tab. Each logged
 * meal under a card opened on its own, so a dinner logged as two plates (a
 * protein shake, then the Yama BBQ seitan) could only be seen a plate at a
 * time; Sriman wanted "everything that I've had for dinner, including all the
 * meals" (iPhone, 2026-10-20).
 *
 * Top to bottom: the slot and the day, the slot's totals (`TotalsCard`), then
 * every ingredient, grouped under the plate it was logged in, each group
 * headed by its time and opening that meal (to edit or delete it). **Add to
 * Lunch** at the bottom opens the logger on this slot.
 *
 * Which meals are in a slot is the engine's `slotOfMeal`, the same rule the
 * day view groups by; the total is `sumMacros` of their stored headers, the
 * same figure the card shows.
 */
export default function SlotScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ date?: string; slot?: string }>()

  /** Validated, never trusted — same rule as `add-food.tsx`. */
  const [day] = useState<LogDay>(() =>
    typeof params.date === "string" && isLogDay(params.date) ? params.date : currentLoggingDay(),
  )
  const slot: MealSlot =
    typeof params.slot === "string" && (MEAL_SLOTS as readonly string[]).includes(params.slot)
      ? (params.slot as MealSlot)
      : "Snack"

  const summary = useDaySummary(day)
  const meals = useMemo(
    () => (summary.data?.meals ?? []).filter((meal) => slotOfMeal(meal.name, meal.loggedTime) === slot),
    [summary.data?.meals, slot],
  )
  const totals = useMemo(() => sumMacros(meals.map((meal) => meal.macros)), [meals])
  const ingredientCount = meals.flatMap((meal) => meal.items.filter((item) => item.name.trim().length > 0)).length
  const isToday = day === currentLoggingDay()

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="h-[56px] flex-row items-center px-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text className="ml-[2px] font-barlow-semibold text-[18px] text-white">
          {isToday ? "Today" : formatDayWithWeekday(day)}
        </Text>
      </View>

      {summary.isPending ? (
        <Loading label={`Loading ${slot.toLowerCase()}`} />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-[16px] pb-[24px] pt-[8px]"
          showsVerticalScrollIndicator={false}
        >
          <Text className="font-display text-[34px] leading-[38px] text-white">{slot}</Text>
          <Text className="mt-[2px] font-barlow text-[14px] text-textSecondary">
            {meals.length === 0
              ? "Nothing logged yet"
              : `${meals.length} ${meals.length === 1 ? "meal" : "meals"} · ${ingredientCount} ${
                  ingredientCount === 1 ? "ingredient" : "ingredients"
                }`}
          </Text>

          {meals.length === 0 ? (
            <Text className="mt-[24px] font-barlow text-[15px] leading-[21px] text-textSecondary">
              Nothing logged for {slot.toLowerCase()} on this day. Add something below.
            </Text>
          ) : (
            <>
              <TotalsCard macros={totals} />

              <Text className="mt-[22px] font-barlow-bold text-[17px] text-white">Everything you had</Text>

              {meals.map((meal) => {
                const lines = meal.items.filter((item) => item.name.trim().length > 0)
                const named = meal.name.trim().toLowerCase() !== slot.toLowerCase()
                return (
                  <View key={meal.id} className="mt-[10px] rounded-[16px] bg-card px-[14px]">
                    {/* The plate's heading opens it, to edit or delete. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${named ? meal.name : "This plate"}, ${formatKcal(meal.macros.kcal)} calories. Open it to edit.`}
                      onPress={() => router.push(`/meal?date=${day}&id=${meal.id}`)}
                      className="min-h-[44px] flex-row items-center border-b border-hairline py-[8px] active:opacity-70"
                    >
                      <Text numberOfLines={1} className="flex-1 font-barlow-medium text-[13px] text-textSecondary">
                        {/* No times for now (2026-10-20); the plate's own name if it has one. */}
                        {named ? meal.name : "Plate"}
                      </Text>
                      <Text className="mr-[4px] font-barlow-medium text-[13px] text-textSecondary">
                        {formatKcal(meal.macros.kcal)} cal
                      </Text>
                      <ChevronRight size={14} />
                    </Pressable>
                    {lines.length === 0 ? (
                      <Text className="py-[12px] font-barlow text-[14px] text-textSecondary">No ingredients recorded.</Text>
                    ) : (
                      lines.map((item, index) => (
                        <View key={`${item.name}-${index}`} className={index > 0 ? "border-t border-hairline" : ""}>
                          <IngredientLine name={item.name} qty={storedItemQty(item)} macros={item.macros} />
                        </View>
                      ))
                    )}
                  </View>
                )
              })}
            </>
          )}
        </ScrollView>
      )}

      <View
        className="border-t border-hairline bg-ground px-[16px] pt-[12px]"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add food to ${slot}`}
          onPress={() => router.push(`/add-food?date=${day}&slot=${slot}`)}
          className="h-[52px] items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Text className="font-barlow-semibold text-[16px] text-ground">Add to {slot}</Text>
        </Pressable>
      </View>
    </View>
  )
}
