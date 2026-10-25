import { describe, expect, it } from "vitest"

import { patchSavedMealSchema, writeSavedMealSchema } from "./saved-meals"

const macros = { kcal: 500, protein: 40, carbs: 50, fat: 10 }
const item = { name: "Rice", qty: "150 g", macros }
const id = "0190f2a8-1c3e-7a3b-8c4d-5e6f7a8b9c0d"

describe("writeSavedMealSchema", () => {
  it("accepts a meal with one line", () => {
    expect(writeSavedMealSchema.safeParse({ id, name: "Lunch bowl", macros, items: [item] }).success).toBe(true)
  })

  it("refuses an empty meal — a name that logs nothing", () => {
    expect(writeSavedMealSchema.safeParse({ id, name: "Empty", macros, items: [] }).success).toBe(false)
  })

  it("refuses a v4 id, like every create", () => {
    const v4 = "0190f2a8-1c3e-4a3b-8c4d-5e6f7a8b9c0d"
    expect(writeSavedMealSchema.safeParse({ id: v4, name: "x", macros, items: [item] }).success).toBe(false)
  })
})

describe("patchSavedMealSchema", () => {
  it("accepts a rename on its own", () => {
    expect(patchSavedMealSchema.safeParse({ name: "Renamed" }).success).toBe(true)
  })

  it("accepts null to clear a category or a note", () => {
    expect(patchSavedMealSchema.safeParse({ category: null, note: null }).success).toBe(true)
  })

  it("refuses an empty patch", () => {
    expect(patchSavedMealSchema.safeParse({}).success).toBe(false)
  })

  it("moves items and macros together", () => {
    expect(patchSavedMealSchema.safeParse({ items: [item], macros }).success).toBe(true)
  })

  /**
   * The rule that protects the migrated meals' headers: a new header without
   * the lines it came from, or new lines that leave the old header standing,
   * would store a total its lines do not explain.
   */
  it.each([[{ items: [item] }], [{ macros }]])("refuses one without the other: %j", (patch) => {
    expect(patchSavedMealSchema.safeParse(patch).success).toBe(false)
  })
})
