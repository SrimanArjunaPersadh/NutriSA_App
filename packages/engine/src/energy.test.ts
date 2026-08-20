import { describe, expect, it } from "vitest"

import { ATWATER, dominantMacro, macroEnergyShares, NO_SHARES } from "./energy"
import { ZERO_MACROS, type Macros } from "./macros"

const macros = (protein: number, carbs: number, fat: number, kcal = 0): Macros => ({
  kcal,
  protein,
  carbs,
  fat,
})

describe("macroEnergyShares", () => {
  it("splits a day by energy, not by grams", () => {
    // 10 g of each: 40 kcal protein, 40 carbs, 90 fat = 170 total.
    const shares = macroEnergyShares(macros(10, 10, 10))
    expect(shares.protein).toBeCloseTo(40 / 170, 4)
    expect(shares.carbs).toBeCloseTo(40 / 170, 4)
    expect(shares.fat).toBeCloseTo(90 / 170, 4)

    // Equal grams must NOT come out as equal thirds — fat carries 9 kcal/g.
    expect(shares.fat).toBeGreaterThan(shares.protein)
  })

  it("sums to one", () => {
    const shares = macroEnergyShares(macros(45, 70, 12))
    expect(shares.protein + shares.carbs + shares.fat).toBeCloseTo(1, 3)
  })

  /**
   * The empty-day case, and the reason it is not thirds: an even split would
   * draw a three-coloured ring claiming a composition nobody ate.
   */
  it("is all zeroes on an empty day", () => {
    expect(macroEnergyShares(ZERO_MACROS)).toEqual(NO_SHARES)
  })

  it("is all zeroes for a day of pure water", () => {
    expect(macroEnergyShares(macros(0, 0, 0, 0))).toEqual(NO_SHARES)
  })

  it("gives a single-macro day the whole ring", () => {
    expect(macroEnergyShares(macros(50, 0, 0))).toEqual({
      protein: 1,
      carbs: 0,
      fat: 0,
    })
  })

  /**
   * The header `kcal` is authoritative and is never re-derived, so it routinely
   * disagrees with the sum of the macro energies. The shares must describe the
   * grams regardless — the ring is drawn across the calorie progress separately.
   */
  it("ignores the stored kcal entirely", () => {
    const withKcal = macroEnergyShares(macros(10, 10, 10, 2000))
    const withoutKcal = macroEnergyShares(macros(10, 10, 10, 0))
    expect(withKcal).toEqual(withoutKcal)
  })

  it("treats a negative macro as absent rather than subtracting energy", () => {
    const shares = macroEnergyShares(macros(-10, 10, 0))
    expect(shares).toEqual({ protein: 0, carbs: 1, fat: 0 })
  })

  it("uses the general Atwater factors", () => {
    expect(ATWATER).toEqual({ protein: 4, carbs: 4, fat: 9 })
  })
})

describe("dominantMacro", () => {
  it("names the macro carrying the most energy", () => {
    expect(dominantMacro(macros(40, 5, 2))).toBe("protein")
    expect(dominantMacro(macros(5, 60, 2))).toBe("carbs")
    expect(dominantMacro(macros(5, 5, 30))).toBe("fat")
  })

  /**
   * The case that makes this worth a function: 20 g of carbs and 15 g of fat is
   * 80 kcal against 135, so the meal is a fat meal even though the carb number
   * on the label is bigger. Picking the largest *gram* count would colour it
   * yellow and say something false.
   */
  it("is decided by energy, not by the biggest gram figure", () => {
    expect(dominantMacro(macros(0, 20, 15))).toBe("fat")
  })

  it("is null when nothing was eaten", () => {
    expect(dominantMacro(ZERO_MACROS)).toBeNull()
  })

  it("breaks a tie the same way every time", () => {
    // 10 g protein and 10 g carbs are both 40 kcal.
    expect(dominantMacro(macros(10, 10, 0))).toBe("protein")
    // 9 g carbs and 4 g fat are both 36 kcal.
    expect(dominantMacro(macros(0, 9, 4))).toBe("carbs")
  })
})
