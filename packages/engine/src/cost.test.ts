import { describe, expect, it } from "vitest"

import { CURRENT_RATE_VERSION, computeUsageCost, sumUsageCosts } from "./cost"

describe("computeUsageCost", () => {
  it("prices input and output at the published per-million rates", () => {
    // Sonnet 5 at the standard $3 / $15: 1M in + 1M out = $18.
    const { costUsd } = computeUsageCost("claude-sonnet-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
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
    const { costUsd } = computeUsageCost("claude-sonnet-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    })
    expect(costUsd).toBe(0.3)
  })

  it("bills cache writes at 1.25x the input rate", () => {
    const { costUsd } = computeUsageCost("claude-sonnet-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 1_000_000,
    })
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

  it("prices Sonnet 5 at the standard rate, not the expiring intro rate", () => {
    // plan.md's known risks: budget against $3/$15. A table tuned to the
    // $2/$10 intro rate would start under-reporting on 2026-09-01 and the cap
    // would quietly stop holding.
    const { costUsd } = computeUsageCost("claude-sonnet-5", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    })
    expect(costUsd).toBe(3)
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
