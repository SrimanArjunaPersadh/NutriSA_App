import { z } from "zod"

/**
 * `GET /profile` and `PUT /profile` — the profile, as far as v1 holds one.
 *
 * ## One field, on purpose
 *
 * `profiles` has six columns (`server/db/schema.ts`) and this contract carries
 * one of them. Goal weight is the only profile value anything in the app reads:
 * the Weight tab's goal card, the Dashboard's weight card and the chart's goal
 * line. Height, age, sex and activity are Special Personal Information under
 * POPIA, and collecting them with no feature reading them is holding health
 * data for no purpose. Decided with Sriman, 2026-10-25 (plan.md, Phase 7b).
 *
 * So the write schema does not merely leave the others off the form: it has no
 * key for them, and zod strips an unknown key before the route sees the body.
 * A client that sends `heightCm` has it ignored the way a body carrying
 * `user_id` is ignored, and `tests/security/write-isolation.test.ts` sends one
 * to prove it. A field joins this file in the branch that first reads it.
 *
 * ## No client-minted id
 *
 * Every other write carries a client UUIDv7 because a retried insert with no
 * natural key would duplicate a row. A profile has a natural key: one row per
 * user, `UNIQUE (user_id)`. A `PUT` upserts on it, so a retry lands on the same
 * row with the same value, and the row's id is minted by the server the one
 * time the row is created. Nothing the client holds needs it.
 */

/**
 * The goal weight a person can set, in kg.
 *
 * Plausibility bounds rather than the column's width, for the same reason as
 * `TARGET_BOUNDS` in `./writes.ts`: a goal is chosen, not measured, and a slip
 * of the thumb here moves the goal line, the ring and "kg to go" on every
 * surface at once. One decimal place, matching how a weight is shown
 * everywhere (`formatKg`).
 */
export const GOAL_WEIGHT_BOUNDS = { min: 30, max: 300 } as const

/**
 * At most one decimal place.
 *
 * A tolerance rather than `x * 10 === Math.round(x * 10)`, because 82.3 is not
 * exactly representable and `82.3 * 10` comes out as 822.9999999999999. This is
 * a validation check on the value's shape, not a number anybody reads.
 */
function hasOneDecimalAtMost(value: number): boolean {
  const tenths = value * 10
  return Math.abs(tenths - Math.round(tenths)) < 1e-9
}

export const goalWeightSchema = z
  .number()
  .min(GOAL_WEIGHT_BOUNDS.min)
  .max(GOAL_WEIGHT_BOUNDS.max)
  .refine(hasOneDecimalAtMost, { message: "Expected at most one decimal place" })

/**
 * `PUT /profile`.
 *
 * `goalWeightKg: null` clears the goal, which is allowed: every surface that
 * reads it already has a no-goal state. The key is required rather than
 * optional, so an empty body is a 400 instead of a successful no-op that would
 * look like a save.
 */
export const writeProfileSchema = z.object({
  goalWeightKg: goalWeightSchema.nullable(),
})

export type WriteProfile = z.infer<typeof writeProfileSchema>

/**
 * `GET /profile`, and what `PUT /profile` answers with.
 *
 * `goalWeightKg` is null when there is no profile row at all, which is the
 * state every new user is in. Absent, not zero: see `goalWeightKg` in
 * `./weight.ts`, which carries the same value to the chart.
 */
export const profileSchema = z.object({
  goalWeightKg: z.number().nullable(),
})

export type Profile = z.infer<typeof profileSchema>
