import { randomUUID } from "node:crypto"

import { computeUsageCost, type ModelId, type TokenUsage } from "@engine"

import type { UserScope } from "../auth/user-scope"
import { withRetry } from "../db/retry"
import { aiUsage } from "../db/schema"
import { insertOwned } from "./scoped"

/** Which surface spent it. Matches the comment on `ai_usage.feature`. */
export type AiFeature = "ocr" | "chat" | "weekly_report"

/**
 * One row in the AI spend ledger, priced by the engine.
 *
 * Phase 9's budget gate sums these per SAST month, so a call that was answered
 * and not recorded is spend the gate never sees. Written for every model call
 * that came back with a `usage`, refusals included: a refusal is still billed.
 *
 * ## Retried, and why that is safe here when it is not for the other writes
 *
 * The id is minted **once, before the first attempt**, and `insertOwned` is
 * `ON CONFLICT (id) DO NOTHING`. So a retry whose first attempt landed before
 * its response was lost finds its own row and writes nothing: the idempotency
 * `server/db/retry.ts` says a retried write needs, supplied by the server
 * because this row has no client to mint the id. `tests/write-safety.test.ts`
 * guards the other case, a retry around a statement whose id changes per
 * attempt.
 *
 * Retried because the Neon driver drops connections (`retry.ts` lists the
 * occasions), and on `label-ocr` the security suite caught the first ledger
 * write of a run failing that way twice in a row, 2026-10-26. A missing row is
 * spend the budget gate never sees.
 */
export async function recordAiUsage(
  scope: UserScope,
  call: { feature: AiFeature; model: ModelId; usage: TokenUsage },
): Promise<void> {
  const { costUsd, rateVersion } = computeUsageCost(call.model, call.usage)
  const id = randomUUID()

  await withRetry("ai_usage", () =>
    insertOwned(scope, aiUsage, {
      id,
      feature: call.feature,
      model: call.model,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      cacheReadTokens: call.usage.cacheReadTokens ?? 0,
      cacheCreationTokens: call.usage.cacheCreationTokens ?? 0,
      costUsd,
      rateVersion,
    }),
  )
}
