import { useState } from "react"
import { Text, View } from "react-native"
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg"

import { addDays, daysBetween, evenlySpaced, niceScale, type LogDay } from "@engine"
import type { WeightSeries } from "@shared"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { Empty, ErrorState, Loading } from "@/components/state"
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown"
import { formatDayShort, formatKg } from "@/lib/format"
import { useWeightSeries } from "@/lib/queries"
import { colors } from "@/design/tokens"

const PAD_LEFT = 30 // gutter for the kg labels
const PAD_RIGHT = 10
const PAD_TOP = 8
const PLOT_HEIGHT = 150
const X_LABEL_BASELINE = PAD_TOP + PLOT_HEIGHT + 22
const CHART_HEIGHT = X_LABEL_BASELINE + 8

// react-native-svg takes colour values, not classNames — see src/design/tokens.ts.
const AXIS = colors.textSecondary
const DOT = colors.dotMuted
const TREND = colors.primary
const PROJECTION = colors.amber
const GOAL = colors.ok
const AXIS_FONT = "Barlow_400Regular"

/**
 * The windows the range menu offers, shortest first.
 *
 * Ascending because that is the order every chart range control is read in —
 * you scan for the one you want by narrowing, not by hunting. "All time" sits
 * at the end as the escape hatch rather than the default.
 *
 * A **custom date range** is wanted and deliberately not here: Sriman's call on
 * 2026-08-15 was to add it later. It is a date-picker surface with its own
 * validation (no future dates, nothing before the first logged day — the bounds
 * `checkLogDate` already expresses), which is a branch, not an entry in this
 * array.
 */
const RANGES: readonly DropdownOption<number | "all">[] = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: "all", label: "All time" },
]

/**
 * Weight over the selected window: every scale reading as a dot, the smoothed
 * line through them, and where that rate lands if it holds.
 *
 * The projection is deliberately a different colour *and* dashed. Solid blue is
 * what happened; amber dashes are a guess, and the two must never be mistakeable
 * for each other at a glance.
 *
 * The chart needs a pixel width before it can place anything, so it renders
 * nothing until onLayout reports one. React Native gives that on the first
 * commit, so there is no visible blank frame.
 *
 * ## The axis is computed, not designed
 *
 * The y-ticks used to be `[92, 91, 90, 89, 88]`, typed by hand from a mock.
 * They now come from `niceScale()` in the engine, because a label on an axis is
 * a number the user reads off the screen and the standing rule puts every one
 * of those behind a tested function. Same for which dates get x-labels —
 * `evenlySpaced()`, which guarantees both ends are labelled. The right-hand end
 * is the one people read first, and picking every nth entry silently drops it
 * whenever the length is not a clean multiple.
 *
 * ## The goal line does not get a vote on the scale
 *
 * It did at first, and the real data showed why that is wrong. The goal is
 * 85.0 kg and the trend sits at 98.8, so an axis stretched to include both
 * spans 15 kg — and the 1.3 kg of movement the chart exists to show collapses
 * into a sliver at the top while most of the card draws empty space above a
 * line the user will not reach for months.
 *
 * So the scale is fitted to the trend, the readings and the projection, and the
 * goal is drawn **only when it lands inside that range**. When it does not, it
 * becomes a marker pinned to the edge it lies beyond, with an arrow — which
 * says "your goal is below this chart" honestly, in the space of one line,
 * instead of buying a rendering of it at the cost of the data.
 *
 * The distance to the goal is not lost: `goal.remainingKg` and the "% of the
 * way" progress are on the same response and belong to a surface with room for
 * them.
 */
export function WeightTrendCard() {
  const [range, setRange] = useState<number | "all">(30)

  const { data, isPending, isError, error, refetch } = useWeightSeries(range)
  const [width, setWidth] = useState(0)

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <CardLabel>WEIGHT TREND</CardLabel>
        <Dropdown
          value={range}
          options={RANGES}
          onChange={setRange}
          accessibilityLabel="Chart range"
        />
      </View>

      {data && data.latest ? <TrendSummary series={data} /> : null}

      <View
        className="mt-[14px]"
        style={{ height: CHART_HEIGHT }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {isPending ? (
          <Loading />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.points.length === 0 ? (
          /*
           * Two different nothings, and they need different words.
           *
           * `latest` is measured on the **full** history, so a non-null one
           * here means the user has weighed in before, just not inside this
           * window. Telling someone with 38 weigh-ins on record that they have
           * none would read as data loss. The other case is a genuinely new
           * user, and that one gets an invitation rather than an explanation.
           */
          data.latest ? (
            <Empty
              title="No weigh-ins in this range"
              detail="Pick a longer range, or log today's weight."
            />
          ) : (
            <Empty
              title="No weigh-ins yet"
              detail="Log your weight and the trend line starts here."
            />
          )
        ) : width > 0 ? (
          <TrendChart series={data} width={width} />
        ) : null}
      </View>
    </Card>
  )
}

/**
 * Current trend weight and the week's change, above the chart.
 *
 * The change is **trend to trend**, never raw to raw — that is done in the
 * engine and this only prints it. A raw daily weight swings on salt and water,
 * so "0.6 kg this week" computed from two scale readings is mostly noise
 * presented as progress.
 *
 * ## The colour comes from the goal, not from the sign
 *
 * Green for down and red for up is wrong for anyone gaining toward a target.
 * So the direction is judged against `goalWeightKg`: moving toward the goal is
 * `ok`, away from it is `danger`. With no goal set there is no way to know
 * which way is good, and the change is drawn in plain secondary text rather
 * than guessing — the arrow and the sign still say which way it went.
 */
function TrendSummary({ series }: { series: WeightSeries }) {
  const latest = series.latest!
  const change = series.change7d

  // Closing the gap is progress, whichever direction of travel that means.
  const goalKg = series.goal?.goalKg
  const direction =
    change && goalKg !== undefined
      ? Math.abs(change.to.trend - goalKg) < Math.abs(change.from.trend - goalKg)
        ? colors.ok
        : colors.danger
      : colors.textSecondary

  return (
    <View className="mt-[10px] flex-row items-baseline">
      <Text className="font-display text-[34px] leading-[38px] text-white">
        {formatKg(latest.trend)}
      </Text>
      <Text className="ml-[4px] font-barlow text-[15px] text-textSecondary">kg</Text>

      {change ? (
        <Text className="ml-[10px] font-barlow-semibold text-[15px]" style={{ color: direction }}>
          {change.delta > 0 ? "▲" : change.delta < 0 ? "▼" : "–"}{" "}
          {formatKg(Math.abs(change.delta))} kg this week
        </Text>
      ) : (
        <Text className="ml-[10px] font-barlow text-[15px] text-textSecondary">
          Not enough history yet
        </Text>
      )}
    </View>
  )
}

function TrendChart({ series, width }: { series: WeightSeries; width: number }) {
  const { points, projection, goalWeightKg, range } = series

  const last = points.at(-1)!

  /**
   * The x-axis spans the **window**, not the data.
   *
   * `range.from` to `range.to`, and `range.to` is today. That is the whole
   * point of the change on 2026-08-15: scaling to the data would end the axis
   * at the last weigh-in and make eleven days of not weighing in look like
   * nothing at all. Now those days are empty space on the right, which is what
   * they are.
   *
   * `range.from` is used rather than the first point for the same reason at the
   * other end — a 90-day window whose first weigh-in is 60 days old should show
   * the 30 empty days before it, not start at the data.
   */
  const from: LogDay = range.from ?? points[0]!.day
  const to: LogDay = range.to ?? last.day
  const span = Math.max(1, daysBetween(from, to))

  /**
   * The projection is clipped to today along with everything else.
   *
   * `projectTrend` returns 30 days of line, which would otherwise run well past
   * the right-hand edge and, before the axis was pinned to the window, drag the
   * whole domain into the future. What survives is the segment between the last
   * weigh-in and today — the dashed line now fills the gap rather than
   * predicting past it, which is a better use of it anyway.
   */
  const projected = (projection?.points ?? []).filter(
    (point) => daysBetween(point.day, to) >= 0,
  )

  const scale = niceScale([
    ...points.map((point) => point.trend),
    // Raw readings are drawn, so they have to fit. They swing wider than the
    // trend by definition — that is what the smoothing removes.
    ...points.flatMap((point) => (point.weight === null ? [] : [point.weight])),
    ...projected.map((point) => point.trend),
    // The goal is deliberately absent — see the note on this component.
  ])

  // `points.length === 0` is handled by the caller, so a null scale here is
  // unreachable. Returning null rather than asserting keeps it that way.
  if (!scale) return null

  const plotWidth = width - PAD_LEFT - PAD_RIGHT
  const kgRange = scale.max - scale.min

  const x = (day: LogDay) => PAD_LEFT + (daysBetween(from, day) / span) * plotWidth
  const y = (kg: number) => PAD_TOP + ((scale.max - kg) / kgRange) * PLOT_HEIGHT
  const path = (line: readonly { day: LogDay; trend: number }[]) =>
    line.map((point) => `${x(point.day)},${y(point.trend)}`).join(" ")

  /**
   * Ticks step across the **window**, not across the points.
   *
   * Taken from the points, they would all bunch into the left-hand portion the
   * data happens to occupy and leave the trailing gap unlabelled — so the empty
   * space this change exists to show would have no dates against it, and no way
   * to tell it is eleven days rather than two.
   */
  const xTicks = evenlySpaced(
    Array.from({ length: span + 1 }, (_, offset) => addDays(from, offset)),
    5,
  )

  /**
   * Where the goal sits relative to what is drawn.
   *
   * `inside` gets the full dashed line. `below` / `above` get a label pinned to
   * that edge with an arrow — the goal is real and off-screen, and saying so is
   * more use than either omitting it or distorting the axis to reach it.
   */
  const goal: { kg: number; place: "inside" | "below" | "above" } | null =
    goalWeightKg === null
      ? null
      : {
          kg: goalWeightKg,
          place:
            goalWeightKg < scale.min
              ? "below"
              : goalWeightKg > scale.max
                ? "above"
                : "inside",
        }

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      {scale.ticks.map((tick) => (
        <SvgText
          key={tick}
          x={PAD_LEFT - 8}
          y={y(tick) + 4}
          textAnchor="end"
          fontFamily={AXIS_FONT}
          fontSize={13}
          fill={AXIS}
        >
          {String(tick)}
        </SvgText>
      ))}

      {/* Goal sits under the series so a reading landing on it stays readable. */}
      {goal?.place === "inside" ? (
        <>
          <Line
            x1={PAD_LEFT}
            y1={y(goal.kg)}
            x2={width - PAD_RIGHT}
            y2={y(goal.kg)}
            stroke={GOAL}
            strokeWidth={1.5}
            strokeDasharray={[5, 4]}
          />
          <SvgText
            x={width - PAD_RIGHT}
            y={y(goal.kg) - 9}
            textAnchor="end"
            fontFamily={AXIS_FONT}
            fontSize={13}
            fill={GOAL}
          >
            {`Goal ${formatKg(goal.kg)} kg`}
          </SvgText>
        </>
      ) : goal ? (
        <SvgText
          x={width - PAD_RIGHT}
          // Just inside the plot's edge, so it reads as part of the chart
          // rather than as a caption that fell off it.
          y={goal.place === "below" ? PAD_TOP + PLOT_HEIGHT - 5 : PAD_TOP + 12}
          textAnchor="end"
          fontFamily={AXIS_FONT}
          fontSize={13}
          fill={GOAL}
        >
          {`${goal.place === "below" ? "↓" : "↑"} Goal ${formatKg(goal.kg)} kg`}
        </SvgText>
      ) : null}

      {/* Dots only on days with an actual weigh-in. The trend line runs across
          every calendar day; the scatter must not invent readings for the gaps. */}
      {points.map((point) =>
        point.weight === null ? null : (
          <Circle key={point.day} cx={x(point.day)} cy={y(point.weight)} r={2.2} fill={DOT} />
        ),
      )}

      <Polyline
        points={path(points.map((point) => ({ day: point.day, trend: point.trend })))}
        fill="none"
        stroke={TREND}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {projected.length > 0 ? (
        <Polyline
          // Anchored on the last real point, so the dashed run continues the
          // solid one instead of starting a day adrift of it.
          points={path([{ day: last.day, trend: last.trend }, ...projected])}
          fill="none"
          stroke={PROJECTION}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={[7, 6]}
        />
      ) : null}

      {xTicks.map((day) => (
        <SvgText
          key={day}
          x={x(day)}
          y={X_LABEL_BASELINE}
          textAnchor="middle"
          fontFamily={AXIS_FONT}
          fontSize={13}
          fill={AXIS}
        >
          {formatDayShort(day)}
        </SvgText>
      ))}
    </Svg>
  )
}
