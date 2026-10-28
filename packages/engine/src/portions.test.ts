import { describe, expect, it } from "vitest"

import { ZERO_MACROS, type Macros } from "./macros"
import {
  fractionOfQuantity,
  isPortionUnit,
  portionRange,
  quantityAtFraction,
  stepQuantity,
  PORTION_BASIS,
  PORTION_UNITS,
  portionLabel,
  scalePortion,
  servingPresets,
  amountForMeasure,
  gramsPerMeasure,
  measureCount,
  isSayableCount,
  measureLabel,
  pluralNoun,
  perHundredFrom,
  isPlausibleWeight,
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
    expect(portionLabel(1, "serving")).toBe("1 serving")
    expect(portionLabel(1.5, "serving")).toBe("1.5 servings")
  })

  it("keeps a fractional amount as written", () => {
    expect(portionLabel(0.5, "cup")).toBe("0.5 cups")
  })
})

describe("portionRange", () => {
  it("reaches three servings when that is more than the floor", () => {
    expect(portionRange("g", 170)).toEqual({ max: 510, step: 5 })
  })

  it("never ends below a plateful", () => {
    expect(portionRange("g", 20)).toEqual({ max: 300, step: 5 })
    expect(portionRange("slice", 1)).toEqual({ max: 4, step: 0.5 })
  })

  it("rounds the far end up to a whole step", () => {
    expect(portionRange("g", 101).max).toBe(305)
  })

  it("survives a nonsense serving", () => {
    expect(portionRange("ml", Number.NaN)).toEqual({ max: 300, step: 5 })
  })
})

describe("quantityAtFraction / fractionOfQuantity", () => {
  const range = { max: 300, step: 5 }

  it("snaps to the step", () => {
    expect(quantityAtFraction(0.334, range)).toBe(100)
  })

  it("never returns less than one step", () => {
    expect(quantityAtFraction(0, range)).toBe(5)
    expect(quantityAtFraction(-1, range)).toBe(5)
  })

  it("pins past the end to the end", () => {
    expect(quantityAtFraction(2, range)).toBe(300)
    expect(fractionOfQuantity(900, range)).toBe(1)
  })

  it("keeps halves for countable units", () => {
    expect(quantityAtFraction(0.4, { max: 4, step: 0.5 })).toBe(1.5)
  })

  it("round-trips a value on the grid", () => {
    expect(quantityAtFraction(fractionOfQuantity(170, range), range)).toBe(170)
  })

  it("puts nothing typed at the start", () => {
    expect(fractionOfQuantity(0, range)).toBe(0)
    expect(fractionOfQuantity(Number.NaN, range)).toBe(0)
  })
})

describe("stepQuantity", () => {
  const range = { max: 300, step: 5 }

  it("moves one notch", () => {
    expect(stepQuantity(170, 1, range)).toBe(175)
    expect(stepQuantity(170, -1, range)).toBe(165)
  })

  it("snaps an off-grid amount onto the grid", () => {
    expect(stepQuantity(172, 1, range)).toBe(175)
  })

  it("stops at both ends", () => {
    expect(stepQuantity(300, 1, range)).toBe(300)
    expect(stepQuantity(5, -1, range)).toBe(5)
  })
})

describe("servingPresets", () => {
  it("offers the serving, 100 and half for weighed units", () => {
    expect(servingPresets("g", 175)).toEqual([
      { kind: "serving", quantity: 175 },
      { kind: "hundred", quantity: 100 },
      { kind: "half", quantity: 90 },
    ])
  })

  it("snaps half to the slider's grid", () => {
    // 87.5 g is not on a 5 g grid; the slider would never land there.
    expect(servingPresets("ml", 175).find((p) => p.kind === "half")?.quantity).toBe(90)
  })

  it("offers half and double for countable units", () => {
    expect(servingPresets("slice", 2)).toEqual([
      { kind: "serving", quantity: 2 },
      { kind: "half", quantity: 1 },
      { kind: "double", quantity: 4 },
    ])
  })

  it("drops a chip that repeats another amount", () => {
    expect(servingPresets("g", 100)).toEqual([
      { kind: "serving", quantity: 100 },
      { kind: "half", quantity: 50 },
    ])
  })

  it("drops a half that snaps back onto the serving", () => {
    // A quarter slice snaps to the 0.5 grid, which is the serving again.
    expect(servingPresets("slice", 0.5).map((p) => p.kind)).toEqual(["serving", "double"])
  })

  it("still offers 100 g when the serving is unknown", () => {
    expect(servingPresets("g", 0)).toEqual([{ kind: "hundred", quantity: 100 }])
    expect(servingPresets("cup", Number.NaN)).toEqual([])
  })
})

describe("measures", () => {
  const banana = { noun: "banana", grams: 118 }

  it("pluralises the last word only, and only when the count is not one", () => {
    expect(pluralNoun("banana", 1)).toBe("banana")
    expect(pluralNoun("banana", 2)).toBe("bananas")
    expect(pluralNoun("banana", 0.5)).toBe("bananas")
    expect(pluralNoun("medium banana", 2)).toBe("medium bananas")
    expect(pluralNoun("peach", 2)).toBe("peaches")
    expect(pluralNoun("berry", 3)).toBe("berries")
    expect(pluralNoun("glass", 2)).toBe("glasses")
  })

  it("converts between a count of measures and grams", () => {
    expect(measureCount(177, banana)).toBe(1.5)
    expect(amountForMeasure(1.5, banana)).toBe(177)
    expect(amountForMeasure(1, banana)).toBe(118)
    expect(measureCount(0, banana)).toBe(0)
    expect(amountForMeasure(Number.NaN, banana)).toBe(0)
  })

  it("splits a label's serving into one measure", () => {
    expect(gramsPerMeasure(25, 2)).toBe(12.5)
    expect(gramsPerMeasure(35, 1)).toBe(35)
    expect(gramsPerMeasure(0, 1)).toBeNull()
    expect(gramsPerMeasure(25, 0)).toBeNull()
  })

  it("labels an amount by its measure, with the weight beside it", () => {
    expect(measureLabel(118, banana, "g")).toBe("1 banana (118 g)")
    expect(measureLabel(177, banana, "g")).toBe("1.5 bananas (177 g)")
    expect(measureLabel(70, { noun: "slice", grams: 35 }, "g")).toBe("2 slices (70 g)")
    expect(measureLabel(250, { noun: "glass", grams: 250 }, "ml")).toBe("1 glass (250 ml)")
  })

  it("labels an amount that is no whole or half count by its weight alone", () => {
    const breast = { noun: "breast", grams: 170 }
    expect(measureLabel(200, breast, "g")).toBe("200 g")
    expect(measureLabel(150, breast, "g")).toBe("150 g")
    expect(measureLabel(85, breast, "g")).toBe("0.5 breasts (85 g)")
    expect(measureLabel(176, { noun: "slice", grams: 44 }, "g")).toBe("4 slices (176 g)")
  })

  it("says which counts a person would say", () => {
    expect([0.5, 1, 1.5, 4].every(isSayableCount)).toBe(true)
    expect([0, -1, 1.18, 0.25, Number.NaN].some(isSayableCount)).toBe(false)
  })
})

describe("perHundredFrom / isPlausibleWeight", () => {
  it("recovers per-100 macros from a total and its weight", () => {
    expect(perHundredFrom({ kcal: 106, protein: 20, carbs: 7, fat: 0 }, 200)).toEqual({
      kcal: 53,
      protein: 10,
      carbs: 3.5,
      fat: 0,
    })
  })

  it("round-trips through scalePortion", () => {
    const per = perHundredFrom({ kcal: 180, protein: 6, carbs: 34, fat: 1 }, 76)!
    expect(scalePortion(per, 76, "g").kcal).toBe(180)
  })

  it("refuses a weight that is not positive", () => {
    expect(perHundredFrom({ kcal: 100, protein: 0, carbs: 0, fat: 0 }, 0)).toBeNull()
  })

  it("rejects grams that could not hold the calories", () => {
    expect(isPlausibleWeight(99, 0.75)).toBe(false)
    expect(isPlausibleWeight(180, 2)).toBe(false)
    expect(isPlausibleWeight(106, 200)).toBe(true)
    expect(isPlausibleWeight(31, 10)).toBe(true)
    expect(isPlausibleWeight(0, 2)).toBe(true)
  })
})
