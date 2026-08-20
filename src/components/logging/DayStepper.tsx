import { Pressable, Text, View } from "react-native"

import { addDays, currentLoggingDay, daysBetween, type LogDay } from "@engine"

import { ChevronLeft, ChevronRight } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { formatDayWithWeekday } from "@/lib/format"

/**
 * Which day you are looking at, and the two arrows that change it.
 *
 * ## This is how back-dating is reached
 *
 * plan.md, Phase 4: "Back-date a meal to a past day". There is no date picker
 * and no "log to a different day" toggle buried in the form — you step the day
 * back and log there, and the same control on the entry screen moves an
 * already-logged meal. One control, two checklist items, and the day being
 * written to is on screen the whole time rather than being something you have
 * to remember you changed.
 *
 * ## The bounds are the server's bounds
 *
 * Forward stops at today, because a day that has not started cannot be logged
 * to; back stops at 91 days, which is what `POST /meal-logs` accepts and how
 * far the dashboard's week strip scrolls. Disabling the arrow is better than
 * letting someone travel to a day the server will refuse — the refusal would
 * arrive after they had typed a meal into it.
 *
 * `MAX_BACK_DAYS` is stated here rather than imported because the server's copy
 * lives in `server/data/day.ts`, which the app bundle must not import — it
 * pulls in Drizzle and the schema. The two numbers move together; if the strip
 * ever scrolls further, all three change.
 */
const MAX_BACK_DAYS = 91

export function DayStepper({
  day,
  onChange,
}: {
  day: LogDay
  onChange: (next: LogDay) => void
}) {
  const today = currentLoggingDay()
  const isToday = day === today
  // `daysBetween` is the engine's, not a subtraction written here: the distance
  // between two calendar days is arithmetic, and it is arithmetic that gets
  // daylight-saving and month-ends wrong when it is inlined.
  const canGoBack = daysBetween(day, today) < MAX_BACK_DAYS

  return (
    <View className="flex-row items-center">
      <StepButton
        label="Previous day"
        disabled={!canGoBack}
        onPress={() => onChange(addDays(day, -1))}
      >
        <ChevronLeft
          size={18}
          color={canGoBack ? colors.textSecondary : colors.ringTrack}
        />
      </StepButton>

      <View className="flex-1 items-center">
        <Text
          className="font-barlow-semibold text-[17px] text-white"
          // Announced as one phrase. Without this VoiceOver reads the date and
          // then "Today" as two unrelated labels a swipe apart.
          accessibilityLabel={isToday ? `Today, ${formatDayWithWeekday(day)}` : formatDayWithWeekday(day)}
        >
          {formatDayWithWeekday(day)}
        </Text>
        {isToday ? (
          <Text
            accessible={false}
            className="font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-primary"
          >
            Today
          </Text>
        ) : (
          /*
            An explicit way back. Stepping forward one day at a time from three
            weeks ago is the kind of thing that makes someone close the app, and
            "Today" is also the only cue that the screen is *not* showing today
            when the date alone has not registered.
          */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jump to today"
            onPress={() => onChange(today)}
            hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
            className="active:opacity-70"
          >
            <Text className="font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-link">
              Back to today
            </Text>
          </Pressable>
        )}
      </View>

      <StepButton
        label="Next day"
        disabled={isToday}
        onPress={() => onChange(addDays(day, 1))}
      >
        <ChevronRight size={18} color={isToday ? colors.ringTrack : colors.textSecondary} />
      </StepButton>
    </View>
  )
}

/** 44×44, which is the standing minimum and is the whole size of this control. */
function StepButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string
  disabled: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-[44px] w-[44px] items-center justify-center rounded-full active:opacity-70"
    >
      {children}
    </Pressable>
  )
}
