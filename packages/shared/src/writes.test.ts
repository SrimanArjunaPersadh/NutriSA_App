import { describe, expect, it } from "vitest"

import {
  clientIdSchema,
  patchMealSchema,
  writeMealSchema,
  writeTargetsSchema,
  writeWeightSchema,
} from "./writes"

/**
 * The write contracts, tested where they are the only thing standing between a
 * request body and a Postgres column.
 *
 * These are not schema-library tests. Each case below is a request that would
 * do something specific and bad if it were accepted: a v4 id that breaks
 * idempotency's index assumption, a number too wide for its column coming back
 * as a 500, a negative macro quietly reducing a day's total.
 */

const V7 = "01997b9b-5a3f-7000-8000-000000000001"
const V4 = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

const MEAL = {
  id: V7,
  name: "Chicken and rice",
  macros: { kcal: 620, protein: 45, carbs: 70, fat: 12 },
  items: [{ name: "Chicken breast", qty: "180 g", macros: { kcal: 300, protein: 40, carbs: 0, fat: 7 } }],
}

describe("clientIdSchema", () => {
  it("accepts a UUIDv7", () => {
    expect(clientIdSchema.safeParse(V7).success).toBe(true)
  })

  /**
   * v4 is the id every other tool mints by default, so this is the mistake that
   * actually happens. It is refused at the boundary rather than stored, because
   * by the time a v4 is in the column the index-locality argument for v7 is
   * already lost and nothing will ever go back and fix it.
   */
  it("refuses a UUIDv4", () => {
    expect(clientIdSchema.safeParse(V4).success).toBe(false)
  })

  it("refuses anything that is not a UUID", () => {
    for (const bad of ["", "meal-1", "01997b9b5a3f70008000000000000001", 7, null]) {
      expect(clientIdSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe("writeMealSchema", () => {
  it("accepts a meal with no date — that means today", () => {
    const parsed = writeMealSchema.safeParse(MEAL)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.date).toBeUndefined()
  })

  it("accepts an explicit day, which is a back-date", () => {
    const parsed = writeMealSchema.safeParse({ ...MEAL, date: "2026-08-01" })
    expect(parsed.success && parsed.data.date).toBe("2026-08-01")
  })

  /**
   * The bounds themselves live in the route, because they depend on what day it
   * is. What the schema owes is that the string names a real day at all — the
   * engine's `isLogDay`, not a regex, which is why 2026-02-30 does not get
   * through to be bounded against.
   */
  it("refuses a date that is not a real calendar day", () => {
    expect(writeMealSchema.safeParse({ ...MEAL, date: "2026-02-30" }).success).toBe(false)
    expect(writeMealSchema.safeParse({ ...MEAL, date: "01/08/2026" }).success).toBe(false)
  })

  it("refuses a negative macro", () => {
    const parsed = writeMealSchema.safeParse({
      ...MEAL,
      macros: { ...MEAL.macros, protein: -5 },
    })
    expect(parsed.success).toBe(false)
  })

  /** numeric(9,2) — one more digit and the driver answers with an overflow. */
  it("refuses a number too wide for its column", () => {
    expect(
      writeMealSchema.safeParse({ ...MEAL, macros: { ...MEAL.macros, kcal: 10_000_000 } })
        .success,
    ).toBe(false)
  })

  it("refuses NaN and Infinity, which JSON cannot carry but a client can compute", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        writeMealSchema.safeParse({ ...MEAL, macros: { ...MEAL.macros, fat: bad } }).success,
      ).toBe(false)
    }
  })

  it("requires a name, and refuses one that is only whitespace", () => {
    expect(writeMealSchema.safeParse({ ...MEAL, name: "   " }).success).toBe(false)
  })

  it("keeps qty verbatim, including the ones that are not numbers", () => {
    const parsed = writeMealSchema.safeParse({
      ...MEAL,
      items: [{ name: "Toast", qty: "1 slice", macros: { kcal: 80, protein: 3, carbs: 15, fat: 1 } }],
    })
    expect(parsed.success && parsed.data.items[0]?.qty).toBe("1 slice")
  })

  it("accepts a meal with no items — a quick total is still a meal", () => {
    expect(writeMealSchema.safeParse({ ...MEAL, items: [] }).success).toBe(true)
  })

  it("accepts a wall-clock time and refuses a wall-clock impossibility", () => {
    expect(writeMealSchema.safeParse({ ...MEAL, loggedTime: "08:15" }).success).toBe(true)
    expect(writeMealSchema.safeParse({ ...MEAL, loggedTime: "24:00" }).success).toBe(false)
    expect(writeMealSchema.safeParse({ ...MEAL, loggedTime: "8:15am" }).success).toBe(false)
    // Absent and null both mean "no time on this meal" — every migrated row.
    expect(writeMealSchema.safeParse({ ...MEAL, loggedTime: null }).success).toBe(true)
  })

  /**
   * `user_id` is not in the schema, so a body carrying one parses cleanly with
   * the field dropped on the floor. That is the desired behaviour and it is the
   * reason the route can be simple: there is no id to ignore because there is
   * no field to read. `tests/security/write-isolation.test.ts` proves the same
   * thing end to end, against Postgres.
   */
  it("silently drops a user_id somebody put in the body", () => {
    const parsed = writeMealSchema.safeParse({ ...MEAL, user_id: "user_someone_else" })
    expect(parsed.success).toBe(true)
    expect(parsed.success && "user_id" in parsed.data).toBe(false)
  })
})

describe("writeWeightSchema", () => {
  it("accepts a weigh-in", () => {
    expect(writeWeightSchema.safeParse({ id: V7, weightKg: 98.4 }).success).toBe(true)
  })

  it("refuses zero and negative weights", () => {
    expect(writeWeightSchema.safeParse({ id: V7, weightKg: 0 }).success).toBe(false)
    expect(writeWeightSchema.safeParse({ id: V7, weightKg: -80 }).success).toBe(false)
  })

  /**
   * numeric(5,2) tops out at 999.99. This is a column bound, not a plausibility
   * one: 400 kg is accepted, because refusing a real person's real number is
   * worse than accepting a typo the UI can question.
   */
  it("refuses a weight wider than the column, and accepts an implausible one", () => {
    expect(writeWeightSchema.safeParse({ id: V7, weightKg: 1000 }).success).toBe(false)
    expect(writeWeightSchema.safeParse({ id: V7, weightKg: 400 }).success).toBe(true)
  })
})

describe("writeTargetsSchema", () => {
  const macros = { kcal: 2300, protein: 167, carbs: 195, fat: 60 }

  it("accepts targets with no validFrom — in force from today", () => {
    expect(writeTargetsSchema.safeParse({ id: V7, macros }).success).toBe(true)
  })

  it("accepts an explicit validFrom", () => {
    const parsed = writeTargetsSchema.safeParse({ id: V7, validFrom: "2026-08-01", macros })
    expect(parsed.success && parsed.data.validFrom).toBe("2026-08-01")
  })

  it("refuses targets with a macro missing", () => {
    expect(
      writeTargetsSchema.safeParse({ id: V7, macros: { kcal: 2300, protein: 167, carbs: 195 } })
        .success,
    ).toBe(false)
  })
})

describe("writeMealSchema — portions", () => {
  const withPortion = {
    ...MEAL,
    items: [
      {
        name: "Rice",
        qty: "150 g",
        macros: { kcal: 525, protein: 18.8, carbs: 90, fat: 8.3 },
        portion: {
          quantity: 150,
          unit: "g",
          per: { kcal: 350, protein: 12.5, carbs: 60, fat: 5.5 },
        },
      },
    ],
  }

  it("accepts a line that records how it was entered", () => {
    const parsed = writeMealSchema.safeParse(withPortion)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.items[0]?.portion?.quantity).toBe(150)
  })

  it("accepts a line with no portion — macros typed straight in", () => {
    expect(writeMealSchema.safeParse(MEAL).success).toBe(true)
  })

  /**
   * The unit is checked against the engine's list on the way *in*. The read
   * path is deliberately lenient about it — a row written by a later version
   * has to stay displayable — but a client writing "kg" today is a bug, and one
   * that would silently change what the stored per-unit macros mean.
   */
  it("refuses a unit the engine does not know", () => {
    const parsed = writeMealSchema.safeParse({
      ...withPortion,
      items: [
        {
          ...withPortion.items[0],
          portion: { ...withPortion.items[0]!.portion, unit: "kg" },
        },
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it("refuses a negative per-unit macro, same as every other macro", () => {
    const parsed = writeMealSchema.safeParse({
      ...withPortion,
      items: [
        {
          ...withPortion.items[0],
          portion: {
            ...withPortion.items[0]!.portion,
            per: { kcal: -1, protein: 0, carbs: 0, fat: 0 },
          },
        },
      ],
    })
    expect(parsed.success).toBe(false)
  })
})

describe("patchMealSchema", () => {
  it("accepts a single field", () => {
    expect(patchMealSchema.safeParse({ name: "Lunch" }).success).toBe(true)
  })

  /**
   * The reason this is its own schema rather than `writeMealSchema.partial()`.
   * A patch that could carry an id would give the request two answers to "which
   * meal is this" — the path and the body — and a handler that read the wrong
   * one would edit a different meal.
   */
  it("ignores an id in the body — the path names the meal", () => {
    const parsed = patchMealSchema.safeParse({ name: "Lunch", id: V7 })
    expect(parsed.success).toBe(true)
    expect(parsed.success && "id" in parsed.data).toBe(false)
  })

  /**
   * An empty patch cannot be anything but a caller bug. Answering 200 to it
   * would hide that bug behind a request that looks like it worked.
   */
  it("refuses an empty body", () => {
    expect(patchMealSchema.safeParse({}).success).toBe(false)
  })

  it("accepts a move to another day", () => {
    const parsed = patchMealSchema.safeParse({ date: "2026-08-01" })
    expect(parsed.success && parsed.data.date).toBe("2026-08-01")
  })

  /**
   * `null` clears the time and an absent key leaves it. The route reads the two
   * differently, so the schema has to preserve the difference rather than
   * collapsing both to undefined.
   */
  it("keeps null and absent apart for loggedTime", () => {
    const cleared = patchMealSchema.safeParse({ loggedTime: null })
    expect(cleared.success && cleared.data.loggedTime).toBeNull()

    const untouched = patchMealSchema.safeParse({ name: "Lunch" })
    expect(untouched.success && untouched.data.loggedTime).toBeUndefined()
  })

  it("holds the same bounds as a create", () => {
    expect(patchMealSchema.safeParse({ name: "   " }).success).toBe(false)
    expect(
      patchMealSchema.safeParse({ macros: { kcal: -1, protein: 0, carbs: 0, fat: 0 } })
        .success,
    ).toBe(false)
    expect(patchMealSchema.safeParse({ loggedTime: "25:00" }).success).toBe(false)
    expect(patchMealSchema.safeParse({ date: "2026-02-30" }).success).toBe(false)
  })
})
