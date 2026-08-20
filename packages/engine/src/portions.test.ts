import { describe, expect, it } from "vitest"

import { ZERO_MACROS, type Macros } from "./macros"
import {
  isPortionUnit,
  PORTION_BASIS,
  PORTION_UNITS,
  portionLabel,
  scalePortion,
} from "./portions"

/** A label's worth: per 100 g of something ordinary. */
const per100: Macros = { kcal: 350, protein: 12.5, carbs: 60, fat: 5.5 }
/** Per one countable thing. */
const perOne: Macros = { kcal: 78, protein: 6.3, carbs: 0.6, fat: 5.3 }

describe("PORTION_BASIS", () => {
  it("covers every unit", () => {
    for (const unit of PORTION_UNITS) {
      expect(PORTION_BASIS[unit], `${unit} has no basis`).toBeGreaterThan(0)
    }
  })

  it("quotes weight and volume per 100, everything else per one", () => {
    expect(PORTION_BASIS.g).toBe(100)
    expect(PORTION_BASIS.ml).toBe(100)
    for (const unit of PORTION_UNITS) {
      if (unit === "g" || unit === "ml") continue
      expect(PORTION_BASIS[unit], `${unit} should be counted, not weighed`).toBe(1)
    }
  })
})

describe("scalePortion", () => {
  it("scales a per-100 label by grams", () => {
    expect(scalePortion(per100, 150, "g")).toEqual({
      kcal: 525,
      protein: 18.8,
      carbs: 90,
      fat: 8.3,
    })
  })

  it("returns the label itself at exactly one basis", () => {
    expect(scalePortion(per100, 100, "g")).toEqual(per100)
    expect(scalePortion(perOne, 1, "slice")).toEqual(perOne)
  })

  it("multiplies countable units by the count", () => {
    expect(scalePortion(perOne, 2, "slice")).toEqual({
      kcal: 156,
      protein: 12.6,
      carbs: 1.2,
      fat: 10.6,
    })
  })

  it("treats ml the same way as g", () => {
    expect(scalePortion(per100, 250, "ml")).toEqual(scalePortion(per100, 250, "g"))
  })

  it("rounds energy whole and grams to one decimal", () => {
    // 33 g of the label above: 115.5 kcal, 4.125 g protein, 19.8 carbs, 1.815 fat.
    expect(scalePortion(per100, 33, "g")).toEqual({
      kcal: 116,
      protein: 4.1,
      carbs: 19.8,
      fat: 1.8,
    })
  })

  it("is zero at a zero quantity", () => {
    expect(scalePortion(per100, 0, "g")).toEqual(ZERO_MACROS)
  })

  /**
   * The form's own states, not hypotheticals: a quantity field passes through
   * "" and "-" on the way to a number, and `Number("")` is 0 while `Number("-")`
   * is NaN. A NaN reaching the running total would print "NaN g" against every
   * macro on the screen.
   */
  it("is zero rather than NaN for a half-typed quantity", () => {
    expect(scalePortion(per100, Number.NaN, "g")).toEqual(ZERO_MACROS)
    expect(scalePortion(per100, Number.POSITIVE_INFINITY, "g")).toEqual(ZERO_MACROS)
    expect(scalePortion(per100, -5, "g")).toEqual(ZERO_MACROS)
  })
})

describe("isPortionUnit", () => {
  it("accepts every unit it ships", () => {
    for (const unit of PORTION_UNITS) expect(isPortionUnit(unit)).toBe(true)
  })

  it("refuses anything else", () => {
    expect(isPortionUnit("kg")).toBe(false)
    expect(isPortionUnit("")).toBe(false)
    expect(isPortionUnit("G")).toBe(false)
  })
})

describe("portionLabel", () => {
  it("keeps weight and volume abbreviations bare", () => {
    expect(portionLabel(150, "g")).toBe("150 g")
    expect(portionLabel(1, "g")).toBe("1 g")
    expect(portionLabel(250, "ml")).toBe("250 ml")
  })

  it("pluralises countable units and only those", () => {
    expect(portionLabel(1, "slice")).toBe("1 slice")
    expect(portionLabel(2, "slice")).toBe("2 slices")
    expect(portionLabel(1, "piece")).toBe("1 piece")
    expect(portionLabel(3, "cup")).toBe("3 cups")
    expect(portionLabel(2, "tbsp")).toBe("2 tbsp")
    expect(portionLabel(2, "tsp")).toBe("2 tsp")
  })

  it("keeps a fractional amount as written", () => {
    expect(portionLabel(0.5, "cup")).toBe("0.5 cups")
  })
})
