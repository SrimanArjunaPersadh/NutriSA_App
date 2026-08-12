import { describe, expect, it } from "vitest"

import { goalProgress, projectTrend } from "./goal"
import { addDays } from "./time"
import { trendWeightSeries } from "./trend"

/**
 * A steady loss of `perDay` kg, one weigh-in every day.
 *
 * Built with `addDays` rather than by formatting an incrementing number into
 * the day slot — that produced "2026-05-32" for any run longer than a month,
 * which parses to nothing, and the series came back empty while the test still
 * looked like it was exercising 40 days of history.
 */
function losing(startKg: number, perDay: number, days: number) {
  return trendWeightSeries(
    Array.from({ length: days }, (_, i) => ({
      day: addDays("2026-05-01", i),
      weight: startKg - perDay * i,
    })),
  )
}

describe("goalProgress", () => {
  it("is null before there is any history", () => {
    expect(goalProgress([], 88)).toBeNull()
  })

  it("measures from the first trend value to the goal", () => {
    const series = losing(92, 0.1, 21)
    const progress = goalProgress(series, 88)!
    expect(progress.startKg).toBe(92)
    expect(progress.currentKg).toBe(series.at(-1)!.trend)
    expect(progress.goalKg).toBe(88)
    expect(progress.remainingKg).toBe(
      Number((series.at(-1)!.trend - 88).toFixed(2)),
    )
  })

  it("is 0 on the first day and rises toward 1", () => {
    const start = goalProgress(losing(92, 0.1, 1), 88)!
    expect(start.progress).toBe(0)

    const later = goalProgress(losing(92, 0.1, 21), 88)!
    expect(later.progress).toBeGreaterThan(0)
    expect(later.progress).toBeLessThan(1)
  })

  it("clamps at 1 once the goal is passed", () => {
    // Unlike a macro ring, past the goal is not extra information — arriving is
    // the end of the story, and 130% of a circle says nothing a full one does.
    const series = losing(92, 0.5, 21)
    const progress = goalProgress(series, 88)!
    expect(progress.currentKg).toBeLessThan(88)
    expect(progress.progress).toBe(1)
    expect(progress.remainingKg).toBeLessThan(0)
  })

  it("works for a user gaining toward a heavier goal", () => {
    const series = losing(70, -0.1, 21) // negative loss is a gain
    const progress = goalProgress(series, 75)!
    expect(progress.currentKg).toBeGreaterThan(70)
    expect(progress.progress).toBeGreaterThan(0)
    expect(progress.progress).toBeLessThan(1)
  })

  it("treats a start already at the goal as arrived", () => {
    const series = losing(88, 0, 5)
    expect(goalProgress(series, 88)!.progress).toBe(1)
  })
})

describe("projectTrend", () => {
  it("returns nothing usable without history", () => {
    expect(projectTrend([])).toEqual({
      ratePerWeek: 0,
      points: [],
      goalDay: null,
      daysToGoal: null,
    })
    expect(projectTrend(losing(92, 0.1, 1)).points).toEqual([])
  })

  it("measures a weekly rate from the trend", () => {
    // 0.1 kg/day sustained is 0.7 kg/week. The trend lags the raw weight but
    // its slope settles on the same rate.
    const { ratePerWeek } = projectTrend(losing(92, 0.1, 40))
    expect(ratePerWeek).toBeLessThan(0)
    expect(ratePerWeek).toBeCloseTo(-0.7, 1)
  })

  it("projects forward from the day after the last real point", () => {
    const series = losing(92, 0.1, 30)
    const { points } = projectTrend(series, { forDays: 10 })
    expect(points).toHaveLength(10)
    expect(points[0]!.day > series.at(-1)!.day).toBe(true)
    // Straight line: each step moves by the same amount.
    const deltas = points.slice(1).map((p, i) => +(p.trend - points[i]!.trend).toFixed(4))
    expect(new Set(deltas).size).toBeLessThanOrEqual(2) // rounding jitter only
  })

  it("caps the line at forDays", () => {
    expect(projectTrend(losing(92, 0.1, 30), { forDays: 0 }).points).toHaveLength(0)
    expect(projectTrend(losing(92, 0.1, 30), { forDays: 5 }).points).toHaveLength(5)
  })

  it("dates the goal when the rate is heading toward it", () => {
    const series = losing(92, 0.1, 30)
    const { goalDay, daysToGoal } = projectTrend(series, { goalKg: 88 })
    expect(daysToGoal).toBeGreaterThan(0)
    expect(goalDay).not.toBeNull()
    expect(goalDay! > series.at(-1)!.day).toBe(true)
  })

  it("reports no date when the rate points away from the goal", () => {
    // Gaining while the goal is below: a date here would be fiction.
    const gaining = losing(92, -0.1, 30)
    const projection = projectTrend(gaining, { goalKg: 88 })
    expect(projection.ratePerWeek).toBeGreaterThan(0)
    expect(projection.goalDay).toBeNull()
    expect(projection.daysToGoal).toBeNull()
    // The line itself is still drawn — it just heads the wrong way.
    expect(projection.points.length).toBeGreaterThan(0)
  })

  it("reports no date when the trend is flat", () => {
    const flat = losing(92, 0, 30)
    const projection = projectTrend(flat, { goalKg: 88 })
    expect(projection.ratePerWeek).toBe(0)
    expect(projection.goalDay).toBeNull()
  })

  it("reports no date when the goal is more than a year out", () => {
    // Reachable in principle at 0.007 kg/week, but a date that far ahead is
    // noise dressed up as a prediction.
    const crawling = losing(92, 0.001, 30)
    expect(projectTrend(crawling, { goalKg: 88 }).goalDay).toBeNull()
  })

  it("says arrived when already at the goal", () => {
    const series = losing(92, 0.2, 21)
    const current = series.at(-1)!.trend
    const projection = projectTrend(series, { goalKg: current })
    expect(projection.daysToGoal).toBe(0)
    expect(projection.goalDay).toBe(series.at(-1)!.day)
  })

  it("omits the ETA when no goal is given", () => {
    const projection = projectTrend(losing(92, 0.1, 30))
    expect(projection.goalDay).toBeNull()
    expect(projection.points.length).toBeGreaterThan(0)
  })

  it("falls back to a 7-day window when there is not yet 14 days of history", () => {
    // A user ten days in should still get a line rather than nothing.
    const projection = projectTrend(losing(92, 0.1, 10), { forDays: 5 })
    expect(projection.points).toHaveLength(5)
    expect(projection.ratePerWeek).toBeLessThan(0)
  })
})
