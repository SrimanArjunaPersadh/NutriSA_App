import { describe, expect, it } from "vitest"

import { numbersIn, unsourcedNumbers } from "../server/ai/number-check"

/**
 * The unsourced-number check (plan.md, Phase 9, Q21 and Q30): every number in
 * a reply must come from that turn's lookups or the user's own words.
 */

describe("numbersIn", () => {
  it("reads whole numbers and decimals", () => {
    expect(numbersIn("You had 1870 kcal and 48.5 g protein")).toEqual([1870, 48.5])
  })

  it("reads a thousands comma as a separator", () => {
    expect(numbersIn("1,870 kcal, 12,345 steps")).toEqual([1870, 12345])
  })

  it("reads any other comma between digits as a decimal comma", () => {
    expect(numbersIn("1,5 cups")).toEqual([1.5])
  })

  it("reads the parts of a date and a time", () => {
    expect(numbersIn("2026-10-28 at 08:30")).toEqual([2026, 10, 28, 8, 30])
  })

  it("ignores the sign, so a quoted delta still matches", () => {
    expect(numbersIn("down -0.4 kg")).toEqual([0.4])
  })
})

describe("unsourcedNumbers", () => {
  const tools = JSON.stringify({ consumed: { kcal: 1870, protein: 48.5 }, remaining: { kcal: 430 } })

  it("passes a reply that quotes the lookups exactly", () => {
    expect(unsourcedNumbers("You've had 1,870 kcal and have 430 kcal left, with 48.5 g protein.", [tools])).toEqual([])
  })

  it("treats 48 and 48.0 as the same number", () => {
    expect(unsourcedNumbers("48.0 g", [JSON.stringify({ p: 48 })])).toEqual([])
  })

  it("flags a number the model worked out", () => {
    // 1870 + 430 = 2300: a sum no lookup returned.
    expect(unsourcedNumbers("Your target is 2,300 kcal.", [tools])).toEqual([2300])
  })

  it("flags a rounding, because rounding is arithmetic", () => {
    expect(unsourcedNumbers("about 49 g of protein", [tools])).toEqual([49])
  })

  it("flags a percentage worked out from the figures", () => {
    expect(unsourcedNumbers("You're at 81% of your target.", [tools])).toEqual([81])
  })

  it("accepts numbers from the user's own message", () => {
    expect(unsourcedNumbers("Logging 250 g of chicken.", [tools, "I had 250g chicken"])).toEqual([])
  })

  it("allows small counts, which carry no measurement", () => {
    expect(unsourcedNumbers("You logged 3 meals; try 1 or 2 more vegetables.", [tools])).toEqual([])
  })

  it("does not wave through a large count", () => {
    expect(unsourcedNumbers("13 days in a row", [tools])).toEqual([13])
  })

  it("always allows the coach's kcal floor, which the prompt states", () => {
    expect(unsourcedNumbers("Please don't go under 1,200 kcal a day.", [])).toEqual([])
  })

  it("lists each missing number once", () => {
    expect(unsourcedNumbers("99 and 99 again", [])).toEqual([99])
  })

  it("is empty for a reply with no numbers", () => {
    expect(unsourcedNumbers("Nice work today!", [])).toEqual([])
  })

  describe("fixed text (the helpline numbers)", () => {
    const fixed = ["0800 456 789", "31393", "0800 567 567"]

    it("passes a reply that gives the helpline", () => {
      expect(unsourcedNumbers("Call 0800 456 789 or SMS 31393, or 0800 567 567 now.", [], fixed)).toEqual([])
    })

    it("does not let the helpline's digits vouch for an invented number", () => {
      expect(unsourcedNumbers("Call 0800 456 789. Aim for 456 kcal at dinner.", [], fixed)).toEqual([456])
    })
  })
})
