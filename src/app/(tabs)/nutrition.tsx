import { useMemo, useState } from "react"
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  amountOver,
  currentLoggingDay,
  macroEnergyShares,
  NO_SHARES,
  type LogDay,
} from "@engine"

import { DayStepper } from "@/components/logging/DayStepper"
import { CalorieDonut } from "@/components/nutrition/CalorieDonut"
import { LogFoodsBar } from "@/components/nutrition/LogFoodsBar"
import { MacroMiniCard } from "@/components/nutrition/MacroMiniCard"
import { MealCard } from "@/components/nutrition/MealCard"
import { ModeTabs, type LogMode } from "@/components/nutrition/ModeTabs"
import { Empty, ErrorState, Loading } from "@/components/state"
import { TAB_BAR_CLEARANCE } from "@/components/dashboard/QuickActionBar"
import { ChevronDown, CloseIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { formatDayLong, formatKcal } from "@/lib/format"
import { useDaySummary } from "@/lib/queries"

/**
 * The Nutrition tab, traced from `src/design/nutrition_ui2.png`.
 *
 * Top to bottom: the day as a heading, the four add-modes, a calorie ring split
 * into macro arcs, three macro cards, and the day's meals. A pinned bar at the
 * bottom carries the search field and the white action button, which is from
 * the first reference (`nutrition_ui.png`) — ui2 is cropped below the fold and
 * shows no bar, and a logging screen with no way to log would be a strange
 * thing to infer from a crop.
 *
 * ## Two references, one screen
 *
 * `nutrition_ui.png` draws the **add** surface: shortcut tiles, a list of foods
 * with `+` buttons, a search field. `nutrition_ui2.png` draws the **day**
 * surface: how much you have eaten and what of. They share the mode row, so
 * they are two states of one screen rather than two screens.
 *
 * This is the day surface, because that is what plan.md's Phase 4 asks the
 * Nutrition tab for — "day view, meals in `sort_order`, `logged_time` shown".
 * The add surface is **not built**: it needs food search, which Phase 6 owns
 * outright — plan.md reserves "the control that opens the library" for that
 * phase by name. Components for it were written here from the first reference
 * and then deleted on review, because 472 lines nothing imports is scope creep
 * whether or not it is disclosed. They are in commit `7270b52` when Phase 6
 * wants them.
 *
 * ## Every number is the server's
 *
 * `consumed`, `remaining` and `progress` come from `GET /day/:date` and are the
 * engine's `dayTotals`, `remainingMacros` and `macroProgress`. The one thing
 * computed on this side of the wire is how the ring's filled portion splits
 * between the three macros, and that is `macroEnergyShares` — also the engine's.
 * Nothing in this file adds, subtracts or divides.
 */

/** Clears the pinned bar so the last meal can be scrolled out from under it. */
const BOTTOM_CLEARANCE = TAB_BAR_CLEARANCE + 64

const RING_SIZE = 172
const RING_STROKE = 16

export default function Nutrition() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [day, setDay] = useState<LogDay>(currentLoggingDay)
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  /**
   * Quick Add rather than the reference's Scan: it is the only mode that
   * reaches anything, and opening on a mode that cannot work would make the
   * screen's first impression an apology.
   */
  const [mode, setMode] = useState<LogMode>("quick-add")

  const { data, isPending, isError, error, refetch, isRefetching } = useDaySummary(day)

  function openEntry(mealId?: string) {
    router.push(
      mealId
        ? `/log-meal?date=${day}&id=${mealId}`
        : `/log-meal?date=${day}`,
    )
  }

  /**
   * How the ring's filled portion divides between the macros.
   *
   * Memoised against the consumed totals rather than the whole response: the
   * day summary is a new object on every refetch, and this would otherwise
   * recompute — and hand the ring three new floats — on a poll that changed
   * nothing.
   */
  const shares = useMemo(
    () => (data ? macroEnergyShares(data.consumed) : NO_SHARES),
    [data?.consumed],
  )

  const isToday = day === currentLoggingDay()

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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Collapse"
          accessibilityState={{ disabled: true }}
          disabled
          className="h-[34px] w-[34px] items-center justify-center rounded-full bg-secondary"
        >
          <CloseIcon size={15} />
        </Pressable>
      </View>

      {dayPickerOpen ? (
        <View className="mt-[8px] px-[16px]">
          <DayStepper day={day} onChange={setDay} />
        </View>
      ) : null}

      <View className="mt-[12px]">
        <ModeTabs active={mode} onChange={setMode} />
      </View>

      {mode === "quick-add" ? null : <ModeNotice mode={mode} />}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: BOTTOM_CLEARANCE }}
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
            <View className="mx-[16px] items-center rounded-[20px] border border-cardBorder bg-card py-[22px]">
              <CalorieDonut
                size={RING_SIZE}
                strokeWidth={RING_STROKE}
                filled={data.progress?.kcal ?? 0}
                shares={shares}
              >
                <View className="items-center">
                  <Text className="font-barlow-bold text-[38px] leading-[44px] text-white">
                    {formatKcal(data.consumed.kcal)}
                  </Text>
                  <Text className="mt-[2px] font-barlow text-[13px] text-textSecondary">
                    {data.targets ? `of ${formatKcal(data.targets.kcal)} kcal` : "kcal"}
                  </Text>
                </View>
              </CalorieDonut>

              <Text className="mt-[18px] font-barlow-semibold text-[15px] text-white">
                {caloriesLine(data.remaining?.kcal ?? null, isToday)}
              </Text>
            </View>

            <View className="mt-[12px] flex-row gap-[10px] px-[16px]">
              <MacroMiniCard
                label="Protein"
                consumed={data.consumed.protein}
                remaining={data.remaining?.protein ?? null}
                progress={data.progress?.protein ?? null}
                color={colors.protein}
              />
              <MacroMiniCard
                label="Carbs"
                consumed={data.consumed.carbs}
                remaining={data.remaining?.carbs ?? null}
                progress={data.progress?.carbs ?? null}
                color={colors.carbs}
              />
              <MacroMiniCard
                label="Fat"
                consumed={data.consumed.fat}
                remaining={data.remaining?.fat ?? null}
                progress={data.progress?.fat ?? null}
                color={colors.fats}
              />
            </View>

            <Text className="mt-[22px] px-[16px] font-barlow-bold text-[18px] text-white">
              Meals
            </Text>

            <View className="mt-[10px] gap-[10px] px-[16px]">
              {data.meals.length === 0 ? (
                <View className="h-[180px] rounded-[16px] border border-cardBorder bg-card">
                  <Empty
                    title="Nothing logged yet"
                    detail={
                      isToday
                        ? "Add the first meal of the day."
                        : "This day has no meals on it."
                    }
                    action={{ label: "Log a meal", onPress: () => openEntry() }}
                  />
                </View>
              ) : (
                data.meals.map((meal) => (
                  <MealCard key={meal.id} meal={meal} onPress={() => openEntry(meal.id)} />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View
        className="absolute inset-x-0 bottom-0 px-[16px]"
        style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        <LogFoodsBar onLog={() => openEntry()} logLabel="Log Foods" />
      </View>
    </View>
  )
}

/**
 * The line under the ring.
 *
 * The reference reads "1,180 kcal left today". Three cases it does not cover,
 * all of them real:
 *
 * - **no targets** — every day before the user first set them. There is no
 *   "left" to report, so the line says what the ring is instead of inventing a
 *   budget.
 * - **over target** — `remainingMacros` goes negative on purpose, and the
 *   standing rule is that over-target is a designed state rather than a minus
 *   sign. So it reads "180 kcal over", in words.
 * - **a past day** — "left today" is wrong on a day that has ended. The word
 *   drops.
 */
function caloriesLine(remaining: number | null, isToday: boolean): string {
  if (remaining === null) return "No targets set yet"
  if (remaining < 0) return `${formatKcal(amountOver(remaining))} kcal over`
  return isToday ? `${formatKcal(remaining)} kcal left today` : `${formatKcal(remaining)} kcal left`
}

/**
 * A slim line under the mode row for a mode that is drawn but not built.
 *
 * A line rather than a panel, deliberately: the summary below it is still the
 * thing the user came for, and replacing the whole screen with an apology
 * because they tapped "Scan" would be a worse answer than telling them and
 * leaving their day on screen.
 *
 * It names the phase rather than saying "coming soon". The only person reading
 * it for months is Sriman, and "Phase 8" says exactly where it sits in the plan.
 */
function ModeNotice({ mode }: { mode: Exclude<LogMode, "quick-add"> }) {
  const copy = {
    scan: "Barcode and label scanning land in Phase 8. Use Log Foods for now.",
    search: "Food search lands in Phase 6. Use Log Foods for now.",
    ai: "The chat assistant lands in Phase 9. Use Log Foods for now.",
  }[mode]

  return (
    <View className="mx-[16px] mt-[12px] rounded-[10px] border border-cardBorder bg-card px-[12px] py-[9px]">
      <Text className="font-barlow text-[13px] text-textSecondary">{copy}</Text>
    </View>
  )
}
