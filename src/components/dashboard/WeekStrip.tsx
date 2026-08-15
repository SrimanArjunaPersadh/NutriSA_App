import { useRef } from "react"
import { ScrollView, Text, useWindowDimensions, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { addDays, currentLoggingDay, dayOfMonth, weekOf, weekdayIndex } from "@engine"
import type { LogDay } from "@engine"
import { colors } from "@/design/tokens"

/**
 * The week calendar across the top of the dashboard. Traced from
 * `src/design/home_screen_ui3.png`, then made to scroll.
 *
 * ## These dates are real
 *
 * Unlike every other number on this screen, the strip is not fixture data — it
 * comes from `currentLoggingDay()` and `weekOf()` in the engine, so it shows
 * the actual week and highlights the actual day. There is nothing to invent: a
 * calendar is a calendar whether or not the data layer exists.
 *
 * That also means the SAST boundary applies to it. At 00:40 the strip has
 * already moved to the new day, the same way a meal logged at 00:40 lands on
 * it. The day is read once per render; an app left open across midnight keeps
 * yesterday highlighted until something re-renders it, which is a real edge and
 * not worth a timer until the screen has data to refetch anyway.
 *
 * ## Why it scrolls backwards only
 *
 * The strip ends on the current week and cannot be scrolled past it. Nothing
 * lives in the future — `checkLogDate` refuses a future date outright — so
 * scrolling forward would offer empty weeks that can never hold anything. The
 * current week still shows its own remaining days greyed, because those are
 * days you are in the middle of rather than days you are being offered.
 *
 * How far back is a fixture decision. `WEEKS_SHOWN` is a quarter, which is
 * longer than the migrated history and comfortably longer than anyone scrolls
 * by hand. The real bound is the user's first logged day, which is exactly what
 * `LogDateBounds.firstLogDay` already means and is not knowable until the data
 * layer lands.
 *
 * ## Why a week is a page, and why it is a full screen wide
 *
 * Each week View is the **window width**, with the 16pt gutter applied inside
 * it, and the ScrollView snaps by that same interval. Padding the scroll
 * container instead would have put the first week at x=16 while the snap points
 * stayed at multiples of the interval, leaving every page 16pt out. Sizing the
 * page to the window and padding within it keeps the snap offsets clean
 * multiples and the day columns aligned to the cards below.
 *
 * Snapping by week rather than by day also keeps Sunday under "Sun". The
 * columns each carry their own label so per-day scrolling would not strictly
 * break, but a calendar whose rows do not start where the eye expects reads as
 * a bug long before anyone works out that it is not one.
 *
 * ## Why the ring is SVG and not a border
 *
 * `borderStyle: "dashed"` with a `borderRadius` renders solid on Android and
 * dashed on iOS. The past-day ring is dashed, so a CSS border would have made
 * yesterday look like today on half the devices this ships to.
 *
 * ## The four states
 *
 * | state | ring |
 * |---|---|
 * | today | solid, `primary` |
 * | past, logged | solid, `ok` |
 * | past, nothing logged | dashed, `buttonBorder` |
 * | future | none |
 *
 * **Logged** is the state this could not show while the screen was
 * fixture-backed, and it is the one that makes the strip worth scrolling — it
 * is the streak, laid out on a calendar. It comes from `loggedDays` on the day
 * summary, which the server bounds to the same 13 weeks this shows.
 *
 * Today keeps `primary` whether or not it is logged. Two signals compete for
 * that ring and "this is the day you are looking at" is the more useful one;
 * whether today is logged is what the flame in the header is for.
 *
 * The columns are still not pressable: switching the dashboard to another day
 * needs a date parameter threaded through the screen, and that is the branch
 * that adds day-switching, not this one. They are labelled as dates rather than
 * left as bare digits, so VoiceOver reads "Thursday 13 August, logged" instead
 * of loose numbers — but they announce as text, not as buttons that go nowhere.
 */

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** One quarter back. See the note above on what actually bounds this. */
const WEEKS_SHOWN = 13

const GUTTER = 16
const CIRCLE_SIZE = 36
const RING_STROKE = 1.5

type DayState = "past" | "logged" | "today" | "future"

const RING_STROKE_BY_STATE: Record<Exclude<DayState, "future">, string> = {
  // `primary` rather than white: it is already what the tab bar uses for the
  // current destination, so "the thing you are looking at" is one colour across
  // the app. There is deliberately no `white` token — Tailwind ships one, and a
  // second copy in the palette would be a token that exists only to be a
  // duplicate.
  today: colors.primary,
  /** Same green as a loss on the chart: this day went the right way. */
  logged: colors.ok,
  past: colors.buttonBorder,
}

function DayRing({ state }: { state: DayState }) {
  if (state === "future") return null

  const radius = (CIRCLE_SIZE - RING_STROKE) / 2

  return (
    <Svg
      width={CIRCLE_SIZE}
      height={CIRCLE_SIZE}
      style={{ position: "absolute" }}
      pointerEvents="none"
    >
      <Circle
        cx={CIRCLE_SIZE / 2}
        cy={CIRCLE_SIZE / 2}
        r={radius}
        stroke={RING_STROKE_BY_STATE[state]}
        strokeWidth={RING_STROKE}
        // 4-on-4-off reads as dashed at 36px; finer than that turns into a
        // grey halo on a retina panel and loses the distinction entirely.
        // Only the empty past day is dashed — the dashes are what make it read
        // as "nothing here" beside a solid logged one.
        strokeDasharray={state === "past" ? [4, 4] : undefined}
        fill="none"
      />
    </Svg>
  )
}

/** `2026-08-13` → `August`, or `August 2025` when it is not the current year. */
function monthLabel(day: LogDay, today: LogDay): string {
  const month = MONTH_NAMES[Number(day.slice(5, 7)) - 1]
  const year = day.slice(0, 4)
  return year === today.slice(0, 4) ? month : `${month} ${year}`
}

/**
 * The label the strip will show before anyone scrolls it.
 *
 * Exported so the dashboard header — which is where the label lives, not this
 * component — can seed its state without a frame of blank space, and without
 * having to know that "the month" means the middle of the visible week.
 */
export function currentMonthLabel(today: LogDay = currentLoggingDay()): string {
  return monthLabel(weekOf(today)[3], today)
}

/**
 * `onVisibleMonthChange` fires when scrolling brings a different month into
 * view. The label is rendered by the header rather than here, so this component
 * reports the change instead of drawing it — which also means the strip itself
 * holds no scroll state and never re-renders mid-swipe. Thirteen weeks of seven
 * columns re-rendering on every scroll event is a real cost for a string.
 */
export function WeekStrip({
  today = currentLoggingDay(),
  loggedDays,
  onVisibleMonthChange,
}: {
  today?: LogDay
  /**
   * Days carrying at least one meal. Undefined while the day summary is still
   * loading, which renders every past day as unlogged — the honest reading of
   * "we do not know yet", and it settles into the real pattern in one frame
   * without the ring changing size or the row reflowing.
   */
  loggedDays?: readonly LogDay[]
  onVisibleMonthChange?: (label: string) => void
}) {
  const { width } = useWindowDimensions()

  // A Set, because this is checked 91 times per render.
  const logged = new Set(loggedDays ?? [])
  const scroller = useRef<ScrollView>(null)
  const initialised = useRef(false)

  // Oldest week first, current week last — so the strip opens at its end and
  // scrolls back into history, which is the only direction that holds anything.
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) =>
    weekOf(addDays(today, (i - (WEEKS_SHOWN - 1)) * 7)),
  )

  const lastPage = WEEKS_SHOWN - 1
  const initialOffset = lastPage * width
  const reportedPage = useRef(lastPage)

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={width}
        decelerationRate="fast"
        // iOS honours `contentOffset` on the first render, which lands on the
        // current week with no visible jump. Android ignores it, hence the
        // one-shot scroll below — it fires before the first frame is shown in
        // practice, but it is a correction either way rather than the plan.
        contentOffset={{ x: initialOffset, y: 0 }}
        onContentSizeChange={() => {
          if (initialised.current) return
          initialised.current = true
          scroller.current?.scrollTo({ x: initialOffset, animated: false })
        }}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width)
          // Clamped because iOS reports offsets past both ends while the bounce
          // is running. Compared against a ref rather than state so a swipe
          // inside one month costs nothing at all.
          const clamped = Math.max(0, Math.min(lastPage, next))
          if (clamped === reportedPage.current) return
          reportedPage.current = clamped

          // The middle of the visible week, not its first day: a week running
          // 30 July to 5 August is mostly August, and labelling it "July"
          // because that is where it starts is the same error as labelling it
          // by where it ends.
          onVisibleMonthChange?.(monthLabel(weeks[clamped][3], today))
        }}
      >
        {weeks.map((week) => (
          <View
            key={week[0]}
            className="flex-row"
            style={{ width, paddingHorizontal: GUTTER }}
          >
            {week.map((day) => {
              const state: DayState =
                day === today
                  ? "today"
                  : day > today
                    ? "future"
                    : logged.has(day)
                      ? "logged"
                      : "past"
              const index = weekdayIndex(day)

              return (
                <View
                  key={day}
                  accessible
                  accessibilityLabel={`${WEEKDAY_NAMES[index]} ${dayOfMonth(day)} ${monthLabel(
                    day,
                    today,
                  )}${
                    state === "today" ? ", today" : state === "logged" ? ", logged" : ""
                  }`}
                  className="flex-1 items-center"
                >
                  <Text
                    className={`font-barlow-medium text-[13px] ${
                      state === "today" ? "text-white" : "text-textSecondary"
                    } ${state === "future" ? "opacity-50" : ""}`}
                  >
                    {WEEKDAY_LABELS[index]}
                  </Text>

                  <View
                    className="mt-[6px] items-center justify-center"
                    style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
                  >
                    <DayRing state={state} />
                    <Text
                      className={`font-barlow-semibold text-[16px] ${
                        state === "today" ? "text-white" : "text-textSecondary"
                      } ${state === "future" ? "opacity-50" : ""}`}
                    >
                      {dayOfMonth(day)}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
