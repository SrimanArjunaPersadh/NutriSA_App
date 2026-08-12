import { roundTo } from "./round"
import { addDays, daysBetween, type LogDay } from "./time"

/**
 * Trend weight — an exponentially weighted moving average over bodyweight.
 *
 *     tw[0] = w[0]
 *     tw[i] = round(0.1 * w[i] + 0.9 * tw[i-1], 2)
 *
 * Rounded to two decimals **at every step** and fed forward, not rounded once
 * at the end. Rounding per step is what the recorded history did, and the two
 * approaches drift apart over a long series.
 *
 * ## The series steps once per calendar day, not once per weigh-in
 *
 * **This was verified against the real data on 2026-08-12 and it contradicted
 * the spec.** The spec stated per-logged-row as its hypothesis and told us to
 * confirm it first; the two readings put the final trend at 98.25 kg (per row)
 * against 98.84 kg (per day), and Sriman confirmed the old app showed the
 * latter. Per calendar day it is.
 *
 * A day with no weigh-in reuses the last known reading, so the trend keeps
 * easing toward it instead of pausing. Across the 37-day gap in the history
 * (2026-06-17 → 2026-07-24) that is 37 steps rather than one, and 0.9^37 is
 * 0.02 — the trend converges almost entirely onto the pre-gap weight before the
 * next real reading lands. That is the behaviour being reproduced, not a
 * side effect to be smoothed away.
 *
 * The practical consequence: **the returned series has one entry per calendar
 * day**, and only some of them carry a raw reading. The chart draws a
 * continuous trend line from every entry and plots dots only where `weight` is
 * non-null.
 */

const SMOOTHING = 0.1
const TREND_DECIMALS = 2

export type WeightEntry = {
  day: LogDay
  /** Raw scale reading in kg. */
  weight: number
}

export type TrendPoint = {
  day: LogDay
  /**
   * The raw reading for this day, or null on a day the user did not weigh in.
   * Null days still take a trend step — see the module note.
   */
  weight: number | null
  /** Smoothed weight in kg. This is the number shown as progress. */
  trend: number
}

/**
 * Builds the trend series from raw weigh-ins.
 *
 * Input is copied and sorted before use, so callers may pass rows straight out
 * of a query without depending on its ORDER BY. Two entries on the same day
 * would be ambiguous, and the `(user_id, date)` unique constraint on
 * `weight_logs` prevents it at the only layer that can; if one slips through,
 * the later entry in sorted order wins rather than both taking a step.
 */
export function trendWeightSeries(entries: readonly WeightEntry[]): TrendPoint[] {
  if (entries.length === 0) return []

  const ordered = [...entries].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  // Last write wins for a duplicated day, matching what the DB would hold.
  const readings = new Map<LogDay, number>()
  for (const entry of ordered) readings.set(entry.day, entry.weight)

  const firstDay = ordered[0]!.day
  const lastDay = ordered.at(-1)!.day
  const span = daysBetween(firstDay, lastDay)

  const series: TrendPoint[] = []
  let previousTrend = ordered[0]!.weight
  let lastKnownWeight = ordered[0]!.weight

  for (let offset = 0; offset <= span; offset++) {
    const day = addDays(firstDay, offset)
    const reading = readings.get(day) ?? null
    if (reading !== null) lastKnownWeight = reading

    const trend =
      offset === 0
        ? lastKnownWeight
        : roundTo(
            SMOOTHING * lastKnownWeight + (1 - SMOOTHING) * previousTrend,
            TREND_DECIMALS,
          )

    series.push({ day, weight: reading, trend })
    previousTrend = trend
  }

  return series
}

/** The most recent point, or null before the first weigh-in. */
export function latestTrend(series: readonly TrendPoint[]): TrendPoint | null {
  return series.length > 0 ? series[series.length - 1]! : null
}

/** Only the days the user actually weighed in — the chart's scatter dots. */
export function loggedPoints(series: readonly TrendPoint[]): TrendPoint[] {
  return series.filter((point) => point.weight !== null)
}

export type TrendChange = {
  /** Signed kg. Negative is a loss. */
  delta: number
  from: TrendPoint
  to: TrendPoint
}

/**
 * Change in **trend** weight across a window ending at the latest point.
 *
 * Deliberately trend-to-trend, never raw-to-raw. A raw daily weight swings on
 * salt, water and time of day, so "you lost 0.9 kg this week" computed from two
 * scale readings is mostly noise presented as progress — the exact thing the
 * "trust the trend, not the point" rule exists to stop.
 *
 * Now that the series is per calendar day, the cutoff day is present whenever
 * the window fits inside the history, so this is an exact lookup rather than a
 * search. It still walks back to the nearest earlier point, which is what makes
 * a window longer than the history return null instead of a wrong number.
 */
export function trendChangeOverDays(
  series: readonly TrendPoint[],
  days: number,
): TrendChange | null {
  const to = latestTrend(series)
  if (!to || series.length < 2) return null

  const cutoff = addDays(to.day, -days)

  let from: TrendPoint | null = null
  for (const point of series) {
    if (point.day <= cutoff) from = point
    else break
  }
  if (!from || from.day === to.day) return null

  return { delta: roundTo(to.trend - from.trend, TREND_DECIMALS), from, to }
}
