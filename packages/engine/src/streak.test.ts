import { describe, expect, it } from "vitest"

import { currentStreak, longestStreak, NO_STREAK } from "./streak"

/** Consecutive days ending on `end`, oldest first. */
function run(end: string, length: number): string[] {
  const days: string[] = []
  const base = Date.parse(`${end}T00:00:00.000Z`)
  for (let i = length - 1; i >= 0; i--) {
    days.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10))
  }
  return days
}

const TODAY = "2026-08-14"

describe("currentStreak", () => {
  it("is nothing when nothing is logged", () => {
    expect(currentStreak([], TODAY)).toEqual(NO_STREAK)
  })

  it("counts a run that includes today, and lights it", () => {
    expect(currentStreak(run(TODAY, 12), TODAY)).toEqual({ days: 12, lit: true })
  })

  /**
   * The state the whole module exists for. A 12-day run ending yesterday, on a
   * morning before the first meal: still 12, still unlit. Counting 0 here would
   * tell the user they had lost a run they still have all day to keep.
   */
  it("keeps the run alive on a day not logged yet, unlit", () => {
    expect(currentStreak(run("2026-08-13", 12), TODAY)).toEqual({
      days: 12,
      lit: false,
    })
  })

  it("breaks once a whole day has passed with nothing on it", () => {
    // Run ended on the 12th. The 13th passed empty, so by the 14th it is over.
    expect(currentStreak(run("2026-08-12", 12), TODAY)).toEqual(NO_STREAK)
  })

  it("counts a single day logged today", () => {
    expect(currentStreak([TODAY], TODAY)).toEqual({ days: 1, lit: true })
  })

  it("counts a single day logged yesterday", () => {
    expect(currentStreak(["2026-08-13"], TODAY)).toEqual({ days: 1, lit: false })
  })

  it("counts only the current run, not the total logged days", () => {
    const days = [...run("2026-06-01", 30), ...run(TODAY, 3)]
    expect(currentStreak(days, TODAY)).toEqual({ days: 3, lit: true })
  })

  it("stops at the first gap", () => {
    // 10th, 11th, then a gap on the 12th, then 13th and 14th.
    const days = ["2026-08-10", "2026-08-11", "2026-08-13", "2026-08-14"]
    expect(currentStreak(days, TODAY)).toEqual({ days: 2, lit: true })
  })

  it("does not care what order the days arrive in", () => {
    const shuffled = [...run(TODAY, 5)].reverse()
    expect(currentStreak(shuffled, TODAY)).toEqual({ days: 5, lit: true })
  })

  it("counts a duplicated day once", () => {
    const days = [...run(TODAY, 3), TODAY, "2026-08-13"]
    expect(currentStreak(days, TODAY)).toEqual({ days: 3, lit: true })
  })

  it("ignores days after today", () => {
    const days = [...run(TODAY, 4), "2026-08-15", "2026-08-16"]
    expect(currentStreak(days, TODAY)).toEqual({ days: 4, lit: true })
  })

  it("crosses a month boundary", () => {
    // 2026-07-30, 07-31, 08-01 — the streak has to step by calendar day, not
    // by arithmetic on the day-of-month.
    const days = ["2026-07-30", "2026-07-31", "2026-08-01"]
    expect(currentStreak(days, "2026-08-01")).toEqual({ days: 3, lit: true })
  })

  it("crosses a leap day", () => {
    // 2028 is a leap year. A run through 2028-02-28 → 02-29 → 03-01 is only
    // continuous if the step goes through a real calendar.
    const days = ["2028-02-28", "2028-02-29", "2028-03-01"]
    expect(currentStreak(days, "2028-03-01")).toEqual({ days: 3, lit: true })
  })
})

describe("longestStreak", () => {
  it("is zero with no history", () => {
    expect(longestStreak([])).toBe(0)
  })

  it("is one for a single logged day", () => {
    expect(longestStreak([TODAY])).toBe(1)
  })

  it("finds the longest run, not the most recent", () => {
    const days = [...run("2026-06-30", 21), ...run(TODAY, 3)]
    expect(longestStreak(days)).toBe(21)
  })

  it("is unaffected by order or duplicates", () => {
    const days = [...run(TODAY, 6), ...run(TODAY, 6)].reverse()
    expect(longestStreak(days)).toBe(6)
  })

  it("counts an unbroken history as one run", () => {
    expect(longestStreak(run(TODAY, 40))).toBe(40)
  })
})
