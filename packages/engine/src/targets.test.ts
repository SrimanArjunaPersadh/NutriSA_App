import { describe, expect, it } from "vitest"

import { resolveTargetForDate, type TargetRow } from "./targets"

const MAY: TargetRow = {
  validFrom: "2026-05-01",
  kcal: 2300,
  protein: 167,
  carbs: 195,
  fat: 60,
}
const JULY: TargetRow = {
  validFrom: "2026-07-01",
  kcal: 2200,
  protein: 175,
  carbs: 170,
  fat: 58,
}

describe("resolveTargetForDate", () => {
  const rows = [MAY, JULY]

  it("takes effect on its own validFrom", () => {
    expect(resolveTargetForDate(rows, "2026-07-01")).toBe(JULY)
  })

  it("holds until a later row supersedes it", () => {
    expect(resolveTargetForDate(rows, "2026-06-30")).toBe(MAY)
    expect(resolveTargetForDate(rows, "2026-05-01")).toBe(MAY)
  })

  it("keeps the latest row in force indefinitely", () => {
    // No valid_to column, so the newest row never expires.
    expect(resolveTargetForDate(rows, "2027-01-01")).toBe(JULY)
  })

  it("does not rewrite history when targets change", () => {
    // The whole reason for effective dating: a change in July must leave a day
    // in June resolving to what the user was actually working to at the time.
    expect(resolveTargetForDate(rows, "2026-06-15")).toBe(MAY)
  })

  it("is null before the first row", () => {
    // A real state — every day before the user set any targets.
    expect(resolveTargetForDate(rows, "2026-04-30")).toBeNull()
    expect(resolveTargetForDate([], "2026-08-12")).toBeNull()
  })

  it("does not depend on the array's order", () => {
    expect(resolveTargetForDate([JULY, MAY], "2026-06-15")).toBe(MAY)
    expect(resolveTargetForDate([JULY, MAY], "2026-08-01")).toBe(JULY)
  })
})
