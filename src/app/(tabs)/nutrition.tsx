import { useMemo, useState } from "react"
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  currentLoggingDay,
  MEAL_SLOTS,
  slotOfMeal,
  sumMacros,
  type LogDay,
  type MealSlot,
} from "@engine"
import type { DayMeal } from "@shared"

import { DayStepper } from "@/components/logging/DayStepper"
import { CaloriesLeftCard } from "@/components/nutrition/CaloriesLeftCard"
import { LOG_FOODS_BAR_HEIGHT, LogFoodsBar } from "@/components/nutrition/LogFoodsBar"
import { MealSlotCard } from "@/components/nutrition/MealSlotCard"
import { ErrorState, Loading } from "@/components/state"
import { PinnedBar, usePinnedBarClearance } from "@/components/ui/PinnedBar"
import { ChevronDown, ChevronRight } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { formatDayLong } from "@/lib/format"
import { useDaySummary, useDeleteMeal } from "@/lib/queries"
import { deleteErrorMessage, MEAL_WORDING } from "@/lib/save-message"

/**
 * The Nutrition tab: the day, as the best-rated loggers draw it
 * (`research designs/README.md`; the clickable mockup is
 * `research designs/prototype.html`).
 *
 * Top to bottom: the day as a heading with "Saved meals" beside it, **calories
 * left** with the three macros under it (`CaloriesLeftCard`), then the four
 * meals, Breakfast, Lunch, Dinner and Snack, each a card with its own `+`
 * (`MealSlotCard`). A pinned "Log food" pill with the scanner at its end sits
 * at the bottom (`LogFoodsBar`).
 *
 * ## Why it changed (2026-10-20)
 *
 * The first version traced `nutrition_ui2.png`: a ring that led with calories
 * eaten, a row of four add-modes, and one list of meals. On the iPhone the
 * logger then had to guess which meal you were adding to, the bottom bar had
 * two buttons that opened the same screen, and the bar sat on the Meals list.
 * The research found one answer to all three, used by Yazio, Lose It and
 * MyFitnessPal: a card per meal, each with a `+` that opens the logger on that
 * meal.
 *
 * Every way in opens `src/app/add-food.tsx` on the day being shown: a card's
 * `+` with `slot=`, the pill with the keyboard up, the barcode in scan mode.
 * Tapping a logged meal opens `meal.tsx`: its ingredients and macros, with an
 * Edit button (it used to open the old `log-meal.tsx` form, now deleted). plan.md's Phase 4 asks for "meals in `sort_order`,
 * `logged_time` shown": within each slot they keep the server's order, and the
 * time is on every line.
 *
 * ## Every number is the server's or the engine's
 *
 * `consumed`, `remaining` and `progress` come from `GET /day/:date` and are the
 * engine's `dayTotals`, `remainingMacros` and `macroProgress`. Two things are
 * worked out on this side of the wire, both by the engine: which slot each meal
 * sits under (`slotOfMeal`) and each slot's total (`sumMacros`). Nothing in
 * this file adds, subtracts or divides.
 */

/** The day's meals under their four slots, each slot with its total. */
function groupBySlot(meals: readonly DayMeal[]) {
  return MEAL_SLOTS.map((slot) => {
    const inSlot = meals.filter((meal) => slotOfMeal(meal.name, meal.loggedTime) === slot)
    return { slot, meals: inSlot, totals: sumMacros(inSlot.map((meal) => meal.macros)) }
  })
}

export default function Nutrition() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  /** Clears the pinned bar so the last meal can be scrolled out from under it. */
  const bottomClearance = usePinnedBarClearance(LOG_FOODS_BAR_HEIGHT)

  const [day, setDay] = useState<LogDay>(currentLoggingDay)
  const [dayPickerOpen, setDayPickerOpen] = useState(false)

  const { data, isPending, isError, error, refetch, isRefetching } = useDaySummary(day)

  /** An already-logged meal opens to view: ingredients and macros, with Edit. */
  function openEntry(mealId: string) {
    router.push(`/meal?date=${day}&id=${mealId}`)
  }

  /** A row swiped left, Edit: the meal opens already editing. */
  function editEntry(mealId: string) {
    router.push(`/meal?date=${day}&id=${mealId}&edit=1`)
  }

  const removeMeal = useDeleteMeal()

  /**
   * A row swiped left, Delete: one "are you sure", then gone. Swipe, Delete,
   * confirm — it took four taps through the meal screen (iPhone, 2026-10-20).
   */
  function deleteEntry(meal: DayMeal) {
    Alert.alert(`Delete ${meal.name}?`, "It comes off this day's log. This can't be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          removeMeal.mutate(meal.id, {
            onError: (error) => Alert.alert("Not deleted", deleteErrorMessage(error, MEAL_WORDING)),
          }),
      },
    ])
  }

  /** A meal card's heading: every ingredient eaten at that meal that day. */
  function openSlot(slot: MealSlot) {
    router.push(`/slot?date=${day}&slot=${slot}`)
  }

  /** A meal card's `+`: the logger, on the day being shown, already on that meal. */
  function addTo(slot: MealSlot) {
    router.push(`/add-food?date=${day}&slot=${slot}`)
  }

  /** The bottom pill (typing) and its barcode (scanning). The logger guesses the meal. */
  function openLogger(mode: "search" | "scan") {
    router.push(`/add-food?date=${day}&mode=${mode}${mode === "search" ? "&focus=1" : ""}`)
  }

  /** Memoised on the meals, not the response: a refetch that changed nothing regroups nothing. */
  const slots = useMemo(() => groupBySlot(data?.meals ?? []), [data?.meals])

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-[16px]">
        {/*
          The date doubles as the day picker's trigger. The reference has no day
          control at all, and this is the one element on screen that is already
          *about* which day you are looking at — giving it the job costs no
          layout and puts the control where the eye already is.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            dayPickerOpen ? "Hide the day picker" : `${formatDayLong(day)}. Change the day.`
          }
          accessibilityState={{ expanded: dayPickerOpen }}
          onPress={() => setDayPickerOpen((open) => !open)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          className="flex-row items-center active:opacity-70"
        >
          <Text className="font-barlow-bold text-[24px] text-white">
            {formatDayLong(day)}
          </Text>
          <View className="ml-[6px]">
            <ChevronDown size={18} />
          </View>
        </Pressable>

        <View className="flex-1" />

        {/*
          The library's entry point: plan.md Phase 6 reserves "the control that
          opens the library" on this view by name. It took the place of a
          disabled "collapse" button that did nothing.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your saved meals"
          onPress={() => router.push("/saved-meals")}
          className="h-[44px] flex-row items-center pl-[12px] active:opacity-70"
        >
          <Text className="mr-[2px] font-barlow-medium text-[15px] text-link">Saved meals</Text>
          <ChevronRight size={14} color={colors.link} />
        </Pressable>
      </View>

      {dayPickerOpen ? (
        <View className="mt-[8px] px-[16px]">
          <DayStepper day={day} onChange={setDay} />
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomClearance }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.textSecondary}
          />
        }
      >
        {isPending ? (
          <View className="h-[420px]">
            <Loading label="Loading this day" />
          </View>
        ) : isError ? (
          <View className="h-[420px]">
            <ErrorState error={error} onRetry={() => void refetch()} />
          </View>
        ) : (
          <>
            <CaloriesLeftCard
              consumed={data.consumed}
              targets={data.targets}
              remaining={data.remaining}
              progress={data.progress}
            />

            <View className="mt-[12px] gap-[12px] px-[16px]">
              {slots.map(({ slot, meals, totals }) => (
                <MealSlotCard
                  key={slot}
                  slot={slot}
                  meals={meals}
                  totals={totals}
                  onAdd={() => addTo(slot)}
                  onOpenSlot={() => openSlot(slot)}
                  onOpenMeal={openEntry}
                  onEditMeal={editEntry}
                  onDeleteMeal={deleteEntry}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <PinnedBar>
        <LogFoodsBar onSearch={() => openLogger("search")} onScan={() => openLogger("scan")} />
      </PinnedBar>
    </View>
  )
}
