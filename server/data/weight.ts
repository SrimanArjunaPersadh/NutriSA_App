import { asc } from "drizzle-orm"

import {
  addDays,
  currentLoggingDay,
  daysBetween,
  goalProgress,
  latestTrend,
  projectTrend,
  trendChangeOverDays,
  trendWeightSeries,
  type LogDay,
  type TrendPoint,
} from "@engine"
import type { WeightRange, WeightSeries } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { profiles, weightLogs } from "../db/schema"
import { selectOwned } from "./scoped"

/**
 * The weight series behind the trend chart, the trend card and the weight
 * insight tile.
 *
 * ## The window narrows what is drawn, never what is computed
 *
 * This is the one thing that is easy to get wrong here and impossible to
 * notice afterwards. The trend is an exponentially weighted average — every
 * point carries the whole history forward. Fetching only the last 30 days and
 * running the engine over that would seed `tw[0] = w[0]` at the window's left
 * edge, and 0.9^30 is 0.04, so the line would still be visibly converging out
 * of a wrong start most of the way across the chart. The user reads the current
 * trend weight off the right-hand end of it.
 *
 * So: the engine runs over **everything**, and the slice happens afterwards.
 * `goal`, `projection`, `latest` and both changes are likewise measured on the
 * full series and are not affected by the range at all.
 *
 * ## The window ends today, not at the last weigh-in
 *
 * Changed 2026-08-15, Sriman's call after seeing it on the device. "30 days"
 * used to mean the 30 days before your most recent weigh-in, which quietly
 * hides the thing you most need to see: with a last weigh-in on 4 August and
 * today the 15th, the chart ran to 4 August and looked complete. Eleven days of
 * not standing on the scale left no mark at all.
 *
 * Ending the window at today puts that gap on screen as empty space on the
 * right, which is the honest picture. It also means a window can legitimately
 * contain **no points** — 30 days with no weigh-in in them — and that is a
 * different empty state from "no weigh-ins ever". `latest` is measured on the
 * full series precisely so the client can tell those two apart.
 */

/** How far ahead the dashed projection line runs. */
const PROJECTION_DAYS = 30

export async function readWeightSeries(
  scope: UserScope,
  range: WeightRange,
): Promise<WeightSeries> {
  const [weightRows, profileRows] = await Promise.all([
    selectOwned(scope, weightLogs, { orderBy: asc(weightLogs.date) }),
    selectOwned(scope, profiles, { limit: 1 }),
  ])

  const goalWeightKg = profileRows[0]?.goalWeightKg ?? null

  const series = trendWeightSeries(
    weightRows.map((row) => ({ day: row.date, weight: row.weight })),
  )

  const latest = latestTrend(series)

  // No weigh-ins at all. Every field is null or empty rather than zero: the
  // empty state on the chart is a real state with its own words, and a series
  // of one point at 0 kg would render as a line along the floor.
  if (!latest) {
    return {
      range: { days: range === "all" ? null : range, from: null, to: null },
      points: [],
      latest: null,
      change7d: null,
      change30d: null,
      goalWeightKg,
      goal: null,
      projection: null,
    }
  }

  const today = currentLoggingDay()
  const { points, from } = windowOf(series, range, today)

  return {
    range: {
      days: range === "all" ? null : range,
      from,
      // Always today, even when the last weigh-in is older. This is what puts
      // the gap on the chart instead of hiding it.
      to: today,
    },
    points,
    latest,
    change7d: trendChangeOverDays(series, 7),
    change30d: trendChangeOverDays(series, 30),
    goalWeightKg,
    goal: goalWeightKg === null ? null : goalProgress(series, goalWeightKg),
    projection: projectTrend(series, {
      // `?? undefined` and not `?? null`: the engine's option is optional, and
      // omitting it is what asks for a line with no ETA on it. Passing null
      // would be a goal of null, which is not a thing it can solve for.
      goalKg: goalWeightKg ?? undefined,
      forDays: PROJECTION_DAYS,
    }),
  }
}

/**
 * The `range` calendar days ending **today**, and where that window starts.
 *
 * Cut by calendar date rather than by taking the last N array entries. The two
 * would agree only while the series runs up to today, which is exactly the
 * assumption this function stopped making — "the last 30 items" is not what
 * "30 days" means, and the difference is every day since the last weigh-in.
 *
 * `all` starts at the first weigh-in on record, so the whole history is drawn.
 * It still **ends today**, so the trailing gap is visible at every range.
 */
function windowOf(
  series: readonly TrendPoint[],
  range: WeightRange,
  today: LogDay,
): { points: TrendPoint[]; from: LogDay } {
  const first = series[0]

  const from =
    range === "all"
      ? (first?.day ?? today)
      : addDays(today, -(range - 1))

  return {
    points: series.filter(
      (point) => daysBetween(from, point.day) >= 0 && daysBetween(point.day, today) >= 0,
    ),
    from,
  }
}
