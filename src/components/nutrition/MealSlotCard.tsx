import { useState } from "react"
import { Pressable, Text, View } from "react-native"

import type { Macros, MealSlot } from "@engine"
import type { DayMeal } from "@shared"

import { AddButton, MacroCompact } from "@/components/food/FoodRow"
import { ChevronDown, ChevronRight } from "@/components/icons/UiIcons"
import { SwipeActions } from "@/components/ui/SwipeActions"
import { colors } from "@/design/tokens"
import { formatKcal } from "@/lib/format"
import { storedItemQty } from "@/lib/meal-draft"

/**
 * One of the day's four meals — Breakfast, Lunch, Dinner, Snack — with its own
 * `+`, and a dropdown of everything logged under it.
 *
 * ## Why a `+` per meal
 *
 * The logger used to guess the meal from the clock, and on the iPhone
 * (2026-10-19) that read as the app deciding "Dinner" for you. Yazio, Lose It
 * and MyFitnessPal all avoid the guess the same way: you pick the meal by which
 * card you tap, so the logger opens already knowing it
 * (`research designs/README.md`, pattern 1). The bottom bar's "Log food" still
 * guesses, and the logger's title is where that guess is seen and changed.
 *
 * ## A dropdown, closed by default (2026-10-20)
 *
 * Sriman: "I don't only want to see all the meals listed out. I want to tap
 * breakfast, and then it'll make a dropdown of all the food items." So a card
 * opens closed: the slot, its calories and its P / C / F. Tapping the heading
 * opens it on every plate logged under the slot, each with the foods in it,
 * and a link to the whole meal on its own screen (`slot.tsx`). Tapping again
 * closes it.
 *
 * Each plate still swipes (`SwipeActions`): **left reveals Delete** (tap it,
 * then confirm), **right reveals Edit**; tapping it opens it (`meal.tsx`).
 *
 * A plate named for its slot (every plate the logger saves) is titled by what
 * was in it, because "Breakfast" under a card headed Breakfast says nothing;
 * any other name ("Oats and berries") is its title. Which slot a meal is under is
 * the engine's `slotOfMeal`, and `totals` is the caller's `sumMacros` — this
 * component does no arithmetic.
 */
export function MealSlotCard({
  slot,
  meals,
  totals,
  onAdd,
  onOpenSlot,
  onOpenMeal,
  onEditMeal,
  onDeleteMeal,
}: {
  slot: MealSlot
  meals: readonly DayMeal[]
  totals: Macros
  onAdd: () => void
  /** "See all of breakfast": the whole slot on its own screen. */
  onOpenSlot: () => void
  onOpenMeal: (mealId: string) => void
  onEditMeal: (mealId: string) => void
  /** Asks first; the caller owns the "are you sure". */
  onDeleteMeal: (meal: DayMeal) => void
}) {
  const [open, setOpen] = useState(false)
  const hasMeals = meals.length > 0

  return (
    // `overflow-hidden` clips a swiped row's buttons to the card's corners.
    <View className="overflow-hidden rounded-[18px] border border-cardBorder bg-card">
      <View className="min-h-[60px] flex-row items-center pr-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open, disabled: !hasMeals }}
          accessibilityLabel={
            hasMeals
              ? `${slot}, ${formatKcal(totals.kcal)} calories. ${open ? "Hide" : "Show"} what you had.`
              : `${slot}. Nothing logged yet.`
          }
          disabled={!hasMeals}
          onPress={() => setOpen((value) => !value)}
          className="min-h-[60px] flex-1 justify-center py-[8px] pl-[16px] active:opacity-70"
        >
          <View className="flex-row items-center">
            <Text className="font-barlow-semibold text-[17px] text-white">{slot}</Text>
            {hasMeals ? (
              <View className="ml-[6px]">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </View>
            ) : null}
            <View className="flex-1" />
            {hasMeals ? (
              <Text className="font-barlow-semibold text-[15px] text-white">{formatKcal(totals.kcal)} cal</Text>
            ) : null}
          </View>
          {hasMeals ? (
            <View className="flex-row justify-end">
              <MacroCompact macros={totals} />
            </View>
          ) : null}
        </Pressable>
        <AddButton label={`Add food to ${slot}`} onPress={onAdd} />
      </View>

      {!hasMeals ? (
        <Text className="pb-[16px] pl-[16px] pr-[16px] font-barlow text-[14px] text-textSecondary">
          Nothing yet. Tap + to add {slot.toLowerCase()}.
        </Text>
      ) : open ? (
        <>
          {meals.map((meal) => (
            <SwipeActions
              key={meal.id}
              background={colors.card}
              onPress={() => onOpenMeal(meal.id)}
              pressLabel={`${meal.name}, ${formatKcal(meal.macros.kcal)} calories. Open this meal.`}
              onEdit={() => onEditMeal(meal.id)}
              onDelete={() => onDeleteMeal(meal)}
              editLabel={`Edit ${meal.name}`}
              deleteLabel={`Delete ${meal.name}`}
            >
              <PlateBlock meal={meal} slot={slot} />
            </SwipeActions>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See all of ${slot.toLowerCase()} on its own screen`}
            onPress={onOpenSlot}
            className="ml-[16px] h-[44px] flex-row items-center border-t border-hairline active:opacity-70"
          >
            <Text className="font-barlow-medium text-[14px] text-link">See all of {slot.toLowerCase()}</Text>
            <View className="ml-[2px]">
              <ChevronRight size={13} color={colors.link} />
            </View>
          </Pressable>
        </>
      ) : null}
    </View>
  )
}

/**
 * One logged plate in the open dropdown: its heading, calories and P / C / F,
 * then each food in it with its amount and calories. The tap and the swipes
 * are `SwipeActions`'.
 *
 * No times for now (Sriman, 2026-10-20: "remove the times of consumption"). A
 * plate named for its slot is headed by what was in it; any other keeps its
 * name ("English Brekkie"). The time is still stored with every meal.
 */
function PlateBlock({ meal, slot }: { meal: DayMeal; slot: MealSlot }) {
  const lines = meal.items.filter((item) => item.name.trim().length > 0)
  const namedForSlot = meal.name.trim().toLowerCase() === slot.toLowerCase()
  const title = namedForSlot ? lines.map((item) => item.name).join(", ") || slot : meal.name

  return (
    <View className="ml-[16px] border-t border-hairline py-[10px] pr-[16px]">
      <View className="flex-row items-center">
        <View className="flex-1 pr-[10px]">
          <Text numberOfLines={1} className="font-barlow-semibold text-[15px] text-white">
            {title}
          </Text>
        </View>
        <View className="items-end">
          <Text className="font-barlow-semibold text-[15px] text-white">{formatKcal(meal.macros.kcal)} cal</Text>
          <MacroCompact macros={meal.macros} />
        </View>
      </View>

      {lines.map((item, index) => (
        <View key={`${item.name}-${index}`} className="mt-[6px] flex-row items-baseline pl-[10px]">
          <Text numberOfLines={1} className="flex-1 pr-[8px] font-barlow text-[14px] text-white">
            {item.name}
            <Text className="text-textSecondary">{`  ${storedItemQty(item)}`}</Text>
          </Text>
          <Text className="font-barlow text-[13px] text-textSecondary">{formatKcal(item.macros.kcal)} cal</Text>
        </View>
      ))}
    </View>
  )
}
