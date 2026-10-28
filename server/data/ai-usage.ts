import { randomUUID } from "node:crypto"

import { and, gte, lt } from "drizzle-orm"

import {
  aiBudgetMonth,
  aiBudgetRung,
  AI_MONTHLY_BUDGET_USD,
  computeUsageCost,
  currentLoggingDay,
  sumUsageCosts,
  type ModelId,
  type TokenUsage,
} from "@engine"
import type { AiAllowance } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { withRetry } from "../db/retry"
import { aiUsage } from "../db/schema"
import { insertOwned, selectOwned } from "./scoped"

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

/**
 * This SAST month's AI spend and the rung it puts the user on (plan.md,
 * Phase 9, Q2 and Q8): the budget gate's one question, asked before every
 * chat turn and label read.
 *
 * Every row counts, chat and label reads alike. The rows are summed by the
 * engine, each at the price it was written at. A month is a few hundred rows
 * at most, so they are read and added here rather than summed in SQL, which
 * keeps the addition in the engine.
 *
 * **Throws on a ledger failure, and callers must refuse the turn when it
 * does.** The gate fails closed: an unreadable ledger is not an empty one.
 * The read itself is retried through `selectOwned` like every select.
 */
export async function readAiAllowance(scope: UserScope): Promise<AiAllowance> {
  const month = aiBudgetMonth(currentLoggingDay())
  const rows = await selectOwned(scope, aiUsage, {
    where: and(gte(aiUsage.ts, month.fromUtc), lt(aiUsage.ts, month.toUtc)),
  })
  const spentUsd = sumUsageCosts(rows.map((row) => row.costUsd))
  return {
    spentUsd,
    budgetUsd: AI_MONTHLY_BUDGET_USD,
    rung: aiBudgetRung(spentUsd),
    resetsOn: month.resetsOn,
  }
}
