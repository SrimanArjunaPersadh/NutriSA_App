import { describe, expect, it } from "vitest"

import {
  formatDayShort,
  formatGrams,
  formatKcal,
  formatKg,
  formatSignedKg,
  withThousands,
} from "../src/lib/format"

/**
 * `src/lib/format.ts` is presentation, not arithmetic — but the thousands
 * separator is a hand-written loop over digit positions, and that is exactly
 * the kind of code that is off by one for four-digit numbers and right for
 * everything anyone happened to look at.
 *
 * It sits in `tests/` rather than beside the source because the default vitest
 * suite is deliberately node-only: no React Native transform, no jsdom. These
 * functions take numbers and return strings, so they need none of that.
 */

describe("withThousands", () => {
  it("leaves short numbers alone", () => {
    expect(withThousands(0)).toBe("0")
    expect(withThousands(7)).toBe("7")
    expect(withThousands(99)).toBe("99")
    expect(withThousands(999)).toBe("999")
  })

  it("groups at the thousand", () => {
    expect(withThousands(1000)).toBe("1,000")
    expect(withThousands(1870)).toBe("1,870")
    expect(withThousands(2300)).toBe("2,300")
  })

  it("groups every three digits", () => {
    expect(withThousands(10_000)).toBe("10,000")
    expect(withThousands(100_000)).toBe("100,000")
    expect(withThousands(1_000_000)).toBe("1,000,000")
    expect(withThousands(12_345_678)).toBe("12,345,678")
  })

  it("keeps the sign outside the grouping", () => {
    expect(withThousands(-1870)).toBe("-1,870")
    expect(withThousands(-120)).toBe("-120")
  })

  it("does not group the fraction", () => {
    expect(withThousands(1234.5)).toBe("1,234.5")
  })
})

describe("formatKcal", () => {
  it("prints whole calories with separators", () => {
    expect(formatKcal(430)).toBe("430")
    expect(formatKcal(1870)).toBe("1,870")
  })

  it("never leaks float error into the label", () => {
    // The contract says kcal arrives whole. This is the guard for the day it
    // does not — "1,870.0000000001" is a bug the user can read.
    expect(formatKcal(1870.0000000001)).toBe("1,870")
  })
})

describe("formatGrams", () => {
  it("drops a trailing .0", () => {
    expect(formatGrams(48)).toBe("48")
    expect(formatGrams(0)).toBe("0")
  })

  it("keeps a real tenth", () => {
    expect(formatGrams(48.5)).toBe("48.5")
    expect(formatGrams(0.4)).toBe("0.4")
  })

  it("handles negatives, which a remaining macro can be", () => {
    expect(formatGrams(-12.5)).toBe("-12.5")
    expect(formatGrams(-12)).toBe("-12")
  })
})

describe("formatKg", () => {
  it("always shows one decimal so a column lines up", () => {
    expect(formatKg(98)).toBe("98.0")
    expect(formatKg(98.84)).toBe("98.8")
    expect(formatKg(89.4)).toBe("89.4")
  })
})

describe("formatSignedKg", () => {
  /**
   * The sign is the information. "0.6" says nothing about which way the week
   * went, and colour alone cannot tell VoiceOver.
   */
  it("marks a gain explicitly", () => {
    expect(formatSignedKg(0.6)).toBe("+0.6")
  })

  it("marks a loss", () => {
    expect(formatSignedKg(-0.6)).toBe("-0.6")
  })

  it("leaves no sign on zero", () => {
    expect(formatSignedKg(0)).toBe("0.0")
  })
})

describe("formatDayShort", () => {
  it("prints the day unpadded and the month abbreviated", () => {
    expect(formatDayShort("2026-04-27")).toBe("27 Apr")
    expect(formatDayShort("2026-05-04")).toBe("4 May")
  })

  it("covers both ends of the year", () => {
    expect(formatDayShort("2026-01-01")).toBe("1 Jan")
    expect(formatDayShort("2026-12-31")).toBe("31 Dec")
  })
})
