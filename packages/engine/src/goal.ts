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
