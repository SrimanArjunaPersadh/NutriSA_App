import Svg, { Circle, Polyline } from "react-native-svg"

/**
 * The small line-with-dots chart on an insight card.
 *
 * No axes, no labels, no scale. It is a shape, not a reading — the number
 * underneath it is the number. That is why it has no y-domain worth arguing
 * about: it normalises to whatever range the series happens to span, so a 3 kg
 * move and a 30 kcal move both fill the box. Anyone who needs the real scale
 * taps through to the full chart.
 *
 * Deliberately not the same component as `WeightTrendCard`'s chart. That one
 * has a fixed domain, a goal line and a projection because it is read for
 * values; this one is read at a glance for direction.
 */

const DOT_RADIUS = 2.6
const STROKE = 2

type SparklineProps = {
  /**
   * Oldest first. Two readable points minimum; fewer renders nothing.
   *
   * **`null` means the day carries no log**, and it is not the same as 0. A
   * skipped day drawn as zero is a fast day that never happened, and on a
   * seven-point line one of those drags the whole shape to the floor. Nulls
   * hold their x-position and break the line instead — the gap is the honest
   * picture of a day you did not track.
   */
  values: readonly (number | null)[]
  color: string
  width: number
  height: number
}

/**
 * Consecutive runs of readable values, each carrying its original index so the
 * x-positions stay on the true calendar spacing rather than closing up.
 */
function segmentsOf(
  values: readonly (number | null)[],
): { index: number; value: number }[][] {
  const segments: { index: number; value: number }[][] = []
  let current: { index: number; value: number }[] = []

  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    current.push({ index, value })
  })
  if (current.length > 0) segments.push(current)

  return segments
}

export function Sparkline({ values, color, width, height }: SparklineProps) {
  const readable = values.filter((value): value is number => value !== null)

  // onLayout reports 0 on the first commit, and a flat series would divide by
  // zero below. Both are ordinary, not errors.
  if (width <= 0 || readable.length < 2) return null

  const min = Math.min(...readable)
  const max = Math.max(...readable)
  // A flat series sits on the centre line rather than collapsing onto the top
  // edge, which is what dividing by a zero range would do.
  const range = max - min || 1

  // Inset by the dot radius so the first and last markers are not clipped in
  // half by the SVG's own bounds.
  const left = DOT_RADIUS
  const right = width - DOT_RADIUS
  const top = DOT_RADIUS
  const bottom = height - DOT_RADIUS

  // Divided by the full length, not by the readable count, so a gap leaves a
  // gap. Guarded against a single-slot series, which cannot reach here anyway.
  const lastIndex = Math.max(1, values.length - 1)
  const x = (index: number) => left + (index / lastIndex) * (right - left)
  const y = (value: number) => bottom - ((value - min) / range) * (bottom - top)

  const segments = segmentsOf(values)

  return (
    <Svg width={width} height={height}>
      {segments.map((segment, segmentIndex) => (
        <Polyline
          key={segmentIndex}
          points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {segments.flat().map((point) => (
        <Circle
          key={point.index}
          cx={x(point.index)}
          cy={y(point.value)}
          r={DOT_RADIUS}
          fill={color}
        />
      ))}
    </Svg>
  )
}
