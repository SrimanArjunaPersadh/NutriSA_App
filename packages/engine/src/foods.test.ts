import { describe, expect, it } from "vitest"

import { kcalFromKj, KJ_PER_KCAL, MEAL_SLOTS, mealNameFor, slotOfMeal } from "./foods"

describe("kcalFromKj", () => {
  it("converts a real SA label: Koo baked beans, 396 kJ per 100 g", () => {
    // 94.6 before rounding. The same product's OFF record prints 95 kcal, and
    // whole kcal is what every stored figure holds — so the two agree.
    expect(kcalFromKj(396)).toBe(95)
  })

  it("rounds half up to the whole kcal", () => {
    expect(kcalFromKj(KJ_PER_KCAL * 10.5)).toBe(11)
    expect(kcalFromKj(KJ_PER_KCAL * 10.4)).toBe(10)
  })

  it("is exact on a round multiple", () => {
    expect(kcalFromKj(KJ_PER_KCAL * 100)).toBe(100)
  })

  it("keeps zero as zero — water is a real product", () => {
    expect(kcalFromKj(0)).toBe(0)
  })

  it("refuses unreadable energy rather than calling it free", () => {
    expect(kcalFromKj(Number.NaN)).toBeNull()
    expect(kcalFromKj(Number.POSITIVE_INFINITY)).toBeNull()
    expect(kcalFromKj(-1)).toBeNull()
  })
})

describe("mealNameFor", () => {
  it.each([
    ["04:00", "Breakfast"],
    ["07:30", "Breakfast"],
    ["10:59", "Breakfast"],
    ["11:00", "Lunch"],
    ["14:59", "Lunch"],
    ["15:00", "Snack"],
    ["16:59", "Snack"],
    ["17:00", "Dinner"],
    ["21:59", "Dinner"],
    ["22:00", "Snack"],
    ["01:00", "Snack"],
    ["03:59", "Snack"],
  ] as const)("%s is %s", (time, name) => {
    expect(mealNameFor(time)).toBe(name)
  })

  it("only ever answers with one of the slots the logger offers", () => {
    for (let hour = 0; hour < 24; hour++) {
      const time = `${String(hour).padStart(2, "0")}:30`
      expect(MEAL_SLOTS).toContain(mealNameFor(time))
    }
  })

  it("falls back to Snack on anything that is not HH:MM", () => {
    expect(mealNameFor("")).toBe("Snack")
    expect(mealNameFor("7:30")).toBe("Snack")
    expect(mealNameFor("24:00")).toBe("Snack")
  })
})

describe("slotOfMeal", () => {
  it("files a meal named for a slot under that slot, whatever the time", () => {
    expect(slotOfMeal("Breakfast", "20:00")).toBe("Breakfast")
    expect(slotOfMeal("dinner", null)).toBe("Dinner")
    expect(slotOfMeal("  Lunch ", "08:00")).toBe("Lunch")
  })

  it("files any other name by the clock", () => {
    expect(slotOfMeal("Chicken wrap", "13:00")).toBe("Lunch")
    expect(slotOfMeal("Oats and berries", "07:15")).toBe("Breakfast")
    expect(slotOfMeal("Post-workout", "18:30")).toBe("Dinner")
  })

  it("falls back to Snack with neither a slot name nor a time", () => {
    expect(slotOfMeal("Leftovers", null)).toBe("Snack")
    expect(slotOfMeal("", "")).toBe("Snack")
  })
})
