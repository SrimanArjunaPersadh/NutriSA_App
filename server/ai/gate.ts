import type { AiAllowance, AiConsent, ApiErrorCode } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { readAiAllowance } from "../data/ai-usage"
import { readAiConsent } from "../data/profile"
import { captureRouteError } from "../observability/sentry"

/**
 * The checks before any model call: a chat turn or a label read (plan.md,
 * Phase 9, Q2, Q8 and Q15).
 *
 * 1. **Consent.** No AI consent on the profile, no call. The user's data would
 *    otherwise cross to Anthropic without the agreement POPIA requires.
 * 2. **The month's allowance.** Past $5, no call until the month turns.
 *
 * ## Fails closed
 *
 * If either read fails, the call is refused. An unreadable ledger is not an
 * empty one, and an unreadable consent is not a yes. This is an explicit
 * branch with its own answer, not an exception left to the 500 handler, so it
 * cannot be mistaken for something a retry loop should hammer.
 */
export type AiGate =
  | { ok: true; allowance: AiAllowance }
  | {
      ok: false
      status: 403 | 429 | 503
      /** The body to send as is: the shared error shape. */
      body: {
        code: Extract<ApiErrorCode, "ai-consent-required" | "ai-allowance-used" | "server-error">
        message: string
        resetsOn?: AiAllowance["resetsOn"]
      }
    }

export async function checkAiGate(scope: UserScope): Promise<AiGate> {
  let reads: [AiConsent, AiAllowance]
  try {
    reads = await Promise.all([readAiConsent(scope), readAiAllowance(scope)])
  } catch (error) {
    console.error(`AI gate could not read the ledger or consent: ${error instanceof Error ? error.name : "unknown"}`)
    captureRouteError(error, scope.userId)
    return {
      ok: false,
      status: 503,
      body: { code: "server-error", message: "The AI allowance could not be checked." },
    }
  }

  const [consent, allowance] = reads
  if (!consent.consentedAt) {
    return {
      ok: false,
      status: 403,
      body: { code: "ai-consent-required", message: "AI features are off for this account." },
    }
  }
  if (allowance.rung === "exhausted") {
    return {
      ok: false,
      status: 429,
      body: {
        code: "ai-allowance-used",
        message: "This month's AI allowance is used up.",
        resetsOn: allowance.resetsOn,
      },
    }
  }
  return { ok: true, allowance }
}
