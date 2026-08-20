import { Pressable, Text, View } from "react-native"

import type { Macros } from "@shared"

import { ArrowDownIcon, CalendarIcon, CloseIcon } from "@/components/icons/UiIcons"
import { formatKcal } from "@/lib/format"

/**
 * The header row from `src/design/nutrition_ui.png`: two round buttons, the
 * day's calorie count in a pill, a cluster of what has been logged, and a round
 * button on the right.
 *
 * ## The pill is the whole point of this row
 *
 * "0 / 2476" is consumed over target, and it is the one number on the screen
 * that is about *you* rather than about food you might add. It sits dead centre
 * with the controls pushed to the edges, which is why the reference reads as a
 * logging screen rather than a search screen.
 *
 * Both figures come from `GET /day/:date` — `consumed` is the engine's
 * `dayTotals`, `targets` is `resolveTargetForDate`. Nothing here divides them
 * or works out a remainder; the slash is punctuation.
 *
 * ## Three of these five controls are not wired yet
 *
 * Marked `disabled` in `accessibilityState` rather than left looking live, the
 * same way `QuickActionBar` handles its three. A control that responds to a tap
 * by doing nothing is worse than one that says it is not ready — VoiceOver
 * announces the difference, and so does the lack of a press state.
 */

const CIRCLE = "h-[38px] w-[38px] items-center justify-center rounded-full bg-secondary"

export function NutritionHeader({
  consumed,
  targets,
  mealCount,
  onOpenCalendar,
  calendarOpen,
}: {
  consumed: Macros | undefined
  targets: Macros | null | undefined
  /** How many meals the day carries. Drives the "+N" cluster on the right. */
  mealCount: number
  onOpenCalendar: () => void
  calendarOpen: boolean
}) {
  return (
    <View className="flex-row items-center px-[12px]">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityState={{ disabled: true }}
        disabled
        className={CIRCLE}
      >
        <CloseIcon size={17} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={calendarOpen ? "Hide the day picker" : "Change the day"}
        accessibilityState={{ expanded: calendarOpen }}
        onPress={onOpenCalendar}
        className={`${CIRCLE} ml-[8px] active:opacity-70`}
      >
        <CalendarIcon size={17} />
      </Pressable>

      {/*
        Centred by the two flexible gaps either side of it rather than by a
        fixed width, so the pill stays put as the numbers get wider — 0 / 2476
        and 1,840 / 2,476 must not move the buttons at the edges.
      */}
      <View className="flex-1 items-center">
        <View className="h-[38px] flex-row items-center rounded-full bg-secondary px-[18px]">
          <Text
            className="font-barlow-medium text-[15px] text-white"
            accessibilityLabel={
              targets
                ? `${formatKcal(consumed?.kcal ?? 0)} of ${formatKcal(targets.kcal)} calories`
                : `${formatKcal(consumed?.kcal ?? 0)} calories`
            }
          >
            {formatKcal(consumed?.kcal ?? 0)}
            <Text className="text-textSecondary">
              {targets ? ` / ${formatKcal(targets.kcal)}` : ""}
            </Text>
          </Text>
        </View>
      </View>

      {/*
        The reference shows overlapping food avatars and a "+10". There is no
        per-meal image to draw, so this reports the real count and nothing else.
        Drawing two invented avatars beside a real number would be the one thing
        on this screen that is decorative rather than informative.
      */}
      {mealCount > 0 ? (
        <View className="mr-[8px] h-[38px] flex-row items-center rounded-full bg-secondary px-[12px]">
          <Text
            className="font-barlow-medium text-[14px] text-textSecondary"
            accessibilityLabel={`${mealCount} ${mealCount === 1 ? "meal" : "meals"} logged`}
          >
            {mealCount} logged
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More"
        accessibilityState={{ disabled: true }}
        disabled
        className={CIRCLE}
      >
        <ArrowDownIcon size={17} />
      </Pressable>
    </View>
  )
}
