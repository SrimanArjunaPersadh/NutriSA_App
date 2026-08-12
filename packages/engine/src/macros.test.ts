import { describe, expect, it } from "vitest"

import { ZERO_MACROS, dayTotals, macroProgress, remainingMacros } from "./macros"

const TARGET = { kcal: 2300, protein: 167, carbs: 195, fat: 60 }

describe("dayTotals", () => {
  it("is zero for a day with nothing logged", () => {
    expect(dayTotals([])).toEqual(ZERO_MACROS)
  })

  it("sums every item", () => {
    expect(
      dayTotals([
        { kcal: 520, protein: 32.5, carbs: 44.2, fat: 18.1 },
        { kcal: 310, protein: 11.4, carbs: 38.6, fat: 9.9 },
      ]),
    ).toEqual({ kcal: 830, protein: 43.9, carbs: 82.8, fat: 28 })
  })

  it("accumulates at full precision and rounds once", () => {
    // Thirty items at 0.04g each. Rounded per item they are 0.0 and the total
    // is 0; accumulated first it is 1.2 — a gram the user can see in the list
    // but not in the total.
    const items = Array.from({ length: 30 }, () => ({
      kcal: 0,
      protein: 0.04,
      carbs: 0,
      fat: 0,
    }))
    expect(dayTotals(items).protein).toBe(1.2)
  })

  it("rounds energy to whole and grams to one decimal", () => {
    const totals = dayTotals([{ kcal: 520.6, protein: 32.46, carbs: 44.25, fat: 18.14 }])
    expect(totals).toEqual({ kcal: 521, protein: 32.5, carbs: 44.3, fat: 18.1 })
  })
})

describe("remainingMacros", () => {
  it("subtracts consumed from target", () => {
    const consumed = { kcal: 1870, protein: 48, carbs: 102, fat: 22 }
    expect(remainingMacros(consumed, TARGET)).toEqual({
      kcal: 430,
      protein: 119,
      carbs: 93,
      fat: 38,
    })
  })

  it("goes negative past the target rather than clamping", () => {
    // The over-target state is the one the user most needs to see; clamping to
    // zero would hide it and leave the red token with nothing to render.
    const consumed = { kcal: 2500, protein: 180, carbs: 195, fat: 61.5 }
    expect(remainingMacros(consumed, TARGET)).toEqual({
      kcal: -200,
      protein: -13,
      carbs: 0,
      fat: -1.5,
    })
  })

  it("returns the whole target when nothing is logged", () => {
    expect(remainingMacros(ZERO_MACROS, TARGET)).toEqual(TARGET)
  })
})

describe("macroProgress", () => {
  it("is the consumed share of each target", () => {
    const progress = macroProgress({ kcal: 1150, protein: 83.5, carbs: 39, fat: 15 }, TARGET)
    expect(progress.kcal).toBeCloseTo(0.5, 4)
    expect(progress.protein).toBeCloseTo(0.5, 4)
    expect(progress.carbs).toBeCloseTo(0.2, 4)
    expect(progress.fat).toBeCloseTo(0.25, 4)
  })

  it("exceeds 1 past the target, so the ring can render an over state", () => {
    expect(macroProgress({ ...ZERO_MACROS, kcal: 2760 }, TARGET).kcal).toBeCloseTo(1.2, 4)
  })

  it("is 0 against a zero target rather than Infinity", () => {
    // Infinity would reach a strokeDashoffset and blank the ring entirely.
    const progress = macroProgress({ kcal: 500, protein: 10, carbs: 10, fat: 10 }, ZERO_MACROS)
    expect(progress).toEqual(ZERO_MACROS)
  })
})
