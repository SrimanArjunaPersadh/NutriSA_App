import { describe, expect, it } from "vitest"

import { labelFoodDraft, type LabelNumbers } from "./label"

const reading = (overrides: Partial<LabelNumbers>): LabelNumbers => ({
  basis: "per_100g",
  servingSize: null,
  energyKj: null,
  energyKcal: null,
  protein: null,
  carbohydrate: null,
  fat: null,
  ...overrides,
})

describe("labelFoodDraft", () => {
  it("copies a per-100 g column as printed", () => {
    const draft = labelFoodDraft(
      reading({
        energyKj: 1590,
        energyKcal: 379,
        protein: 7.5,
        carbohydrate: 84,
        fat: 0.9,
        servingSize: { value: 30, unit: "g" },
      }),
    )
    expect(draft).toEqual({
      unit: "g",
      per: { kcal: 379, protein: 7.5, carbs: 84, fat: 0.9 },
      servingQuantity: 30,
    })
  })

  it("converts kJ when the label printed no kcal", () => {
    expect(labelFoodDraft(reading({ energyKj: 1590 })).per.kcal).toBe(380)
  })

  it("uses ml for a per-100 ml column, and drops a serving size in grams", () => {
    const draft = labelFoodDraft(
      reading({ basis: "per_100ml", energyKcal: 42, servingSize: { value: 250, unit: "g" } }),
    )
    expect(draft.unit).toBe("ml")
    expect(draft.servingQuantity).toBeNull()
  })

  /**
   * The one place a label needs arithmetic: a per-serving column becomes per
   * 100 because that is how a food is stored. 40 g serving at 150 kcal / 3.2 g
   * protein is 375 kcal / 8 g per 100 g.
   */
  it("rescales a per-serving column to per 100 of the serving's unit", () => {
    const draft = labelFoodDraft(
      reading({
        basis: "per_serving",
        servingSize: { value: 40, unit: "g" },
        energyKcal: 150,
        protein: 3.2,
        carbohydrate: 27.1,
        fat: 2.35,
      }),
    )
    expect(draft).toEqual({
      unit: "g",
      per: { kcal: 375, protein: 8, carbs: 67.8, fat: 5.9 },
      servingQuantity: 40,
    })
  })

  it("keeps a per-serving reading with no size as one piece, unscaled", () => {
    const draft = labelFoodDraft(reading({ basis: "per_serving", energyKcal: 90, protein: 2 }))
    expect(draft).toEqual({
      unit: "piece",
      per: { kcal: 90, protein: 2, carbs: null, fat: null },
      servingQuantity: 1,
    })
  })

  it("does not divide by a zero serving size", () => {
    const draft = labelFoodDraft(
      reading({ basis: "per_serving", servingSize: { value: 0, unit: "g" }, energyKcal: 90 }),
    )
    expect(draft.unit).toBe("piece")
  })

  it("leaves unread fields blank rather than zero", () => {
    const draft = labelFoodDraft(reading({ basis: null, energyKcal: 100 }))
    expect(draft.unit).toBe("g")
    expect(draft.per).toEqual({ kcal: 100, protein: null, carbs: null, fat: null })
  })
})
