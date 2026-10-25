import { z } from "zod"

import { logDaySchema } from "./common"

/**
 * `GET /weight-logs` — the series behind the trend chart, the trend card and
 * the weight insight tile.
 *
 * ## The trend is computed over all history, then windowed
 *
 * `?days=30` narrows what is **drawn**, never what is **computed**. The trend
 * is an exponentially weighted average that carries its whole past forward:
 * seeding it at the left edge of a 30-day window would set `tw[0] = w[0]` a
 * month ago and produce a line that is wrong everywhere, most of all at the
 * right-hand end where the user reads the current number off it.
 *
 * The same applies to `goal` and `projection`, which measure from the first
 * weigh-in ever and from a 14-day rate respectively. Everything in this
 * response is computed on the full series; only `points` is sliced.
 */

/** `?days=` — a positive whole number of days, or "all" for the full history. */
export const weightRangeSchema = z
  .union([z.literal("all"), z.coerce.number().int().positive().max(36_500)])
  .default("all")

export type WeightRange = z.infer<typeof weightRangeSchema>

export const trendPointSchema = z.object({
  day: logDaySchema,
  /**
   * The raw scale reading, or null on a day with no weigh-in. Null days still
   * take a trend step — the series has one entry per calendar day, and the
   * chart plots dots only where this is non-null.
   */
  weight: z.number().nullable(),
  /** The smoothed weight. **This** is the number shown as progress. */
  trend: z.number(),
})

export const trendChangeSchema = z.object({
  /** Signed kg. Negative is a loss. Trend-to-trend, never raw-to-raw. */
  delta: z.number(),
  from: trendPointSchema,
  to: trendPointSchema,
})

export const goalProgressSchema = z.object({
  startKg: z.number(),
  currentKg: z.number(),
  goalKg: z.number(),
  /** Signed. Positive means there is still ground to cover. */
  remainingKg: z.number(),
  /** 0–1, clamped. Past the goal is arrival, not information. */
  progress: z.number(),
})

export const projectionSchema = z.object({
  /** Signed kg per week over the 14-day rate window. */
  ratePerWeek: z.number(),
  points: z.array(z.object({ day: logDaySchema, trend: z.number() })),
  /** Null when this rate never reaches the goal, or lands over a year out. */
  goalDay: logDaySchema.nullable(),
  daysToGoal: z.number().nullable(),
})

/**
 * One stored weigh-in, as a row rather than as a point on a line.
 *
 * ## Why this exists beside `points`
 *
 * `points` is the engine's series: one entry per **calendar day** in the
 * window, carrying the smoothed trend, with `weight: null` on the days nobody
 * stood on a scale. It is what the chart draws, and it deliberately has no ids
 * in it — `TrendPoint` is a pure engine type and a database id is not something
 * the engine should have an opinion about.
 *
 * The history list needs the other shape: the rows that actually exist, each
 * with the id that `DELETE /weight-logs/:id` takes. Reconstructing that from
 * `points` would mean filtering the nulls and then having no id to delete by.
 *
 * ## The id is not the one the client minted
 *
 * A second weigh-in on a day replaces the first **in place** — `POST` upserts
 * on `(user_id, date)` — so the row keeps the id it was created with. A client
 * that deleted by the id it last sent would delete nothing. This is where the
 * real id comes from.
 */
export const weightEntrySchema = z.object({
  id: z.string(),
  day: logDaySchema,
  /** The raw scale reading. Never a trend — see `trendPointSchema`. */
  weightKg: z.number(),
})

export const weightSeriesSchema = z.object({
  /**
   * The window that was drawn, echoed back. `days: null` means the full
   * history. `from`/`to` are null only when there is no history at all.
   */
  range: z.object({
    days: z.number().nullable(),
    from: logDaySchema.nullable(),
    to: logDaySchema.nullable(),
  }),
  /** One entry per calendar day inside the window, oldest first. */
  points: z.array(trendPointSchema),
  /**
   * The stored weigh-ins inside the window, **newest first** — the order the
   * history list reads in, where the most recent entry is the one you are most
   * likely to be correcting.
   *
   * Windowed like `points` and unlike everything else in this response: it is
   * display, not computation. Nothing is derived from it.
   */
  entries: z.array(weightEntrySchema),
  /** The most recent point in the **full** series. Null before the first weigh-in. */
  latest: trendPointSchema.nullable(),
  /** Null when the history is shorter than the window. */
  change7d: trendChangeSchema.nullable(),
  change30d: trendChangeSchema.nullable(),
  /**
   * Null until a `profiles` row carries one. Absent, not zero — a goal of 0 kg
   * would draw a line off the bottom of the chart and read as a real target.
   */
  goalWeightKg: z.number().nullable(),
  /** Null when there is no goal weight, or no history to measure against it. */
  goal: goalProgressSchema.nullable(),
  /** Null when there is not enough history to measure a rate. */
  projection: projectionSchema.nullable(),
})

export type TrendPointResponse = z.infer<typeof trendPointSchema>
export type WeightEntry = z.infer<typeof weightEntrySchema>
export type TrendChangeResponse = z.infer<typeof trendChangeSchema>
export type GoalProgressResponse = z.infer<typeof goalProgressSchema>
export type ProjectionResponse = z.infer<typeof projectionSchema>
export type WeightSeries = z.infer<typeof weightSeriesSchema>
