import { useState } from "react"
import { View } from "react-native"
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg"

import {
  addDays,
  daysBetween,
  evenlySpaced,
  niceScale,
  type LogDay,
} from "@engine"
import type { WeightSeries } from "@shared"

import { formatDayShort, formatDayWithWeekday, formatKg } from "@/lib/format"
import { colors } from "@/design/tokens"

/**
 * The weight chart itself, with no card around it.
 *
 * Extracted from `WeightTrendCard` on `weight-and-trend` so the Weight tab can
 * draw the same chart at its own size. It was nearly copied instead, and three
 * decisions are the reason it was not: the goal-off-scale rule, the axis that
 * spans the window rather than the data, and the projection clipping. Each was
 * expensive to get right once.
 *
 * Everything below is presentation. Every number it draws — the trend, the
 * projection, the tick values, which dates get labels — arrives already
 * computed, from the engine or from the API. Nothing here calculates a value
 * the user reads; it decides where on a canvas an already-decided number goes.
 */

const PAD_LEFT = 30 // gutter for the kg labels
const PAD_RIGHT = 10
const PAD_TOP = 8
/** Plot height for the dashboard card. The Weight tab passes its own. */
export const DEFAULT_PLOT_HEIGHT = 150
/** Room under the plot for the date labels, and their descenders. */
const X_LABEL_GAP = 22
const X_LABEL_BOTTOM = 8

/** Total SVG height for a given plot height, date labels included. */
export function chartHeight(plotHeight: number): number {
  return PAD_TOP + plotHeight + X_LABEL_GAP + X_LABEL_BOTTOM
}

// react-native-svg takes colour values, not classNames — see src/design/tokens.ts.
const AXIS = colors.textSecondary
const DOT = colors.dotMuted
const TREND = colors.primary
const PROJECTION = colors.amber
const GOAL = colors.ok
const AXIS_FONT = "Barlow_400Regular"
const TIP_FONT = "Barlow_500Medium"
const TIP_FILL = colors.secondary
const TIP_BORDER = colors.buttonBorder
const TIP_TEXT = colors.white
const TIP_MUTED = colors.textSecondary
const SCRUB_LINE = colors.buttonBorder

/** Readout box geometry. Wide enough for "Weighed 100.0 kg" at 13pt. */
const TIP_WIDTH = 138
const TIP_LINE = 16

/**
 * Weight over the selected window: every scale reading as a dot, the smoothed
 * line through them, and where that rate lands if it holds.
 *
 * The projection is deliberately a different colour *and* dashed. Solid blue is
 * what happened; amber dashes are a guess, and the two must never be
 * mistakeable for each other at a glance.
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
 * It did at first, and the real data showed why that is wrong. When the goal is
 * many kilograms from the current trend — which is the normal case at the start
 * of a cut — an axis stretched to include both spans that entire distance, and
 * the kilogram or two of movement the chart exists to show collapses into a
 * sliver at one edge while most of the card draws empty space around a line the
 * user will not reach for months.
 *
 * So the scale is fitted to the trend, the readings and the projection, and the
 * goal is drawn **only when it lands inside that range**. When it does not, it
 * becomes a marker pinned to the edge it lies beyond, with an arrow — which
 * says "your goal is below this chart" honestly, in the space of one line,
 * instead of buying a rendering of it at the cost of the data.
 *
 * The distance to the goal is not lost: `goal.remainingKg` and the "% of the
 * way" progress are on the same response, and the Weight tab shows both.
 */
export function TrendChart({
  series,
  width,
  plotHeight = DEFAULT_PLOT_HEIGHT,
  scrubbable = false,
}: {
  series: WeightSeries
  width: number
  plotHeight?: number
  /**
   * Drag along the chart to read one day at a time.
   *
   * Off by default, and deliberately off on the dashboard card. That card is a
   * summary you tap to get here — making it scrub would put a gesture on a
   * 150pt chart that competes with the tap, and claim the touch away from the
   * dashboard's own scrolling for no gain. The Weight tab's 200pt chart is the
   * one people came to read.
   */
  scrubbable?: boolean
}) {
  const { points, projection, goalWeightKg, range } = series

  /**
   * Which day the finger is on, or `null` when nobody is touching the chart.
   *
   * The readout is transient by design: it appears under the finger and leaves
   * on release, rather than latching. A latched readout becomes stale furniture
   * the moment you scroll away from it, and there is already a permanent,
   * tappable list of every weigh-in below.
   */
  const [activeDay, setActiveDay] = useState<LogDay | null>(null)

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

  const height = chartHeight(plotHeight)
  const xLabelBaseline = PAD_TOP + plotHeight + X_LABEL_GAP
  const plotWidth = width - PAD_LEFT - PAD_RIGHT
  const kgRange = scale.max - scale.min

  const x = (day: LogDay) => PAD_LEFT + (daysBetween(from, day) / span) * plotWidth
  const y = (kg: number) => PAD_TOP + ((scale.max - kg) / kgRange) * plotHeight
  const path = (line: readonly { day: LogDay; trend: number }[]) =>
    line.map((point) => `${x(point.day)},${y(point.trend)}`).join(" ")

  /**
   * The point nearest a touch, snapped to a real day.
   *
   * It snaps to the closest **point** rather than converting the x back into a
   * date, because the axis spans the window and the window can start before the
   * first weigh-in. Reading a bare date off the x-axis would happily return a
   * day the series has no entry for, and the readout would blink empty over the
   * leading gap instead of holding at the first real day.
   *
   * Selection, not calculation: it decides *which* already-computed point to
   * show. Every number in the readout is transcribed from that point.
   */
  const dayNearest = (locationX: number): LogDay => {
    const offset = ((locationX - PAD_LEFT) / plotWidth) * span

    let best = points[0]!
    let bestDistance = Infinity
    for (const point of points) {
      const distance = Math.abs(daysBetween(from, point.day) - offset)
      if (distance < bestDistance) {
        bestDistance = distance
        best = point
      }
    }
    return best.day
  }

  const active = activeDay === null ? null : (points.find((p) => p.day === activeDay) ?? null)

  /**
   * The readout box, clamped inside the plot.
   *
   * `Math.max` wraps the `Math.min` rather than the other way round so that the
   * left edge wins when the chart is narrower than the box — off the right is
   * recoverable by reading less, off the left clips the date.
   */
  const tip =
    active === null
      ? null
      : {
          x: Math.max(
            PAD_LEFT,
            Math.min(x(active.day) - TIP_WIDTH / 2, width - PAD_RIGHT - TIP_WIDTH),
          ),
          y: PAD_TOP + 4,
          height: 12 + (active.weight === null ? 2 : 3) * TIP_LINE,
        }

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

  const chart = (
    <Svg width={width} height={height}>
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
          y={goal.place === "below" ? PAD_TOP + plotHeight - 5 : PAD_TOP + 12}
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
          y={xLabelBaseline}
          textAnchor="middle"
          fontFamily={AXIS_FONT}
          fontSize={13}
          fill={AXIS}
        >
          {formatDayShort(day)}
        </SvgText>
      ))}

      {/* The scrub readout sits above everything — it is the thing being read. */}
      {active && tip ? (
        <>
          <Line
            x1={x(active.day)}
            y1={PAD_TOP}
            x2={x(active.day)}
            y2={PAD_TOP + plotHeight}
            stroke={SCRUB_LINE}
            strokeWidth={1}
          />

          {/* The raw reading first, so the trend dot stays on top where they
              coincide — the trend is the number this chart is about. */}
          {active.weight === null ? null : (
            <Circle cx={x(active.day)} cy={y(active.weight)} r={3.5} fill={DOT} />
          )}
          <Circle
            cx={x(active.day)}
            cy={y(active.trend)}
            r={4.5}
            fill={TREND}
            stroke={colors.ground}
            strokeWidth={1.5}
          />

          <Rect
            x={tip.x}
            y={tip.y}
            width={TIP_WIDTH}
            height={tip.height}
            rx={8}
            fill={TIP_FILL}
            stroke={TIP_BORDER}
            strokeWidth={1}
          />
          <SvgText
            x={tip.x + 10}
            y={tip.y + 17}
            fontFamily={TIP_FONT}
            fontSize={13}
            fill={TIP_MUTED}
          >
            {formatDayWithWeekday(active.day)}
          </SvgText>
          <SvgText
            x={tip.x + 10}
            y={tip.y + 17 + TIP_LINE}
            fontFamily={TIP_FONT}
            fontSize={13}
            fill={TREND}
          >
            {`Trend ${formatKg(active.trend)} kg`}
          </SvgText>
          {active.weight === null ? null : (
            <SvgText
              x={tip.x + 10}
              y={tip.y + 17 + TIP_LINE * 2}
              fontFamily={TIP_FONT}
              fontSize={13}
              fill={TIP_TEXT}
            >
              {`Weighed ${formatKg(active.weight)} kg`}
            </SvgText>
          )}
        </>
      ) : null}
    </Svg>
  )

  if (!scrubbable) return chart

  /**
   * The touch surface.
   *
   * `onResponderTerminationRequest` returns false so the surrounding ScrollView
   * cannot take the gesture back mid-drag — without it, a scrub that wanders a
   * few points vertically is stolen by the scroll and the readout vanishes
   * under the finger.
   */
  return (
    <View
      accessibilityLabel="Weight trend chart. Drag across it to read each day."
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => setActiveDay(dayNearest(event.nativeEvent.locationX))}
      onResponderMove={(event) => setActiveDay(dayNearest(event.nativeEvent.locationX))}
      onResponderRelease={() => setActiveDay(null)}
      onResponderTerminate={() => setActiveDay(null)}
    >
      {chart}
    </View>
  )
}
