import { describe, expect, it } from "vitest"

import { CURRENT_RATE_VERSION, computeUsageCost, sumUsageCosts } from "./cost"

/** The first published card, for the tests that pin its prices. */
const AUGUST = "2026-08-12" as const

describe("computeUsageCost", () => {
  it("prices input and output at the published per-million rates", () => {
    // Sonnet 5 at the 2026-08-12 card's $3 / $15: 1M in + 1M out = $18.
    const { costUsd } = computeUsageCost(
      "claude-sonnet-5",
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      AUGUST,
    )
    expect(costUsd).toBe(18)
  })

  it("prices Haiku at its own rates", () => {
    const { costUsd } = computeUsageCost("claude-haiku-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    expect(costUsd).toBe(6)
  })

  it("bills cache reads at a tenth of the input rate", () => {
    const { costUsd } = computeUsageCost(
      "claude-sonnet-5",
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
      AUGUST,
    )
    expect(costUsd).toBe(0.3)
  })

  it("bills cache writes at 1.25x the input rate", () => {
    const { costUsd } = computeUsageCost(
      "claude-sonnet-5",
      { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 1_000_000 },
      AUGUST,
    )
    expect(costUsd).toBe(3.75)
  })

  it("makes caching cheaper on the second turn, which is the point of it", () => {
    const uncached = computeUsageCost("claude-sonnet-5", {
      inputTokens: 20_000,
      outputTokens: 500,
    })
    const cached = computeUsageCost("claude-sonnet-5", {
      inputTokens: 0,
      outputTokens: 500,
      cacheReadTokens: 20_000,
    })
    expect(cached.costUsd).toBeLessThan(uncached.costUsd)
  })

  it("treats omitted cache fields as zero", () => {
    const withOut = computeUsageCost("claude-sonnet-5", {
      inputTokens: 1000,
      outputTokens: 200,
    })
    const withZero = computeUsageCost("claude-sonnet-5", {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    })
    expect(withOut.costUsd).toBe(withZero.costUsd)
  })

  it("is free when nothing was used", () => {
    expect(
      computeUsageCost("claude-sonnet-5", { inputTokens: 0, outputTokens: 0 }).costUsd,
    ).toBe(0)
  })

  it("rounds to the six decimals ai_usage.cost_usd stores", () => {
    const { costUsd } = computeUsageCost("claude-haiku-4-5", {
      inputTokens: 7,
      outputTokens: 3,
    })
    // 7/1e6*1 + 3/1e6*5 = 0.000022
    expect(costUsd).toBe(0.000022)
    expect(Number(costUsd.toFixed(6))).toBe(costUsd)
  })

  it("stamps the rate version it priced against", () => {
    const { rateVersion } = computeUsageCost("claude-sonnet-5", {
      inputTokens: 100,
      outputTokens: 100,
    })
    expect(rateVersion).toBe(CURRENT_RATE_VERSION)
  })

  it("keeps a published version as it was published", () => {
    // The 2026-08-12 card budgeted Sonnet 5 at $3 / $15 against an intro rate
    // expected to lapse. It did not lapse, but the version is never edited: a
    // row priced against it must keep resolving to what it said.
    const { costUsd } = computeUsageCost(
      "claude-sonnet-5",
      { inputTokens: 1_000_000, outputTokens: 0 },
      AUGUST,
    )
    expect(costUsd).toBe(3)
  })

  it("prices Sonnet 5 at $2 / $10 from 2026-10-26, the rise having been cancelled", () => {
    const { costUsd } = computeUsageCost("claude-sonnet-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    expect(costUsd).toBe(12)
  })

  it("has no Haiku 5.5 rate before the version that added it", () => {
    expect(() =>
      computeUsageCost("claude-haiku-5-5", { inputTokens: 1, outputTokens: 1 }, AUGUST),
    ).toThrow(/No rate for claude-haiku-5-5/)
  })

  it("throws on an unknown rate version rather than guessing", () => {
    expect(() =>
      // @ts-expect-error — the point is the runtime guard behind the type.
      computeUsageCost("claude-sonnet-5", { inputTokens: 1, outputTokens: 1 }, "1999-01-01"),
    ).toThrow(/Unknown rate version/)
  })

  it("throws on an unpriced model rather than costing nothing", () => {
    // Priced at zero, a new model would spend real money while the ledger
    // reported none and the budget gate never fired.
    expect(() =>
      // @ts-expect-error — same: the guard exists for values that dodge the type.
      computeUsageCost("claude-opus-5", { inputTokens: 1, outputTokens: 1 }),
    ).toThrow(/No rate for/)
  })
})

describe("computeUsageCost — Haiku 5.5's two cards", () => {
  it("prices a short prompt at $0.10 / $0.50", () => {
    const { costUsd } = computeUsageCost("claude-haiku-5-5", {
      inputTokens: 10_000,
      outputTokens: 1_000_000,
    })
    // 10k × $0.10/M = $0.001, plus 1M × $0.50/M = $0.50.
    expect(costUsd).toBe(0.501)
  })

  it("prices a long prompt at $0.50 / $2.50", () => {
    const { costUsd } = computeUsageCost("claude-haiku-5-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    expect(costUsd).toBe(3)
  })

  /**
   * The boundary, from the pricing page: "a request whose prompt is over
   * 100,000 tokens pays higher prices". 100,000 exactly is not over.
   */
  it("keeps exactly 100,000 prompt tokens on the standard card", () => {
    const { costUsd } = computeUsageCost("claude-haiku-5-5", {
      inputTokens: 100_000,
      outputTokens: 0,
    })
    expect(costUsd).toBe(0.01)
  })

  it("moves 100,001 prompt tokens to the long card, for every token", () => {
    const { costUsd } = computeUsageCost("claude-haiku-5-5", {
      inputTokens: 100_001,
      outputTokens: 1000,
    })
    // 100,001 × $0.50/M = $0.0500005, plus 1000 × $2.50/M = $0.0025.
    expect(costUsd).toBe(0.052501)
  })

  /**
   * Prompt length counts cache reads and writes, so a prompt that is mostly a
   * cache hit can still cross the line. Measuring `inputTokens` alone would
   * price it on the cheap card and under-bill the ledger.
   */
  it("counts cache reads and writes toward the prompt length", () => {
    const { costUsd } = computeUsageCost("claude-haiku-5-5", {
      inputTokens: 1,
      outputTokens: 0,
      cacheReadTokens: 60_000,
      cacheCreationTokens: 40_000,
    })
    // 100,001 in all, so the long card: 1 × 0.5 + 60k × 0.05 + 40k × 0.625,
    // per million = 0.0000005 + 0.003 + 0.025.
    expect(costUsd).toBe(0.028001)
  })

  it("prices a label read at a fraction of a cent", () => {
    // About what one resized label photo and its JSON come to.
    const { costUsd } = computeUsageCost("claude-haiku-5-5", {
      inputTokens: 1800,
      outputTokens: 300,
    })
    expect(costUsd).toBe(0.00033)
  })
})

describe("sumUsageCosts", () => {
  it("is zero for a month with no turns", () => {
    expect(sumUsageCosts([])).toBe(0)
  })

  it("adds priced rows without floating-point drift", () => {
    expect(sumUsageCosts([0.1, 0.2])).toBe(0.3)
  })

  it("sums a month of small turns", () => {
    const turns = Array.from({ length: 200 }, () => 0.000022)
    expect(sumUsageCosts(turns)).toBe(0.0044)
  })
})
