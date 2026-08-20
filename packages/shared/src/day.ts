import { z } from "zod"

import { logDaySchema, macrosSchema } from "./common"
import { mealItemSchema } from "./meal-items"

/**
 * `GET /day/:date` — everything the dashboard's top half needs for one day.
 *
 * ## Why one route and not five
 *
 * The calories hero, the three macro rings, the meal list and the insights row
 * all describe the same day. Split across routes they would arrive at different
 * moments and could disagree mid-render — the hero showing 430 left while the
 * rings still add up to yesterday. One response is one consistent day.
 *
 * ## Every number here was computed by the engine
 *
 * Not one of these fields is worked out in a route handler or a component.
 * `consumed` is `dayTotals`, `remaining` is `remainingMacros`, `progress` is
 * `macroProgress`, `targets` is `resolveTargetForDate`, `averageIntake` is
 * `averageDailyIntake`. The server's job is to fetch rows and hand them over.
 */

/** A logged item, flattened into the engine's vocabulary for the client. */
export const dayMealItemSchema = z.object({
  name: z.string(),
  /** Verbatim, never parsed — see `meal-items.ts`. */
  qty: z.string(),
  macros: macrosSchema,
  /**
   * How the line was entered, if the row records it. **Null on every migrated
   * row** and on anything written before the field existed.
   *
   * Nothing on the read path computes from this — `macros` above is the stored,
   * authoritative figure either way. It rides along so the edit surface can
   * reopen an item as "150 g at 350 kcal per 100 g" rather than as a bare
   * total, which is the difference between changing a number and redoing the
   * sum by hand.
   *
   * `unit` stays a plain string here, deliberately. The write side checks it
   * against the engine's list; the read side must hand back whatever is stored,
   * because a row written by a later version with a unit this build does not
   * know is still a row this build has to display.
   */
  portion: z
    .object({
      quantity: z.number(),
      unit: z.string(),
      per: macrosSchema,
    })
    .nullable(),
})

export const dayMealSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * The wall-clock time the user attached to the meal, e.g. "08:15". Display
   * only, and null on the migrated history that predates the field.
   */
  loggedTime: z.string().nullable(),
  /** Position within the day. The day view orders by this, never by created_at. */
  sortOrder: z.number(),
  /**
   * The header totals as stored — **confirmed and authoritative**, never
   * re-derived from `items`. A later change to rounding must not retroactively
   * move a total the user already saw.
   */
  macros: macrosSchema,
  items: z.array(dayMealItemSchema),
})

export const intakePointSchema = z.object({
  day: logDaySchema,
  /** Null on a day with no log at all — the sparkline breaks rather than dives. */
  kcal: z.number().nullable(),
})

/**
 * The insights row's second tile.
 *
 * This replaced an Expenditure tile that showed TDEE, which nothing could
 * compute — adaptive TDEE is a deferred cut. Sriman's call, 2026-08-14. The
 * average is over days actually logged, not days elapsed; `loggedDays` is here
 * so the tile can say "5 of 7 days" instead of implying a full week.
 */
export const averageIntakeSchema = z.object({
  windowDays: z.number(),
  from: logDaySchema,
  to: logDaySchema,
  loggedDays: z.number(),
  average: macrosSchema,
  series: z.array(intakePointSchema),
})

/**
 * The logging streak, as of **today** — never as of `:date`.
 *
 * It rides on the day response because the dashboard header renders alongside
 * the cards and a second round-trip for two numbers would only give the header
 * its own loading state to flicker through.
 *
 * That it is always today's streak is the deliberate part, and it stays correct
 * when day-switching arrives: looking back at last Tuesday should not tell you
 * what your streak was last Tuesday, because the flame in the header is
 * reporting whether you have logged *today*.
 */
export const streakSchema = z.object({
  /** Consecutive logged days ending today. 0 when the run is broken. */
  days: z.number(),
  /**
   * Whether today itself carries a log. **Not** `days > 0` — a run stays alive
   * until midnight on a day you have not logged yet, so 12-and-unlit is a real
   * and common state. This is what lights the flame.
   */
  lit: z.boolean(),
})

export const daySummarySchema = z.object({
  date: logDaySchema,
  /**
   * Null on any day before the user's first `targets` row. That is a real
   * state, not an error — it is every day before they set targets — and the
   * surface shows the empty state rather than dividing by a zero target.
   */
  targets: macrosSchema.nullable(),
  /** Always present. A day with nothing logged is a genuine zero. */
  consumed: macrosSchema,
  /** Null exactly when `targets` is. Goes negative past a target, on purpose. */
  remaining: macrosSchema.nullable(),
  /** 0–1 fractions for the rings. Not clamped: past 1 is the over-target cue. */
  progress: macrosSchema.nullable(),
  meals: z.array(dayMealSchema),
  /** Null when nothing in the trailing window was logged. */
  averageIntake: averageIntakeSchema.nullable(),
  /** As of today, not as of `date` — see `streakSchema`. */
  streak: streakSchema,
  /**
   * Days in the trailing window that carry at least one meal, oldest first.
   *
   * This is what lets the week strip draw its fourth state. It had three —
   * today, past, future — and a note saying the one it could not show was
   * **logged**, "which is what makes the strip worth scrolling and what the
   * streak counts".
   *
   * Bounded rather than the whole history: the payload would otherwise grow by
   * one entry per logged day forever, on a response the dashboard fetches every
   * time it opens. The window matches how far the strip scrolls. The streak
   * above is **not** computed from this list — it uses the full history
   * server-side, so it stays right even if this window is later shortened.
   */
  loggedDays: z.array(logDaySchema),
})

export type DayMealItem = z.infer<typeof dayMealItemSchema>
export type DayMeal = z.infer<typeof dayMealSchema>
export type AverageIntakeResponse = z.infer<typeof averageIntakeSchema>
export type StreakResponse = z.infer<typeof streakSchema>
export type DaySummary = z.infer<typeof daySummarySchema>
