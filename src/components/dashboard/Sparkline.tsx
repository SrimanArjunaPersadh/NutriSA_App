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
  /** Oldest first. Two points minimum; fewer renders nothing. */
  values: readonly number[]
  color: string
  width: number
  height: number
}

export function Sparkline({ values, color, width, height }: SparklineProps) {
  // onLayout reports 0 on the first commit, and a flat series would divide by
  // zero below. Both are ordinary, not errors.
  if (width <= 0 || values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series sits on the centre line rather than collapsing onto the top
  // edge, which is what dividing by a zero range would do.
  const range = max - min || 1

  // Inset by the dot radius so the first and last markers are not clipped in
  // half by the SVG's own bounds.
  const left = DOT_RADIUS
  const right = width - DOT_RADIUS
  const top = DOT_RADIUS
  const bottom = height - DOT_RADIUS

  const x = (index: number) =>
    left + (index / (values.length - 1)) * (right - left)
  const y = (value: number) => bottom - ((value - min) / range) * (bottom - top)

  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ")

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((value, index) => (
        <Circle
          key={index}
          cx={x(index)}
          cy={y(value)}
          r={DOT_RADIUS}
          fill={color}
        />
      ))}
    </Svg>
  )
}
