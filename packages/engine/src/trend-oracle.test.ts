import { describe, expect, it } from "vitest"

import {
  ORACLE_OFFSET_KG,
  oracleFinal,
  oracleReadings,
  oracleTrend,
} from "./__fixtures__/trend-oracle"
import { latestTrend, loggedPoints, trendWeightSeries } from "./trend"

/**
 * The trend oracle — the branch's merge gate, and the one test in the project
 * checked against real history rather than by eye.
 *
 * ## What this proves, and what it does not
 *
 * The plan expected to assert the trend "byte-for-byte" against the old app's
 * stored values. **Those do not exist.** The Supabase export carries only
 * `id, date, weight, created_at`; the old implementation computed the trend on
 * the fly and never persisted it, so there was no second side to compare to.
 *
 * What settled it instead: both candidate readings were computed from the 38
 * migrated rows and put the final trend 0.59 kg apart — 98.25 kg stepping per
 * logged row, 98.84 kg stepping per calendar day. Sriman confirmed the old app
 * showed 98.84, which **contradicted the spec's stated hypothesis** and is why
 * `trend.ts` iterates over days.
 *
 * So this is a regression guard anchored to one confirmed real figure, not a
 * byte-for-byte replay of a recorded series. It will catch any future change
 * that moves the numbers. It cannot catch an error that was already there on
 * 2026-08-12 — only recovering the old implementation's source could do that,
 * and plan.md keeps that open.
 *
 * The fixture is the real readings with 9.0 kg subtracted, per the standing
 * rule. The generator asserts the shift is exact at every step, so the shape it
 * guards is identical to the real one.
 */
describe("trend oracle — 38 real weigh-ins", () => {
  const series = trendWeightSeries(oracleReadings)

  it("has the 38 migrated readings", () => {
    expect(oracleReadings).toHaveLength(38)
    expect(new Set(oracleReadings.map((r) => r.day)).size).toBe(38)
  })

  it("expands to one entry per calendar day", () => {
    // 2026-05-05 to 2026-08-04 inclusive.
    expect(series).toHaveLength(92)
    expect(series).toHaveLength(oracleTrend.length)
    expect(loggedPoints(series)).toHaveLength(38)
  })

  it("reproduces the trend at every one of the 92 days", () => {
    expect(series.map((point) => point.trend)).toEqual(oracleTrend)
  })

  it("lands on the confirmed final trend", () => {
    const last = latestTrend(series)!
    expect(last.day).toBe(oracleFinal.day)
    expect(last.trend).toBe(oracleFinal.trend)
    // The figure Sriman recognised, recovered by undoing the fixture offset.
    expect(last.trend + ORACLE_OFFSET_KG).toBe(oracleFinal.realTrend)
    expect(oracleFinal.realTrend).toBe(98.84)
  })

  it("crosses the 37-day gap by stepping every day", () => {
    const gapStart = series.findIndex((p) => p.day === "2026-06-17")
    const gapEnd = series.findIndex((p) => p.day === "2026-07-24")
    expect(gapStart).toBeGreaterThan(-1)
    expect(gapEnd - gapStart).toBe(37)

    // Every day inside the gap is filled, and none of them carries a reading.
    const inside = series.slice(gapStart + 1, gapEnd)
    expect(inside).toHaveLength(36)
    expect(inside.every((p) => p.weight === null)).toBe(true)

    // The trend keeps moving through the silence rather than pausing — that is
    // the whole difference between the two readings of the algorithm.
    expect(series[gapEnd]!.trend).not.toBe(series[gapStart]!.trend)
  })

  it("is stable when the rows arrive in any order", () => {
    const shuffled = [...oracleReadings].reverse()
    expect(trendWeightSeries(shuffled).map((p) => p.trend)).toEqual(oracleTrend)
  })
})
