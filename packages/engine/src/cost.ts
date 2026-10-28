import { roundTo } from "./round"

/**
 * What a model call cost, in USD.
 *
 * The budget gate in Phase 9 refuses a chat turn once the month's spend passes
 * the cap, so this is the number that decides whether a user gets an answer. It
 * is computed here, from a table, rather than anywhere near the model — see the
 * standing rule.
 *
 * ## Why the rate table is versioned
 *
 * `ai_usage` stores `rate_version` beside `cost_usd`. Prices change, and when
 * they do the historical ledger must not silently re-value itself: a row
 * written in August is what it cost in August. Recomputing an old row against
 * today's table would quietly move last month's total, which is exactly the
 * figure the spend cap is checked against.
 *
 * So: never edit a published version. Add a new one, point `CURRENT_RATE_VERSION`
 * at it, and leave the old entries where they are.
 */

/** Rates in USD per million tokens, as published by Anthropic. */
type ModelRate = {
  input: number
  output: number
  /**
   * A second rate card for long prompts, where the model has one. Haiku 5.5
   * charges more once a prompt passes 100,000 tokens, and **prompt length
   * counts every input token, cache reads and cache writes included**, per
   * Anthropic's pricing page. Each request is priced on its own: one over the
   * line pays the long card for everything, cache hits too.
   */
  longPrompt?: {
    /** The largest prompt still on the standard card. */
    maxStandardTokens: number
    input: number
    output: number
  }
  /**
   * The model's own cache-read ratio, where it is not the usual tenth. Sonnet
   * 5.5 reads cache at 0.05x its input rate, per the pricing page on
   * 2026-10-28. It applies to whichever card the request lands on.
   */
  cacheReadMultiplier?: number
}

export type RateVersion = keyof typeof RATE_TABLE

/**
 * Model ids are written out in full rather than built from strings, so a typo
 * is a compile error instead of a 404 at runtime.
 */
export type ModelId =
  | "claude-sonnet-5"
  | "claude-sonnet-5-5"
  | "claude-haiku-4-5"
  | "claude-haiku-5-5"

/**
 * Cache reads bill at 0.1x the input rate unless the model's card says
 * otherwise (`cacheReadMultiplier`); a cache write at the default five-minute
 * TTL bills at 1.25x. Both are ratios of the model's own input rate, not
 * separate prices, so they live here once instead of being repeated per model.
 *
 * Only the five-minute TTL is modelled. The one-hour TTL writes at 2.0x and
 * would need its own column in `ai_usage` to be told apart — if a cache
 * breakpoint ever moves to `ttl: "1h"`, that column has to land in the same
 * branch or every cached turn will be under-billed by 60%.
 */
const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_5M_MULTIPLIER = 1.25

const RATE_TABLE = {
  /**
   * Standing rates as of 2026-08-12.
   *
   * Sonnet 5 is deliberately entered at its **standard** $3 / $15 and not at
   * the $2 / $10 introductory rate, which expires 2026-08-31. plan.md's known
   * risks say to budget against the standard price: a cap tuned to the intro
   * rate would silently start over-spending the moment it lapses, and the whole
   * point of the gate is that it cannot.
   */
  "2026-08-12": {
    "claude-sonnet-5": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  },
  /**
   * Added 2026-10-26 for label OCR (Phase 8), read off the pricing page that day.
   *
   * - **Haiku 5.5**, the label reader, on both of its cards.
   * - **Sonnet 5 drops to $2 / $10.** The intro rate became the standard price
   *   and the $3 / $15 rise announced for 2026-09-01 was cancelled. The version
   *   above is left as published: nothing was ever billed against it, but a
   *   published version is not edited, whatever it says.
   * - Haiku 4.5 carried over unchanged, so a row priced today for it still
   *   resolves.
   */
  "2026-10-26": {
    "claude-sonnet-5": { input: 2.0, output: 10.0 },
    "claude-haiku-4-5": { input: 1.0, output: 5.0 },
    "claude-haiku-5-5": {
      input: 0.1,
      output: 0.5,
      longPrompt: { maxStandardTokens: 100_000, input: 0.5, output: 2.5 },
    },
  },
  /**
   * Added 2026-10-28 for the chat (Phase 9), read off the pricing page that day.
   *
   * - **Sonnet 5.5**, the chat model, at $2 / $10. Its cache reads are $0.10,
   *   **0.05x** its input rate rather than the usual tenth: priced at 0.1x, every
   *   cached chat turn would be over-counted and the budget gate would close
   *   early.
   * - Everything else carried over unchanged, so a row priced today for any
   *   earlier model still resolves.
   */
  "2026-10-28": {
    "claude-sonnet-5": { input: 2.0, output: 10.0 },
    "claude-sonnet-5-5": { input: 2.0, output: 10.0, cacheReadMultiplier: 0.05 },
    "claude-haiku-4-5": { input: 1.0, output: 5.0 },
    "claude-haiku-5-5": {
      input: 0.1,
      output: 0.5,
      longPrompt: { maxStandardTokens: 100_000, input: 0.5, output: 2.5 },
    },
  },
} satisfies Record<string, Partial<Record<ModelId, ModelRate>>>

export const CURRENT_RATE_VERSION: RateVersion = "2026-10-28"

/**
 * Token counts as the Anthropic API reports them, named to match the response's
 * `usage` object so there is no remapping step to get wrong.
 */
export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  /** Tokens served from cache. Billed at a tenth of the input rate, or the model's own ratio. */
  cacheReadTokens?: number
  /** Tokens written to cache. Billed at 1.25x the input rate (5-minute TTL). */
  cacheCreationTokens?: number
}

export type UsageCost = {
  /** USD, to six decimals — the scale of `ai_usage.cost_usd numeric(12,6)`. */
  costUsd: number
  rateVersion: RateVersion
}

/** `ai_usage.cost_usd` is `numeric(12,6)`; anything finer would not survive the write. */
const USD_DECIMALS = 6

const PER_MILLION = 1_000_000

/**
 * Price one model call.
 *
 * Every component is summed at full precision and rounded once, for the same
 * reason as the macro totals: rounding four line items to the cent and adding
 * them drifts from the true figure, and this figure accumulates across a
 * month's worth of turns.
 *
 * Throws on an unknown model rather than defaulting to zero. A model with no
 * published rate priced at nothing would spend real money while the ledger
 * reported none — the budget gate would never fire, which is the one failure
 * this module exists to prevent.
 */
export function computeUsageCost(
  model: ModelId,
  usage: TokenUsage,
  rateVersion: RateVersion = CURRENT_RATE_VERSION,
): UsageCost {
  const table: Partial<Record<ModelId, ModelRate>> | undefined = RATE_TABLE[rateVersion]
  if (!table) throw new RangeError(`Unknown rate version: ${rateVersion}`)

  const card = table[model]
  if (!card) {
    throw new RangeError(`No rate for ${model} at version ${rateVersion}`)
  }

  const cacheRead = usage.cacheReadTokens ?? 0
  const cacheCreation = usage.cacheCreationTokens ?? 0
  const promptTokens = usage.inputTokens + cacheRead + cacheCreation
  const rate =
    card.longPrompt && promptTokens > card.longPrompt.maxStandardTokens ? card.longPrompt : card

  const usd =
    (usage.inputTokens * rate.input +
      usage.outputTokens * rate.output +
      cacheRead * rate.input * (card.cacheReadMultiplier ?? CACHE_READ_MULTIPLIER) +
      cacheCreation * rate.input * CACHE_WRITE_5M_MULTIPLIER) /
    PER_MILLION

  return { costUsd: roundTo(usd, USD_DECIMALS), rateVersion }
}

/**
 * Sum of a month's priced calls.
 *
 * Takes already-priced rows so a month spanning a rate change stays correct:
 * each row keeps the price it was written at, and this only adds them up.
 */
export function sumUsageCosts(costs: readonly number[]): number {
  return roundTo(
    costs.reduce((total, cost) => total + cost, 0),
    USD_DECIMALS,
  )
}
