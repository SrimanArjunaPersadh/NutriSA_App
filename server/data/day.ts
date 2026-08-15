import { asc, gte, lte } from "drizzle-orm"

import {
  addDays,
  averageDailyIntake,
  currentLoggingDay,
  currentStreak,
  dayTotals,
  daysBetween,
  macroProgress,
  remainingMacros,
  resolveTargetForDate,
  type DayIntake,
  type LogDay,
  type Macros,
  type TargetRow,
} from "@engine"
import { parseMealItems, toMacros, type DayMeal, type DaySummary } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { mealLogs, targets } from "../db/schema"
import { selectOwned, selectOwnedDays } from "./scoped"

/**
 * Everything `GET /day/:date` answers, assembled from rows the scoped layer
 * returned and numbers the engine worked out.
 *
 * **Nothing in this file does arithmetic.** It reads rows, translates the
 * database's macro vocabulary into the engine's via `@shared`, calls the engine
 * and shapes the result. If a `+` or a `/` ever appears below, it belongs in
 * `packages/engine/` instead — that is plan.md's first standing rule and the
 * reason `averageDailyIntake` was written rather than a `reduce` inlined here.
 */

/** Days of history behind the insights row's average-intake tile. */
const INTAKE_WINDOW_DAYS = 7

/**
 * How far back `loggedDays` reports, in days.
 *
 * 91 is 13 weeks, which is exactly how far the dashboard's week strip scrolls
 * (`WEEKS_SHOWN` in `WeekStrip.tsx`). **If the strip ever scrolls further, this
 * has to grow with it** or the older weeks will render as though nothing was
 * ever logged in them — which looks like data loss rather than a truncated
 * response.
 *
 * Bounded at all because this rides on a response the dashboard fetches on
 * every open, and an unbounded list grows by one entry per logged day forever.
 */
const LOGGED_DAYS_WINDOW_DAYS = 91

export async function readDaySummary(
  scope: UserScope,
  day: LogDay,
): Promise<DaySummary> {
  const windowStart = addDays(day, -(INTAKE_WINDOW_DAYS - 1))

  const [mealRows, targetRows, loggedDays] = await Promise.all([
    /**
     * One query covers both the day view and the trailing average — the window
     * ends on `day`, so the day's own meals are already inside it. Two queries
     * could also disagree with each other if a write landed between them.
     */
    selectOwned(scope, mealLogs, {
      where: gte(mealLogs.date, windowStart),
      orderBy: [asc(mealLogs.date), asc(mealLogs.sortOrder)],
    }),
    /**
     * Only rows already in force. A target set for a future date must not
     * resolve for today — that is the whole point of effective dating, and
     * filtering here means the engine never sees a row it would have to ignore.
     */
    selectOwned(scope, targets, {
      where: lte(targets.validFrom, day),
      orderBy: asc(targets.validFrom),
    }),
    /**
     * Every day that carries a meal, as bare dates. The streak needs the shape
     * of the whole history, not its contents — see `selectOwnedDays`, which
     * answers this from the index rather than reading the rows.
     */
    selectOwnedDays(scope, mealLogs),
  ])

  const todaysMeals = mealRows.filter((row) => row.date === day)

  const meals: DayMeal[] = todaysMeals.map((row) => ({
    id: row.id,
    name: row.name,
    loggedTime: row.loggedTime,
    sortOrder: row.sortOrder,
    // The stored header, not a re-derivation from `items`. See schema.ts: the
    // header totals are confirmed and authoritative, and a later change to
    // rounding must not move a total the user already saw.
    macros: toMacros(row),
    items: parseMealItems(row.items).map((item) => ({
      name: item.name,
      qty: item.qty,
      macros: toMacros(item),
    })),
  }))

  const consumed = dayTotals(meals.map((meal) => meal.macros))

  const targetRow: TargetRow | null = resolveTargetForDate(
    targetRows.map((row) => ({
      validFrom: row.validFrom,
      ...toMacros(row),
    })),
    day,
  )

  const target: Macros | null = targetRow
    ? {
        kcal: targetRow.kcal,
        protein: targetRow.protein,
        carbs: targetRow.carbs,
        fat: targetRow.fat,
      }
    : null

  return {
    date: day,
    targets: target,
    consumed,
    // Null together, always. A "remaining" with no target behind it would be
    // the target's own value dressed up as progress.
    remaining: target ? remainingMacros(consumed, target) : null,
    progress: target ? macroProgress(consumed, target) : null,
    meals,
    averageIntake: averageDailyIntake(groupByDay(mealRows), day, INTAKE_WINDOW_DAYS),
    /**
     * Measured against **today**, deliberately, even when `day` is a past date.
     *
     * The flame in the dashboard header answers "have I logged today", and that
     * question does not change because the user scrolled the week strip back to
     * last Tuesday. Passing `day` here would make the header report history.
     */
    streak: currentStreak(loggedDays, currentLoggingDay()),
    loggedDays: loggedDays.filter(
      (logged) => daysBetween(logged, day) < LOGGED_DAYS_WINDOW_DAYS,
    ),
  }
}

/**
 * Daily totals across the window, one entry per day that carries a meal.
 *
 * Grouping is not arithmetic — the summing is `dayTotals`, per day, exactly as
 * the day view does it. Days with no meals are simply absent, which is what
 * `averageDailyIntake` needs to tell "logged 0 kcal" from "did not log".
 */
function groupByDay(rows: readonly (typeof mealLogs.$inferSelect)[]): DayIntake[] {
  const byDay = new Map<LogDay, Macros[]>()
  for (const row of rows) {
    const existing = byDay.get(row.date)
    if (existing) existing.push(toMacros(row))
    else byDay.set(row.date, [toMacros(row)])
  }
  return [...byDay].map(([day, macros]) => ({ day, macros: dayTotals(macros) }))
}
