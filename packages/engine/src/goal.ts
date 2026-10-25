import { roundTo } from "./round"
import { addDays, type LogDay } from "./time"
import { latestTrend, trendChangeOverDays, type TrendPoint } from "./trend"

/**
 * Progress toward a goal weight, and where the current rate leads.
 *
 * Everything here works off the **trend**, never a raw reading. A goal ETA
 * computed from two scale readings would swing by weeks on a salty dinner, and
 * presenting that as a date is worse than showing nothing.
 */

/** Days of trend history used to measure the current rate. */
const DEFAULT_RATE_WINDOW_DAYS = 14

/** How far ahead a projection will ever run. */
const MAX_PROJECTION_DAYS = 365

const KG_DECIMALS = 2

export type GoalProgress = {
  /** The first trend value on record — where the journey started. */
  startKg: number
  /** The most recent trend value. */
  currentKg: number
  goalKg: number
  /** Signed: positive means there is still ground to cover. */
  remainingKg: number
  /**
   * Share of the distance from start to goal already covered, 0–1.
   *
   * Clamped, unlike the macro rings. A macro ring past 1 means "over target",
   * which is information; a goal ring past 1 would just mean the user sailed
   * past their goal, and drawing 130% of a circle says nothing a full circle
   * doesn't. Reaching the goal is the end of this particular story.
   */
  progress: number
}

/**
 * How far through the journey from the first weigh-in to the goal.
 *
 * Returns null before there is any history. Works in either direction: a user
 * gaining toward a heavier goal gets the same 0–1 progress as one losing.
 */
export function goalProgress(
  series: readonly TrendPoint[],
  goalKg: number,
): GoalProgress | null {
  const first = series[0]
  const last = latestTrend(series)
  if (!first || !last) return null

  const startKg = first.trend
  const currentKg = last.trend
  const total = startKg - goalKg
  const covered = startKg - currentKg

  // Start already at the goal: there is no distance to be a fraction of.
  // Treat it as arrived rather than dividing by zero.
  const progress = total === 0 ? 1 : covered / total

  return {
    startKg,
    currentKg,
    goalKg,
    remainingKg: roundTo(currentKg - goalKg, KG_DECIMALS),
    progress: roundTo(Math.min(1, Math.max(0, progress)), 4),
  }
}

/**
 * Which way a change moved relative to the goal.
 *
 * `unchanged` is a real third answer, not a rounding artefact: a week that ends
 * exactly where it started has not gone the wrong way, and colouring it red
 * would be a lie about a week the user probably did fine in.
 */
export type GoalDirection = "toward" | "away" | "unchanged"

/**
 * Did the trend close the gap to the goal, or open it?
 *
 * ## Why this is not `delta < 0`
 *
 * Green-for-down is wrong for anyone gaining toward a target. The dashboard
 * shows this as a colour — `ok` or `danger` — and the sign of the change cannot
 * decide it, because whether "up" is good depends entirely on which side of the
 * goal you are standing. Someone 5 kg under their target gaining 0.4 kg had a
 * good week, and an app that paints that red is telling them to stop doing the
 * thing that is working.
 *
 * ## Why it lives here
 *
 * It was `Math.abs(change.to.trend - goalKg) < Math.abs(change.from.trend - goalKg)`,
 * written out twice — once in `WeightTrendCard` and once in `InsightsSection` —
 * with no test behind either copy. Caught by the Standards axis of
 * `/nutrisa-review`, 2026-08-15: a derived fact about the user's data, computed
 * in a component. Two copies of a comparison is how two surfaces end up
 * disagreeing about the same week, and they sit one card apart on the same
 * screen.
 */
export function goalDirection(
  from: number,
  to: number,
  goalKg: number,
): GoalDirection {
  const before = Math.abs(from - goalKg)
  const after = Math.abs(to - goalKg)

  if (after < before) return "toward"
  if (after > before) return "away"
  return "unchanged"
}

/**
 * Which way a **rate** is carrying you, relative to the goal.
 *
 * `goalDirection` answers that for a change that already happened, between two
 * measured trend values. A rate is the other shape of the same question: not
 * "where did you get to" but "where does one more week of this put you".
 *
 * ## Why this is a function and not a `+` in the component
 *
 * The Weight tab paints the weekly rate the same colour it paints the seven-day
 * change, and reaching `goalDirection` needs a second point — `currentKg +
 * ratePerWeek`. Written at the call site that is a derived number about the
 * user's data computed in a component, which is the first standing rule, and
 * it is exactly the shape of thing `/nutrisa-review` found in `WeightTrendCard`
 * on 2026-08-15. The addition is one character; the rule is not about the
 * character.
 *
 * A rate of zero is `unchanged`, which falls out of `goalDirection` rather than
 * being special-cased here: standing still is neither progress nor a setback.
 */
export function rateDirection(
  currentKg: number,
  ratePerWeek: number,
  goalKg: number,
): GoalDirection {
  return goalDirection(currentKg, currentKg + ratePerWeek, goalKg)
}

export type ProjectionPoint = { day: LogDay; trend: number }

export type Projection = {
  /** Signed kg per week, measured over the rate window. Negative is a loss. */
  ratePerWeek: number
  /**
   * The projected trend, one point per day, starting the day **after** the last
   * real point. Empty if there is not enough history to measure a rate.
   */
  points: ProjectionPoint[]
  /** The day the goal is reached, or null if this rate never gets there. */
  goalDay: LogDay | null
  /** Days from the last real point to `goalDay`. */
  daysToGoal: number | null
}

export type ProjectionOptions = {
  /** The goal to solve for. Omit to get the line without an ETA. */
  goalKg?: number
  /** Trend history used to measure the rate. Default 14 days. */
  rateWindowDays?: number
  /** How many days of line to return. Default 30. */
  forDays?: number
}

/**
 * Straight-line projection of the trend at its recent rate.
 *
 * The rate is measured over 14 days by default rather than the 7 the dashboard
 * displays. Seven days is the right thing to *show* — it answers "how did this
 * week go" — but it is a noisy basis for a line drawn weeks into the future,
 * where a single odd week visibly bends the whole projection.
 *
 * Straight-line on purpose. Real weight loss decelerates as maintenance
 * calories fall with bodyweight, so a linear projection runs slightly
 * optimistic over long horizons. Modelling that properly needs TDEE, which
 * needs profile fields that are still empty — and a wrong curve looks more
 * authoritative than an honest straight line. This is the projection the
 * dashboard's dashed amber line draws, and dashed is the point: it is a guess.
 */
export function projectTrend(
  series: readonly TrendPoint[],
  options: ProjectionOptions = {},
): Projection {
  const {
    goalKg,
    rateWindowDays = DEFAULT_RATE_WINDOW_DAYS,
    forDays = 30,
  } = options

  const last = latestTrend(series)
  const none: Projection = {
    ratePerWeek: 0,
    points: [],
    goalDay: null,
    daysToGoal: null,
  }
  if (!last) return none

  // Falls back to a shorter window so a user two weeks in still gets a line,
  // rather than nothing until the full window fills.
  const change =
    trendChangeOverDays(series, rateWindowDays) ?? trendChangeOverDays(series, 7)
  if (!change) return none

  const spanDays = Math.max(
    1,
    Math.round(
      (Date.parse(`${change.to.day}T00:00:00.000Z`) -
        Date.parse(`${change.from.day}T00:00:00.000Z`)) /
        86_400_000,
    ),
  )
  const perDay = change.delta / spanDays
  const ratePerWeek = roundTo(perDay * 7, KG_DECIMALS)

  const days = Math.max(0, Math.min(forDays, MAX_PROJECTION_DAYS))
  const points: ProjectionPoint[] = []
  for (let offset = 1; offset <= days; offset++) {
    points.push({
      day: addDays(last.day, offset),
      trend: roundTo(last.trend + perDay * offset, KG_DECIMALS),
    })
  }

  if (goalKg === undefined) return { ratePerWeek, points, goalDay: null, daysToGoal: null }

  const distance = goalKg - last.trend

  // Already there.
  if (roundTo(distance, KG_DECIMALS) === 0) {
    return { ratePerWeek, points, goalDay: last.day, daysToGoal: 0 }
  }
  // Flat, or moving the wrong way. Saying "never" is honest; extrapolating a
  // date out of a rate pointing away from the goal is not.
  if (perDay === 0 || Math.sign(perDay) !== Math.sign(distance)) {
    return { ratePerWeek, points, goalDay: null, daysToGoal: null }
  }

  const daysToGoal = Math.ceil(distance / perDay)
  if (daysToGoal > MAX_PROJECTION_DAYS) {
    // Reachable in principle, but a date more than a year out is noise.
    return { ratePerWeek, points, goalDay: null, daysToGoal: null }
  }

  return { ratePerWeek, points, goalDay: addDays(last.day, daysToGoal), daysToGoal }
}
