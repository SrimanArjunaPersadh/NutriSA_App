import { asc, eq } from "drizzle-orm"

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
import type {
  DeleteResult,
  WeightEntry,
  WeightRange,
  WeightSeries,
  WeightWriteResult,
  WriteWeight,
} from "@shared"

import type { UserScope } from "../auth/user-scope"
import { isUniqueViolation } from "../db/errors"
import { profiles, weightLogs } from "../db/schema"
import { deleteOwned, selectOwned, upsertOwned, type WriteOutcome } from "./scoped"

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
      entries: [],
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
    // Built from the rows rather than from `points`, because the id is only on
    // a row. Newest first, and windowed to the same span the chart draws so the
    // list under it is a list of what is on it.
    entries: entriesWithin(weightRows, from, today),
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
 * Records a weigh-in, replacing that day's if there is one.
 *
 * ## Why this is an upsert and not an insert
 *
 * `weight_logs` carries `UNIQUE (user_id, date)`, and the schema explains why:
 * the trend takes one step per calendar day, so a second row for a day would
 * double-step the series and every value after it would be quietly wrong. Given
 * that, a second weigh-in on the same day has only two possible answers —
 * refuse it, or replace. Replace is the right one: standing on the scale twice
 * is how people correct a bad reading, and "you already weighed today" is a
 * strange thing for an app to say to someone holding a better number.
 *
 * **Confirmed by Sriman, 2026-08-20**, after the weight surface put it on
 * screen. It had been an assumption carried since `api-writes`; it is now a
 * decision, recorded in plan.md's answered questions. The screen discloses it
 * before the save rather than after — see `src/app/log-weight.tsx`.
 *
 * ## What `replaced` means, precisely
 *
 * The row that now holds this day is not the one the client just minted. Since
 * every fresh save carries a fresh UUIDv7, that is exactly "there was already a
 * weigh-in here". A **retry** of the same save comes back `replaced: false`,
 * which is also right — it replaced nothing, it landed on its own row.
 *
 * ## The one failure this cannot swallow
 *
 * The conflict target is `(user_id, date)`, so a clash on the **primary key** —
 * the same id sent for a different day — is not caught by it and surfaces as a
 * unique violation. That is a client minting ids badly, and it gets a 409
 * rather than a 500: retrying it would fail identically forever.
 */
export async function writeWeightLog(
  scope: UserScope,
  day: LogDay,
  input: WriteWeight,
): Promise<WriteOutcome<WeightWriteResult>> {
  let rows
  try {
    rows = await upsertOwned(
      scope,
      weightLogs,
      { id: input.id, date: day, weight: input.weightKg },
      {
        target: [weightLogs.userId, weightLogs.date],
        set: { weight: input.weightKg },
      },
    )
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "id-taken" }
    throw error
  }

  const row = rows[0]
  // Unreachable through a correct conflict target — `upsertOwned` says why —
  // so this is refused rather than reported as a success with nothing behind it.
  if (!row) return { ok: false, reason: "id-taken" }

  return {
    ok: true,
    value: {
      id: row.id,
      date: row.date,
      weightKg: row.weight,
      replaced: row.id !== input.id,
    },
  }
}

/**
 * Removes one weigh-in.
 *
 * The same shape and the same silence as `deleteMealLog`, for the same reason:
 * `deleted: false` covers "already gone" and "never yours" alike, and saying
 * which would answer, for any id anyone cares to send, whether a row with that
 * id exists.
 *
 * ## What this costs, which is more than a meal costs
 *
 * A deleted meal removes its own contribution to one day. A deleted weigh-in
 * removes a **step** from the trend, and the trend is an exponentially weighted
 * average over calendar days — so every trend value after the deleted day
 * changes, not just that day's. That is correct and is exactly what a mistyped
 * reading needs, but it means this is the one delete in the app whose effect is
 * visible on numbers the user was not looking at. The client refetches the
 * whole series afterwards rather than dropping a point from the one it holds.
 *
 * There is no undo. A weigh-in is one number and a calendar day, so re-entering
 * it is the undo — which is not true of a meal, and is why the weight surface
 * does not need the same care around a mis-tap that the meal form does.
 */
export async function deleteWeightLog(
  scope: UserScope,
  id: string,
): Promise<DeleteResult> {
  const removed = await deleteOwned(scope, weightLogs, eq(weightLogs.id, id))
  return { id, deleted: removed.length > 0 }
}

/**
 * The stored weigh-ins between `from` and `to`, newest first.
 *
 * Ordered here rather than by a second query: the rows are already loaded and
 * already sorted ascending for the engine, so this is a reverse, not a round
 * trip. The `.reverse()` is safe in place because `.map()` above it has already
 * produced a fresh array — the rows the engine was given are untouched.
 */
function entriesWithin(
  rows: readonly { id: string; date: LogDay; weight: number }[],
  from: LogDay,
  to: LogDay,
): WeightEntry[] {
  return rows
    .filter((row) => daysBetween(from, row.date) >= 0 && daysBetween(row.date, to) >= 0)
    .map((row) => ({ id: row.id, day: row.date, weightKg: row.weight }))
    .reverse()
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
