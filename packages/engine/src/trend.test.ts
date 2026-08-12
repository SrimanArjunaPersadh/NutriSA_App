import { describe, expect, it } from "vitest"

import { roundTo } from "./round"
import {
  latestTrend,
  loggedPoints,
  trendChangeOverDays,
  trendWeightSeries,
} from "./trend"

const day = (n: number) => `2026-05-${String(n).padStart(2, "0")}`

/** Applies the locked formula step by step, so the tests do not restate it. */
function step(previousTrend: number, weight: number): number {
  return roundTo(0.1 * weight + 0.9 * previousTrend, 2)
}

describe("trendWeightSeries", () => {
  it("returns nothing before the first weigh-in", () => {
    expect(trendWeightSeries([])).toEqual([])
  })

  it("seeds from the first raw weight", () => {
    const [first] = trendWeightSeries([{ day: day(1), weight: 91.2 }])
    expect(first).toEqual({ day: day(1), weight: 91.2, trend: 91.2 })
  })

  it("applies tw[i] = round(0.1*w[i] + 0.9*tw[i-1], 2) on consecutive days", () => {
    const weights = [91.2, 90.8, 91.4, 90.6]
    const series = trendWeightSeries(
      weights.map((weight, i) => ({ day: day(i + 1), weight })),
    )
    let expected = weights[0]!
    expect(series[0]!.trend).toBe(expected)
    for (let i = 1; i < weights.length; i++) {
      expected = step(expected, weights[i]!)
      expect(series[i]!.trend).toBe(expected)
    }
  })

  it("emits one entry per calendar day, not one per weigh-in", () => {
    // Verified against the real history on 2026-08-12: the old app stepped per
    // day, not per logged row. This is the behaviour that decision produced.
    const series = trendWeightSeries([
      { day: day(1), weight: 90.0 },
      { day: day(5), weight: 89.0 },
    ])
    expect(series).toHaveLength(5)
    expect(series.map((p) => p.day)).toEqual([day(1), day(2), day(3), day(4), day(5)])
  })

  it("carries the last known weight forward on a day with no weigh-in", () => {
    const series = trendWeightSeries([
      { day: day(1), weight: 90.0 },
      { day: day(4), weight: 88.0 },
    ])
    // Days 2 and 3 reuse 90.0, so the trend sits still at 90 before day 4 pulls
    // it down. Nulls mark the days with no reading.
    expect(series.map((p) => p.weight)).toEqual([90.0, null, null, 88.0])
    expect(series[1]!.trend).toBe(step(90.0, 90.0))
    expect(series[2]!.trend).toBe(step(series[1]!.trend, 90.0))
    expect(series[3]!.trend).toBe(step(series[2]!.trend, 88.0))
  })

  it("takes one step per day across a gap, not one per reading", () => {
    // Mirrors the shape of the real 37-day gap: a couple of readings first, so
    // the trend is genuinely behind the raw weight when the gap opens, then a
    // long silence, then a new reading.
    //
    // The prior history is what makes this test bite. With a gap opening on the
    // very first reading the carried weight already equals the trend, every
    // gap step is a no-op, and both interpretations land on the same number —
    // which is exactly the trap that made an earlier version of this test pass
    // for the wrong reason.
    const entries = [
      { day: "2026-06-01", weight: 90.0 },
      { day: "2026-06-02", weight: 95.0 },
      { day: "2026-06-12", weight: 90.0 },
    ]
    const series = trendWeightSeries(entries)

    expect(series).toHaveLength(12)
    expect(series.filter((p) => p.weight === null)).toHaveLength(9)

    // Per calendar day: 95.0 is carried through the gap, pulling the trend up
    // toward it, before the final reading pulls it back down.
    let expected = 90.0
    expected = step(expected, 95.0)
    for (let i = 0; i < 9; i++) expected = step(expected, 95.0)
    expected = step(expected, 90.0)
    expect(series.at(-1)!.trend).toBe(expected)

    // Per logged row would have taken three steps in total and landed lower —
    // the two readings differ, so this is a real divergence, not a rounding one.
    const perRow = step(step(90.0, 95.0), 90.0)
    expect(series.at(-1)!.trend).not.toBe(perRow)
    expect(series.at(-1)!.trend).toBeGreaterThan(perRow)
  })

  it("rounds at every step rather than once at the end", () => {
    const weights = [90.0, 89.97, 90.03, 89.91, 90.07]
    const series = trendWeightSeries(
      weights.map((weight, i) => ({ day: day(i + 1), weight })),
    )
    expect(series.every((p) => Number(p.trend.toFixed(2)) === p.trend)).toBe(true)
  })

  it("sorts by date before iterating", () => {
    const ordered = trendWeightSeries([
      { day: day(1), weight: 91.2 },
      { day: day(2), weight: 90.8 },
      { day: day(3), weight: 91.4 },
    ])
    const shuffled = trendWeightSeries([
      { day: day(3), weight: 91.4 },
      { day: day(1), weight: 91.2 },
      { day: day(2), weight: 90.8 },
    ])
    expect(shuffled).toEqual(ordered)
  })

  it("does not mutate the caller's array", () => {
    const input = [
      { day: day(3), weight: 91.4 },
      { day: day(1), weight: 91.2 },
    ]
    const copy = [...input]
    trendWeightSeries(input)
    expect(input).toEqual(copy)
  })

  it("spans a month boundary correctly", () => {
    const series = trendWeightSeries([
      { day: "2026-05-30", weight: 90.0 },
      { day: "2026-06-02", weight: 89.0 },
    ])
    expect(series.map((p) => p.day)).toEqual([
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
    ])
  })
})

describe("loggedPoints", () => {
  it("keeps only the days with a real reading", () => {
    const series = trendWeightSeries([
      { day: day(1), weight: 90.0 },
      { day: day(5), weight: 89.0 },
    ])
    expect(series).toHaveLength(5)
    expect(loggedPoints(series).map((p) => p.day)).toEqual([day(1), day(5)])
  })
})

describe("latestTrend", () => {
  it("is null before the first weigh-in", () => {
    expect(latestTrend([])).toBeNull()
  })

  it("returns the last day, filled or not", () => {
    const series = trendWeightSeries([
      { day: day(1), weight: 91.2 },
      { day: day(2), weight: 90.8 },
    ])
    expect(latestTrend(series)).toBe(series[1])
  })
})

describe("trendChangeOverDays", () => {
  const series = trendWeightSeries(
    Array.from({ length: 15 }, (_, i) => ({ day: day(i + 1), weight: 91.2 - i * 0.1 })),
  )

  it("compares trend to trend, not raw to raw", () => {
    const change = trendChangeOverDays(series, 7)!
    expect(change.delta).toBe(roundTo(change.to.trend - change.from.trend, 2))
    expect(change.delta).toBeLessThan(0)
  })

  it("lands exactly on the cutoff day", () => {
    expect(trendChangeOverDays(series, 7)!.from.day).toBe(day(8))
    expect(trendChangeOverDays(series, 7)!.to.day).toBe(day(15))
  })

  it("still works when the cutoff falls on a day with no weigh-in", () => {
    // The series is per day, so the cutoff always exists even though day 3 was
    // never logged.
    const sparse = trendWeightSeries([
      { day: day(1), weight: 91.2 },
      { day: day(4), weight: 90.6 },
      { day: day(10), weight: 90.0 },
    ])
    const change = trendChangeOverDays(sparse, 7)!
    expect(change.from.day).toBe(day(3))
    expect(change.from.weight).toBeNull()
  })

  it("is null when there is nothing earlier to compare against", () => {
    expect(trendChangeOverDays([], 7)).toBeNull()
    expect(trendChangeOverDays(series.slice(0, 1), 7)).toBeNull()
    expect(trendChangeOverDays(series, 365)).toBeNull()
  })
})
