import { describe, expect, it } from "vitest"

import {
  AI_CHEAPER_RUNG_USD,
  AI_MONTHLY_BUDGET_USD,
  aiBudgetMonth,
  aiBudgetRung,
  aiSpendShown,
  belowSafeFloor,
  COACH_KCAL_FLOOR,
  servingsQuantity,
} from "./assistant"

describe("aiBudgetRung", () => {
  it("is the full model with nothing spent", () => {
    expect(aiBudgetRung(0)).toBe("full")
  })

  it("stays full just under the cheaper rung", () => {
    expect(aiBudgetRung(3.999999)).toBe("full")
  })

  it("moves to the cheaper model at exactly $4", () => {
    expect(aiBudgetRung(AI_CHEAPER_RUNG_USD)).toBe("cheaper")
  })

  it("stays on the cheaper model just under $5", () => {
    expect(aiBudgetRung(4.999999)).toBe("cheaper")
  })

  it("is exhausted at exactly $5", () => {
    expect(aiBudgetRung(AI_MONTHLY_BUDGET_USD)).toBe("exhausted")
  })

  it("stays exhausted past $5, which the ledger's misses can cause", () => {
    expect(aiBudgetRung(7.5)).toBe("exhausted")
  })
})

describe("aiSpendShown", () => {
  it("cuts to whole cents, rounding down", () => {
    expect(aiSpendShown(0.4213)).toBe(0.42)
    expect(aiSpendShown(1.239)).toBe(1.23)
  })

  it("never shows the budget before it is reached", () => {
    expect(aiSpendShown(4.996)).toBe(4.99)
    expect(aiBudgetRung(4.996)).toBe("cheaper")
    expect(aiSpendShown(5)).toBe(5)
  })

  it("keeps a cent a float would lose", () => {
    expect(aiSpendShown(0.29)).toBe(0.29)
    expect(aiSpendShown(0.57)).toBe(0.57)
  })

  it("is zero for nothing, or for nonsense", () => {
    expect(aiSpendShown(0)).toBe(0)
    expect(aiSpendShown(-1)).toBe(0)
    expect(aiSpendShown(Number.NaN)).toBe(0)
  })
})

describe("aiBudgetMonth", () => {
  it("runs from the 1st to the 1st of the next month", () => {
    const month = aiBudgetMonth("2026-10-28")
    expect(month.firstDay).toBe("2026-10-01")
    expect(month.resetsOn).toBe("2026-11-01")
  })

  it("starts at SAST midnight, 22:00 UTC the day before", () => {
    const month = aiBudgetMonth("2026-10-28")
    expect(month.fromUtc.toISOString()).toBe("2026-09-30T22:00:00.000Z")
    expect(month.toUtc.toISOString()).toBe("2026-10-31T22:00:00.000Z")
  })

  it("is the same month on its first and last day", () => {
    expect(aiBudgetMonth("2026-10-01").firstDay).toBe("2026-10-01")
    expect(aiBudgetMonth("2026-10-31").resetsOn).toBe("2026-11-01")
  })

  it("rolls over the year", () => {
    const month = aiBudgetMonth("2026-12-15")
    expect(month.resetsOn).toBe("2027-01-01")
    expect(month.toUtc.toISOString()).toBe("2026-12-31T22:00:00.000Z")
  })

  it("handles February, short and leap", () => {
    expect(aiBudgetMonth("2027-02-28").resetsOn).toBe("2027-03-01")
    expect(aiBudgetMonth("2028-02-29").resetsOn).toBe("2028-03-01")
  })
})

describe("belowSafeFloor", () => {
  it("is 1,200 kcal", () => {
    expect(COACH_KCAL_FLOOR).toBe(1200)
  })

  it("flags a target under the floor", () => {
    expect(belowSafeFloor(1199)).toBe(true)
    expect(belowSafeFloor(600)).toBe(true)
  })

  it("accepts the floor itself and above", () => {
    expect(belowSafeFloor(1200)).toBe(false)
    expect(belowSafeFloor(2300)).toBe(false)
  })
})

describe("servingsQuantity", () => {
  it("multiplies a count of servings out to the serving's unit", () => {
    expect(servingsQuantity(2, 50)).toBe(100)
    expect(servingsQuantity(1.5, 30)).toBe(45)
  })

  it("keeps one decimal", () => {
    expect(servingsQuantity(3, 33.3)).toBe(99.9)
    expect(servingsQuantity(0.333, 10)).toBe(3.3)
  })

  it("is zero for a count or serving that is not positive", () => {
    expect(servingsQuantity(0, 50)).toBe(0)
    expect(servingsQuantity(-1, 50)).toBe(0)
    expect(servingsQuantity(2, 0)).toBe(0)
    expect(servingsQuantity(Number.NaN, 50)).toBe(0)
  })
})

