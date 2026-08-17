import { describe, expect, it } from "vitest"

import { nextSortOrder } from "./ordering"

describe("nextSortOrder", () => {
  it("starts an empty day at 0", () => {
    expect(nextSortOrder([])).toBe(0)
  })

  it("appends after the highest position, not after the count", () => {
    // The count would say 2 here, which collides with the row already at 2 and
    // leaves the day view breaking the tie however Postgres happened to return
    // the rows.
    expect(nextSortOrder([0, 2])).toBe(3)
  })

  it("does not care what order the positions arrive in", () => {
    expect(nextSortOrder([5, 1, 3])).toBe(6)
  })

  it("appends after duplicates rather than renumbering them", () => {
    expect(nextSortOrder([0, 0, 0])).toBe(1)
  })

  it("handles the migrated rows, which are all 0", () => {
    expect(nextSortOrder([0])).toBe(1)
  })

  it("ignores values an integer column could never hold", () => {
    expect(nextSortOrder([1, Number.NaN, 2])).toBe(3)
    expect(nextSortOrder([Number.POSITIVE_INFINITY])).toBe(0)
  })

  it("never returns a position that already exists", () => {
    for (const day of [[], [0], [0, 1], [4, 4, 9], [0, 7, 2]]) {
      expect(day).not.toContain(nextSortOrder(day))
    }
  })
})
