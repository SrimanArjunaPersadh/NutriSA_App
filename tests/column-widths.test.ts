import type { PgColumn } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { writeMealSchema, writeTargetsSchema, writeWeightSchema } from "@shared"

import { mealLogs, targets, weightLogs } from "../server/db/schema"

/**
 * The write schemas' numeric ceilings must match the columns they are protecting.
 *
 * `packages/shared/src/writes.ts` bounds every number by the widest value its
 * Postgres column can hold — `numeric(9,2)` for kcal, `(8,2)` for grams,
 * `(5,2)` for a weight. Those bounds are why an absurd figure is a clean 400
 * instead of a numeric overflow surfacing as a 500 with a driver error in it.
 *
 * ## Why they are restated rather than imported
 *
 * `packages/shared/` ships **inside the app bundle**. Importing `db/schema.ts`
 * to read a column width would drag Drizzle and the whole table definition onto
 * the phone to learn one integer. So the numbers are written down twice on
 * purpose — and two sources of truth for one fact is exactly the arrangement
 * that drifts silently, six months from now, when a column is widened and
 * nobody remembers there was a second copy.
 *
 * This is the same pattern as `tokens.test.ts`, which exists because
 * `tailwind.config.js` and `src/design/tokens.ts` describe one palette in two
 * places. The test is the thing that makes duplication safe.
 *
 * ## It asserts behaviour, not equal constants
 *
 * Comparing two numbers would need the ceilings exported from a module that has
 * no other reason to export them. Instead each case computes what the *column*
 * can hold and asks the *schema* about it: the largest legal value is accepted,
 * and the next representable one up is refused. That catches a drift in either
 * direction, and it fails with a message about the boundary rather than about a
 * constant.
 *
 * Importing `server/db/schema.ts` here opens no connection — it is table
 * definitions and nothing else. `db/index.ts`, which does connect, is not
 * touched.
 */

/**
 * The declared width of a `numeric(precision, scale)` column.
 *
 * The cast is the one in this file and it is load-bearing: Drizzle sets
 * `precision` and `scale` on the numeric column object at runtime, but
 * `PgColumn`'s public type does not declare them, so there is no typed way to
 * ask. The guard below turns that into a loud failure rather than a silent
 * `undefined` — if a column here is ever changed to something that is not a
 * fixed-precision numeric, this test says so instead of quietly passing.
 */
function widthOf(column: PgColumn): { precision: number; scale: number } {
  const { precision, scale } = column as unknown as {
    precision?: number
    scale?: number
  }

  if (precision === undefined || scale === undefined) {
    throw new Error(
      `${column.name} is not a fixed-precision numeric column. This test compares ` +
        `write-schema bounds against column widths; a column without one needs a ` +
        `different check, not a skipped one.`,
    )
  }

  return { precision, scale }
}

/** The largest value a `numeric(precision, scale)` column can hold. */
function columnMax(column: PgColumn): number {
  const { precision, scale } = widthOf(column)
  return 10 ** (precision - scale) - 10 ** -scale
}

/** The next value up that the column still stores exactly, i.e. one unit of scale. */
function step(column: PgColumn): number {
  return 10 ** -widthOf(column).scale
}

const cases = [
  {
    what: "meal kcal",
    column: mealLogs.kcal,
    accepts: (value: number) =>
      writeMealSchema.safeParse(meal({ kcal: value, protein: 0, carbs: 0, fat: 0 })).success,
  },
  {
    what: "meal protein",
    column: mealLogs.pro,
    accepts: (value: number) =>
      writeMealSchema.safeParse(meal({ kcal: 0, protein: value, carbs: 0, fat: 0 })).success,
  },
  {
    what: "meal carbs",
    column: mealLogs.carb,
    accepts: (value: number) =>
      writeMealSchema.safeParse(meal({ kcal: 0, protein: 0, carbs: value, fat: 0 })).success,
  },
  {
    what: "meal fat",
    column: mealLogs.fat,
    accepts: (value: number) =>
      writeMealSchema.safeParse(meal({ kcal: 0, protein: 0, carbs: 0, fat: value })).success,
  },
  {
    what: "weigh-in weight",
    column: weightLogs.weight,
    accepts: (value: number) =>
      writeWeightSchema.safeParse({ id: ID, weightKg: value }).success,
  },
  {
    what: "target kcal",
    column: targets.kcal,
    accepts: (value: number) =>
      writeTargetsSchema.safeParse({ id: ID, macros: { kcal: value, protein: 0, carbs: 0, fat: 0 } })
        .success,
  },
  {
    what: "target protein",
    column: targets.pro,
    accepts: (value: number) =>
      writeTargetsSchema.safeParse({ id: ID, macros: { kcal: 0, protein: value, carbs: 0, fat: 0 } })
        .success,
  },
] as const

const ID = "01997b9b-5a3f-7000-8000-000000000001"

function meal(macros: { kcal: number; protein: number; carbs: number; fat: number }) {
  return { id: ID, name: "Boundary", macros, items: [] }
}

describe("every write bound matches the column behind it", () => {
  it.each(cases)("$what accepts the widest value its column holds", ({ column, accepts }) => {
    expect(accepts(columnMax(column))).toBe(true)
  })

  it.each(cases)("$what refuses the next value up", ({ column, accepts }) => {
    // One unit of the column's own scale past the maximum: the smallest number
    // that would overflow, which is the one a looser bound would let through.
    expect(accepts(columnMax(column) + step(column))).toBe(false)
  })
})
