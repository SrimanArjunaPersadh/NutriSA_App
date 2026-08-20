import { View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import type { MacroShares } from "@engine"

import { colors } from "@/design/tokens"

/**
 * The big ring from `src/design/nutrition_ui2.png`: one donut, split into three
 * coloured arcs, with the unfilled remainder left as track.
 *
 * ## Why this is not `ProgressRing`
 *
 * `ProgressRing` draws **one** arc in one colour and is right for the three
 * mini rings beside it. This draws three arcs end to end, and the difference is
 * not cosmetic — a single-colour ring answers "how far through the day am I",
 * while this one also answers "where did that energy come from", which is the
 * question the reference's ring is clearly posing by having three colours in
 * it.
 *
 * ## How the arcs are laid out
 *
 * `filled` is how much of the ring the day has earned — the engine's
 * `progress.kcal`, from `GET /day/:date`. `shares` is how that filled portion
 * splits between protein, carbs and fat — the engine's `macroEnergyShares`.
 * Neither is computed here. This file turns two sets of fractions into
 * `strokeDasharray` values and nothing else.
 *
 * Each arc is a full circle with a dash pattern of "draw this much, then gap
 * forever", offset so it begins where the previous one ended. That is cheaper
 * and steadier than building three `Path` arcs by hand, and it inherits
 * `ProgressRing`'s trick of rotating the whole `<Svg>` a quarter turn so 12
 * o'clock is zero.
 *
 * ## Over target
 *
 * `filled` is clamped to 1. Past the target the ring is simply full — the
 * dashboard's calories hero is the surface that says "over" in words and in
 * `danger`, and a ring that wrapped a second time would read as a smaller
 * number than it is.
 */

/** Drawn in the app's one macro order. See `MacrosCard.tsx`. */
const ARCS = [
  { key: "protein", color: colors.protein },
  { key: "carbs", color: colors.carbs },
  { key: "fat", color: colors.fats },
] as const satisfies readonly { key: keyof MacroShares; color: string }[]

export function CalorieDonut({
  size,
  strokeWidth,
  filled,
  shares,
  children,
}: {
  size: number
  strokeWidth: number
  /** 0–1, the engine's `progress.kcal`. Clamped, never wrapped. */
  filled: number
  shares: MacroShares
  children?: React.ReactNode
}) {
  const centre = size / 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = Math.max(0, Math.min(1, filled)) * circumference

  /**
   * Where each arc starts, accumulated as the list is walked. A plain loop
   * rather than a `reduce` into an array of offsets, because the offset of arc
   * *n* is the sum of the lengths before it and that reads better as a running
   * total than as an index arithmetic expression.
   */
  let consumed = 0
  const segments = ARCS.map((arc) => {
    const length = total * shares[arc.key]
    const offset = consumed
    consumed += length
    return { ...arc, length, offset }
  })

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={colors.ringTrack}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {segments.map((segment) =>
          // A zero-length arc is skipped rather than drawn: `strokeLinecap`
          // "round" turns a zero-length dash into a visible dot, so a day with
          // no fat would show a stray teal pip at the join.
          segment.length > 0 ? (
            <Circle
              key={segment.key}
              cx={centre}
              cy={centre}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={[segment.length, circumference]}
              // Negative, because the dash pattern advances anticlockwise from
              // the offset. This is the same sign convention `ProgressRing`
              // uses in reverse, and getting it wrong draws the arcs in the
              // right sizes and the wrong places.
              strokeDashoffset={-segment.offset}
              fill="none"
            />
          ) : null,
        )}
      </Svg>
      {children}
    </View>
  )
}
