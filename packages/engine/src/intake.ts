import { ZERO_MACROS, type Macros } from "./macros"
import { roundTo } from "./round"
import { addDays, daysBetween, type LogDay } from "./time"

/**
 * Average daily intake over a trailing window.
 *
 * ## Why this module exists
 *
 * The dashboard's second insight tile used to read "Expenditure — 1,587 kcal,
 * last 7 days", which is TDEE. Adaptive TDEE is a deferred cut whose re-add
 * trigger is "3+ weeks logging in the new app", so when `design-fixture.ts` is
 * deleted that tile has no source at all. Sriman's call on 2026-08-14 was to
 * swap it for **7-day average intake**: it keeps the row's two-tile layout and
 * it is computable from data that already exists.
 *
 * It lives in the engine rather than in the route handler because a mean is
 * arithmetic, and plan.md's first standing rule puts every number a user sees
 * behind a tested pure function. A `.reduce((a, b) => a + b) / 7` in a Hono
 * handler is the exact shape that rule exists to stop.
 *
 * ## The average is over days logged, not over days elapsed
 *
 * Dividing by a fixed 7 would quietly punish not logging: skip two days and
 * your "average intake" drops by 30% without you eating any differently, which
 * reads as progress and is a lie. Dividing by the number of days that actually
 * carry a log answers the question the tile is really asking — *on a day you
 * track, what do you eat* — and `loggedDays` is returned alongside so the
 * surface can say "5 of 7 days" rather than implying a full week.
 *
 * A window with nothing in it returns null, not a zero. Zero kcal is a
 * statement about the user's eating; the absence of logs is a statement about
 * the app, and those are different states with different words on screen.
 */

/** One day's confirmed totals. */
export type DayIntake = {
  day: LogDay
  macros: Macros
}

export type IntakePoint = {
  day: LogDay
  /** Total energy logged that day, or null if the day carries no log at all. */
  kcal: number | null
}

export type AverageIntake = {
  /** Days of history the window spans, including both ends. */
  windowDays: number
  /** Oldest day in the window. */
  from: LogDay
  /** Newest day in the window — the day the caller asked about. */
  to: LogDay
  /** How many days in the window carry at least one logged meal. */
  loggedDays: number
  /** The mean of the logged days. Never a mean over the whole window. */
  average: Macros
  /**
   * One entry per calendar day in the window, oldest first — the sparkline's
   * series. Unlogged days are null rather than 0 so the line can break instead
   * of diving to the floor and inventing a fast day that never happened.
   */
  series: IntakePoint[]
}

const DEFAULT_WINDOW_DAYS = 7

/** Energy is whole; grams carry one decimal, matching `macros.ts`. */
function normalise(macros: Macros): Macros {
  return {
    kcal: roundTo(macros.kcal, 0),
    protein: roundTo(macros.protein, 1),
    carbs: roundTo(macros.carbs, 1),
    fat: roundTo(macros.fat, 1),
  }
}

/**
 * Mean intake across the `windowDays` calendar days ending on `endDay`.
 *
 * `days` may arrive in any order and may contain days outside the window —
 * callers hand over whatever the query returned, and anything outside the
 * window is ignored rather than being the caller's problem to filter. A
 * duplicate day is a data error the `(user_id, date)` shape of the day view
 * should make impossible; if one arrives, the later entry wins, matching how
 * `trendWeightSeries` resolves the same ambiguity.
 */
export function averageDailyIntake(
  days: readonly DayIntake[],
  endDay: LogDay,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): AverageIntake | null {
  if (windowDays < 1) return null

  const from = addDays(endDay, -(windowDays - 1))

  const byDay = new Map<LogDay, Macros>()
  for (const entry of days) {
    const offset = daysBetween(from, entry.day)
    if (offset < 0 || offset > windowDays - 1) continue
    byDay.set(entry.day, entry.macros)
  }

  const series: IntakePoint[] = []
  let total = { ...ZERO_MACROS }
  let loggedDays = 0

  for (let offset = 0; offset < windowDays; offset++) {
    const day = addDays(from, offset)
    const macros = byDay.get(day)

    if (macros) {
      loggedDays++
      total = {
        kcal: total.kcal + macros.kcal,
        protein: total.protein + macros.protein,
        carbs: total.carbs + macros.carbs,
        fat: total.fat + macros.fat,
      }
    }

    series.push({ day, kcal: macros ? macros.kcal : null })
  }

  // Nothing logged in the window. The caller shows an empty state; it must not
  // show "0 kcal", which claims a fact about the user rather than about the data.
  if (loggedDays === 0) return null

  return {
    windowDays,
    from,
    to: endDay,
    loggedDays,
    // Accumulated at full precision and rounded once, the same way `dayTotals`
    // does it — rounding each day before the sum scatters error across the mean.
    average: normalise({
      kcal: total.kcal / loggedDays,
      protein: total.protein / loggedDays,
      carbs: total.carbs / loggedDays,
      fat: total.fat / loggedDays,
    }),
    series,
  }
}
