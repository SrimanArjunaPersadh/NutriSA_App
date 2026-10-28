import { describe, expect, it } from "vitest"

import { commonMeasure, measureFromServingSize, naturalMeasure, suggestedWeight, weightFromQty } from "./measures"

describe("measureFromServingSize", () => {
  it("takes a serving named by a thing", () => {
    expect(measureFromServingSize("1 slice (35 g)", 35)).toEqual({ noun: "slice", grams: 35 })
    expect(measureFromServingSize("1 bar (40g)", 40)).toEqual({ noun: "bar", grams: 40 })
    expect(measureFromServingSize("1 tub", 175)).toEqual({ noun: "tub", grams: 175 })
  })

  it("splits a serving of several into one", () => {
    expect(measureFromServingSize("2 biscuits (25 g)", 25)).toEqual({ noun: "biscuit", grams: 12.5 })
    expect(measureFromServingSize("2 slices (70 g)", 70)).toEqual({ noun: "slice", grams: 35 })
    expect(measureFromServingSize("½ cup (40 g)", 40)).toEqual({ noun: "cup", grams: 80 })
  })

  it("refuses a serving that is only a weight or a volume", () => {
    expect(measureFromServingSize("30 g", 30)).toBeNull()
    expect(measureFromServingSize("30g", 30)).toBeNull()
    expect(measureFromServingSize("250 ml", 250)).toBeNull()
    expect(measureFromServingSize("100 grams", 100)).toBeNull()
  })

  it("needs the weight to go with the words", () => {
    expect(measureFromServingSize("1 slice", null)).toBeNull()
    expect(measureFromServingSize(null, 35)).toBeNull()
  })
})

describe("commonMeasure", () => {
  it("knows everyday foods", () => {
    expect(commonMeasure("Banana", "g")).toEqual({ noun: "banana", grams: 118 })
    expect(commonMeasure("Albany Superior Brown Bread", "g")).toEqual({ noun: "slice", grams: 38 })
    expect(commonMeasure("Large eggs", "g")).toEqual({ noun: "egg", grams: 50 })
    expect(commonMeasure("Clover Full Cream Milk", "ml")).toEqual({ noun: "glass", grams: 250 })
  })

  it("cuts sourdough thicker than sandwich bread", () => {
    expect(commonMeasure("Sunbake Sourdough", "g")).toEqual({ noun: "slice", grams: 44 })
    // With the bread word after it, as the coach found on the iPhone (2026-10-28).
    expect(commonMeasure("Sourdough bread", "g")).toEqual({ noun: "slice", grams: 44 })
    expect(commonMeasure("Big sourdough bread", "g")).toEqual({ noun: "slice", grams: 44 })
    expect(commonMeasure("Sourdough loaf", "g")).toEqual({ noun: "slice", grams: 44 })
    expect(commonMeasure("Albany Brown Bread", "g")).toEqual({ noun: "slice", grams: 38 })
  })

  it("takes the first match, so the specific beats the general", () => {
    expect(commonMeasure("Banana bread", "g")?.noun).toBe("slice")
    expect(commonMeasure("Black Cat Smooth Peanut Butter", "g")).toEqual({ noun: "tablespoon", grams: 16 })
    expect(commonMeasure("Sweet potato", "g")?.noun).toBe("sweet potato")
  })

  it("does not match a word inside another", () => {
    expect(commonMeasure("Eggplant", "g")).toBeNull()
    expect(commonMeasure("Pineapple", "g")).toBeNull()
  })

  it("will not put a volume measure on a weighed food", () => {
    expect(commonMeasure("Full cream milk", "g")).toBeNull()
  })

  it("only counts the food the name ends with", () => {
    expect(commonMeasure("Baked Beans in Tomato Sauce", "g")).toBeNull()
    expect(commonMeasure("Banana flavoured yoghurt", "g")).toBeNull()
    expect(commonMeasure("Bananas, raw", "g")?.noun).toBe("banana")
  })

  it("leaves foods it does not know alone", () => {
    expect(commonMeasure("Chicken mayo", "g")).toBeNull()
  })
})

describe("naturalMeasure", () => {
  it("prefers the packet, then the list, and only for weighed foods", () => {
    expect(naturalMeasure("White Bread", "g", 35, "1 slice (35 g)")).toEqual({ noun: "slice", grams: 35 })
    expect(naturalMeasure("White Bread", "g", null, null)).toEqual({ noun: "slice", grams: 38 })
    expect(naturalMeasure("Banana", "piece", 1, null)).toBeNull()
  })
})

describe("weightFromQty", () => {
  it("takes a real weight", () => {
    expect(weightFromQty("200g", 106)).toEqual({ amount: 200, unit: "g" })
    expect(weightFromQty("60 g", 228)).toEqual({ amount: 60, unit: "g" })
    expect(weightFromQty("250 ml", 120)).toEqual({ amount: 250, unit: "ml" })
    expect(weightFromQty("1.5 bananas (177 g)", 158)).toEqual({ amount: 177, unit: "g" })
  })

  it("refuses a 'g' that could not hold the calories", () => {
    expect(weightFromQty("0.75g", 99)).toBeNull()
    expect(weightFromQty("2g", 180)).toBeNull()
    expect(weightFromQty("1g", 72)).toBeNull()
  })

  it("refuses an amount that is not a weight", () => {
    expect(weightFromQty("2 slices", 180)).toBeNull()
    expect(weightFromQty("0.5 servings", 108)).toBeNull()
  })
})

describe("suggestedWeight", () => {
  it("multiplies the amount's number by the common measure", () => {
    expect(suggestedWeight("Sunbake Sourdough", "2g")).toBe(88)
    expect(suggestedWeight("Banana (small)", "1g")).toBe(118)
  })

  it("has no guess for foods off the list", () => {
    expect(suggestedWeight("Vanilla Whey Protein", "0.75g")).toBeNull()
  })
})
