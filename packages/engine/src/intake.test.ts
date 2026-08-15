import { describe, expect, it } from "vitest"

import { averageDailyIntake, type DayIntake } from "./intake"

const macros = (kcal: number, protein = 0, carbs = 0, fat = 0) => ({
  kcal,
  protein,
  carbs,
  fat,
})

/** Seven consecutive days ending 2026-08-14, each with the given energy. */
function week(kcals: readonly number[]): DayIntake[] {
  return kcals.map((kcal, i) => ({
    day: `2026-08-${String(8 + i).padStart(2, "0")}`,
    macros: macros(kcal),
  }))
}

describe("averageDailyIntake", () => {
  it("returns null when nothing in the window is logged", () => {
    expect(averageDailyIntake([], "2026-08-14")).toBeNull()
  })

  it("returns null when every log falls outside the window", () => {
    const old = [{ day: "2026-07-01", macros: macros(2000) }]
    expect(averageDailyIntake(old, "2026-08-14")).toBeNull()
  })

  it("averages a full week", () => {
    const result = averageDailyIntake(week([2100, 2200, 2300, 2400, 2000, 2500, 1900]), "2026-08-14")
    expect(result?.loggedDays).toBe(7)
    expect(result?.average.kcal).toBe(2200)
    expect(result?.from).toBe("2026-08-08")
    expect(result?.to).toBe("2026-08-14")
  })

  /**
   * The behaviour the module note argues for. Three logged days at 2100 average
   * 2100, not 900 — dividing by a fixed 7 would show a 57% "drop" caused
   * entirely by not opening the app.
   */
  it("divides by days logged, not days elapsed", () => {
    const sparse: DayIntake[] = [
      { day: "2026-08-10", macros: macros(2100) },
      { day: "2026-08-12", macros: macros(2100) },
      { day: "2026-08-14", macros: macros(2100) },
    ]
    const result = averageDailyIntake(sparse, "2026-08-14")
    expect(result?.loggedDays).toBe(3)
    expect(result?.average.kcal).toBe(2100)
  })

  it("reports unlogged days as null in the series, never as zero", () => {
    const sparse: DayIntake[] = [{ day: "2026-08-14", macros: macros(2100) }]
    const result = averageDailyIntake(sparse, "2026-08-14")
    expect(result?.series).toHaveLength(7)
    expect(result?.series.slice(0, 6).every((point) => point.kcal === null)).toBe(true)
    expect(result?.series.at(-1)?.kcal).toBe(2100)
  })

  it("orders the series oldest first regardless of input order", () => {
    const shuffled = [...week([1, 2, 3, 4, 5, 6, 7])].reverse()
    const result = averageDailyIntake(shuffled, "2026-08-14")
    expect(result?.series.map((point) => point.kcal)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("ignores days outside the window without failing", () => {
    const mixed: DayIntake[] = [
      { day: "2026-08-07", macros: macros(9999) }, // one day too old
      { day: "2026-08-15", macros: macros(9999) }, // one day too new
      { day: "2026-08-14", macros: macros(2000) },
    ]
    const result = averageDailyIntake(mixed, "2026-08-14")
    expect(result?.loggedDays).toBe(1)
    expect(result?.average.kcal).toBe(2000)
  })

  it("includes both ends of the window", () => {
    const edges: DayIntake[] = [
      { day: "2026-08-08", macros: macros(1000) },
      { day: "2026-08-14", macros: macros(3000) },
    ]
    const result = averageDailyIntake(edges, "2026-08-14")
    expect(result?.loggedDays).toBe(2)
    expect(result?.average.kcal).toBe(2000)
  })

  it("accumulates at full precision and rounds once", () => {
    // Three days of 0.1g protein. Rounded per day and then averaged this is
    // still 0.1; the point is that the sum happens before the divide, so
    // thirds do not lose a tenth on the way through.
    const days: DayIntake[] = [
      { day: "2026-08-12", macros: macros(0, 10.1) },
      { day: "2026-08-13", macros: macros(0, 10.1) },
      { day: "2026-08-14", macros: macros(0, 10.2) },
    ]
    expect(averageDailyIntake(days, "2026-08-14")?.average.protein).toBe(10.1)
  })

  it("rounds energy to whole and grams to one decimal", () => {
    const days: DayIntake[] = [
      { day: "2026-08-13", macros: macros(2001, 100.4, 200.2, 50.2) },
      { day: "2026-08-14", macros: macros(2002, 100.8, 200.8, 50.8) },
    ]
    expect(averageDailyIntake(days, "2026-08-14")?.average).toEqual({
      kcal: 2002,
      protein: 100.6,
      carbs: 200.5,
      fat: 50.5,
    })
  })

  /**
   * Locked in deliberately, and it is not the mathematically ideal answer.
   *
   * (50.3 + 50.4) / 2 is exactly 50.35, which half-up would take to 50.4. It
   * comes out 50.3 because `roundTo` scales through a double on purpose — 50.35
   * is stored as 50.349999999999994 — and that choice is load-bearing for the
   * trend, which had to match the old app's plain `Math.round(x * 100) / 100`.
   * See the docblock on `round.ts`.
   *
   * This test exists so that if anyone ever swaps `roundTo` for a `toFixed`
   * implementation, the blast radius shows up here as well as on the trend
   * oracle, rather than being discovered as a tenth of a gram nobody can explain.
   */
  it("inherits roundTo's float-scaling tie behaviour", () => {
    const days: DayIntake[] = [
      { day: "2026-08-13", macros: macros(0, 0, 0, 50.3) },
      { day: "2026-08-14", macros: macros(0, 0, 0, 50.4) },
    ]
    expect(averageDailyIntake(days, "2026-08-14")?.average.fat).toBe(50.3)
  })

  it("honours a custom window", () => {
    const result = averageDailyIntake(week([1000, 1000, 1000, 1000, 1000, 3000, 3000]), "2026-08-14", 2)
    expect(result?.windowDays).toBe(2)
    expect(result?.loggedDays).toBe(2)
    expect(result?.average.kcal).toBe(3000)
  })

  it("refuses a window shorter than a day", () => {
    expect(averageDailyIntake(week([2000]), "2026-08-14", 0)).toBeNull()
  })

  it("takes the later entry when a day is duplicated", () => {
    const duplicated: DayIntake[] = [
      { day: "2026-08-14", macros: macros(1000) },
      { day: "2026-08-14", macros: macros(2000) },
    ]
    const result = averageDailyIntake(duplicated, "2026-08-14")
    expect(result?.loggedDays).toBe(1)
    expect(result?.average.kcal).toBe(2000)
  })
})
