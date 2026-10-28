import { describe, expect, it } from "vitest"

import {
  ATWATER,
  dominantMacro,
  kcalFromMacros,
  labelKcal,
  macroEnergyShares,
  NO_SHARES,
} from "./energy"
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

describe("kcalFromMacros", () => {
  /**
   * The real target on record, and the reason the Goals screen shows this as a
   * note instead of deriving the calorie target from it: 167 / 195 / 60 is
   * 668 + 780 + 540 = 1988 kcal, against a confirmed target of 2300.
   */
  it("prices the macros at 4 / 4 / 9 kcal per gram", () => {
    expect(kcalFromMacros({ protein: 167, carbs: 195, fat: 60 })).toBe(1988)
  })

  it("is zero for no macros at all", () => {
    expect(kcalFromMacros({ protein: 0, carbs: 0, fat: 0 })).toBe(0)
  })

  it("rounds to whole kcal, because it sits beside a whole-kcal target", () => {
    // 12.3 g protein = 49.2 kcal; 0.1 g fat = 0.9 kcal; 50.1 in all.
    expect(kcalFromMacros({ protein: 12.3, carbs: 0, fat: 0.1 })).toBe(50)
  })

  it("counts a negative or non-finite gram figure as zero", () => {
    expect(kcalFromMacros({ protein: -10, carbs: 25, fat: Number.NaN })).toBe(100)
    expect(kcalFromMacros({ protein: Number.POSITIVE_INFINITY, carbs: 0, fat: 0 })).toBe(0)
  })
})

describe("labelKcal", () => {
  /**
   * Decided 2026-10-26: when the label prints kcal, use it. 1590 kJ converts
   * to 380, and a label rounding each figure on its own may print 379.
   */
  it("prefers the printed kcal over the converted kJ", () => {
    expect(labelKcal({ kcal: 379, kj: 1590 })).toBe(379)
  })

  it("converts the kJ when no kcal is printed", () => {
    expect(labelKcal({ kcal: null, kj: 1590 })).toBe(380)
  })

  it("is null when the label gave no energy at all, not zero", () => {
    expect(labelKcal({ kcal: null, kj: null })).toBeNull()
  })
})
