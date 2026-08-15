import { describe, expect, it } from "vitest"

import { evenlySpaced, niceScale } from "./chart"

describe("niceScale", () => {
  it("returns null for an empty series — that is the chart's empty state", () => {
    expect(niceScale([])).toBeNull()
  })

  it("covers every value", () => {
    const values = [88.2, 91.7, 90.1, 89.4]
    const scale = niceScale(values)!
    expect(scale.min).toBeLessThanOrEqual(Math.min(...values))
    expect(scale.max).toBeGreaterThanOrEqual(Math.max(...values))
  })

  it("labels on round numbers", () => {
    const scale = niceScale([88.2, 91.7])!
    expect(scale.ticks).toEqual([92, 91, 90, 89, 88])
  })

  it("orders ticks highest first, the order they are drawn", () => {
    const { ticks } = niceScale([80, 100])!
    expect(ticks).toEqual([...ticks].sort((a, b) => b - a))
  })

  it("starts and ends the ticks on the domain", () => {
    const scale = niceScale([88.2, 91.7])!
    expect(scale.ticks[0]).toBe(scale.max)
    expect(scale.ticks.at(-1)).toBe(scale.min)
  })

  /**
   * The case the module note argues for. A week of trend values spanning 0.3 kg
   * is a flat week. Fitted tightly it would fill the chart top to bottom and
   * draw ordinary daily noise as a collapse.
   */
  it("widens a nearly flat series instead of magnifying it", () => {
    const scale = niceScale([98.8, 98.9, 98.84])!
    expect(scale.max - scale.min).toBeGreaterThanOrEqual(2)
  })

  it("keeps a widened series centred rather than pinned to an edge", () => {
    const scale = niceScale([98.8, 98.9])!
    const middle = (scale.min + scale.max) / 2
    // The data sits near the centre of the axis, not against one end.
    expect(Math.abs(middle - 98.85)).toBeLessThan(1)
  })

  it("handles a completely flat series", () => {
    const scale = niceScale([90, 90, 90])!
    expect(scale.min).toBeLessThan(90)
    expect(scale.max).toBeGreaterThan(90)
    expect(scale.ticks.length).toBeGreaterThan(1)
  })

  it("handles a single value", () => {
    const scale = niceScale([98.84])!
    expect(scale.min).toBeLessThanOrEqual(98.84)
    expect(scale.max).toBeGreaterThanOrEqual(98.84)
  })

  it("produces roughly the requested number of ticks", () => {
    const { ticks } = niceScale([70, 130], { targetTicks: 5 })!
    expect(ticks.length).toBeGreaterThanOrEqual(4)
    expect(ticks.length).toBeLessThanOrEqual(7)
  })

  it("never emits a float-error label", () => {
    // 2.5 is a nice step and the one most likely to accumulate error if the
    // ticks were built by repeated addition rather than by multiplication.
    const { ticks } = niceScale([0, 25], { targetTicks: 11 })!
    for (const tick of ticks) {
      expect(String(tick)).not.toMatch(/\d{6,}/)
    }
  })

  it("scales down to small ranges with decimal labels", () => {
    const { ticks } = niceScale([1.02, 1.18], { minSpan: 0.1 })!
    expect(ticks.length).toBeGreaterThan(1)
    for (const tick of ticks) {
      expect(Number.isFinite(tick)).toBe(true)
      expect(String(tick).replace("-", "").split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3)
    }
  })

  it("honours a custom minSpan", () => {
    const scale = niceScale([90, 90.1], { minSpan: 10 })!
    expect(scale.max - scale.min).toBeGreaterThanOrEqual(10)
  })

  it("works across zero and into negatives", () => {
    const scale = niceScale([-3.2, 4.8])!
    expect(scale.min).toBeLessThanOrEqual(-3.2)
    expect(scale.max).toBeGreaterThanOrEqual(4.8)
  })
})

describe("evenlySpaced", () => {
  it("returns nothing for an empty list", () => {
    expect(evenlySpaced([], 5)).toEqual([])
  })

  it("returns nothing when asked for nothing", () => {
    expect(evenlySpaced([1, 2, 3], 0)).toEqual([])
  })

  it("returns everything when there is less than asked for", () => {
    expect(evenlySpaced([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  /**
   * The bug this function exists to avoid: picking every nth entry drops the
   * last one whenever the length is not a clean multiple, and the right-hand
   * end of a chart is the end people read first.
   */
  it("always includes both ends", () => {
    const items = Array.from({ length: 31 }, (_, i) => i)
    const picked = evenlySpaced(items, 5)
    expect(picked[0]).toBe(0)
    expect(picked.at(-1)).toBe(30)
  })

  it("includes both ends on a length that divides badly", () => {
    const items = Array.from({ length: 23 }, (_, i) => i)
    const picked = evenlySpaced(items, 5)
    expect(picked[0]).toBe(0)
    expect(picked.at(-1)).toBe(22)
    expect(picked).toHaveLength(5)
  })

  it("spaces the middle roughly evenly", () => {
    const items = Array.from({ length: 29 }, (_, i) => i)
    expect(evenlySpaced(items, 5)).toEqual([0, 7, 14, 21, 28])
  })

  it("de-duplicates rather than repeating a point", () => {
    const picked = evenlySpaced([1, 2, 3, 4], 4)
    expect(new Set(picked).size).toBe(picked.length)
  })

  it("returns the first item when asked for one", () => {
    expect(evenlySpaced([9, 8, 7], 1)).toEqual([9])
  })
})
