import * as Sentry from "@sentry/node"

import { env } from "../env"
import { redactParams, scrubErrorEvent, scrubRequest } from "./redact"

/**
 * Server-side error reporting, configured to be structurally incapable of
 * carrying health data off this machine.
 *
 * ## The rule this implements
 *
 * AGENTS.md: "Never log weight, macro values, or request bodies to Sentry."
 * That is not a promise to be careful — it is enforced below by throwing away
 * whole categories of payload before an event is allowed to leave, because the
 * thing that eventually leaks health data is never the line anyone reviewed. It
 * is a Postgres driver error that helpfully quotes the failing statement, with
 * the parameters interpolated, three releases from now.
 *
 * POPIA treats this data as special personal information. An error report is
 * not an exemption from that, and Sentry is a third-party processor.
 *
 * ## What is dropped, and why each one
 *
 * - **`sendDefaultPii: false`** — the SDK's own switch. Stops IP addresses,
 *   cookies and user identifiers being attached automatically.
 * - **The whole request body** (`event.request.data`). There is no version of a
 *   logged meal or a weigh-in that is safe to ship, and this is the route it
 *   would take.
 * - **Every request header**, not just `Authorization`. A live Clerk session
 *   token in a Sentry issue is a working credential sitting in a third-party
 *   dashboard, and an allowlist is the wrong shape here — the next header
 *   someone adds should be excluded by default, not included by default.
 * - **Query strings.** `?days=30` is harmless; the habit of forwarding whatever
 *   is in the URL is not.
 * - **Console breadcrumbs.** `console.log(daySummary)` during a debugging
 *   session would otherwise be attached to the next error from that process.
 *
 * ## What is deliberately kept
 *
 * The Clerk user id, as a tag, when a request had a verified scope. It is a
 * pseudonymous identifier and it is the only way to answer "is this failing for
 * one account or for everyone", which is the first question about any error.
 * It is stamped explicitly in `captureRouteError`, not inferred by the SDK.
 *
 * ## With no DSN, none of this runs
 *
 * `SENTRY_DSN` is optional and is empty in development. Error reporting is not
 * allowed to be a boot dependency, and there is no reason to ship dev-loop
 * stack traces to a project dashboard.
 */

/** The only span names `tracesSampler` keeps. See `traceLabelRead` and `traceChatTurn`. */
const LABEL_READ_SPAN = "label.read"
const CHAT_TURN_SPAN = "chat.turn"
const KEPT_SPANS = new Set([LABEL_READ_SPAN, CHAT_TURN_SPAN])

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    console.log("Sentry disabled (no SENTRY_DSN).")
    return
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,

    /** The switch AGENTS.md names. Never turn this on. */
    sendDefaultPii: false,

    /**
     * Two spans are traced and nothing else: the label reader's model call
     * (Phase 8, "log OCR p50/p95 latency and failure rate") and an assistant
     * turn (Phase 9, Q14). Every other span —
     * an HTTP request, a query — is dropped here, because route spans carry
     * parameters and timings that describe logging behaviour and nothing asks
     * that question.
     *
     * Both are new roots (see `traceLabelRead`), so this sampler sees them
     * by name rather than inheriting an unsampled request's decision.
     */
    tracesSampler: ({ name }) => (KEPT_SPANS.has(name) ? 1 : 0),

    /**
     * A transaction is scrubbed exactly as an error is. It carries the
     * request the span ran inside, and that request was a photo of a label.
     */
    beforeSendTransaction(event) {
      if (event.request) event.request = scrubRequest(event.request)
      // Child spans too: the outgoing fetch to the model, anything an
      // integration hangs under the root. p50 / p95 need the root's duration
      // and its outcome, and nothing else is promised (Privacy axis, 2026-10-28).
      event.spans = []
      delete event.extra
      delete event.user
      return event
    },

    /**
     * Console output never becomes a breadcrumb. See the note above — this is
     * the path a debugging `console.log` of a day summary would take to
     * Sentry, months after whoever wrote it stopped thinking about it.
     */
    /**
     * No outgoing request carries Sentry's trace headers. With `chat.turn` a
     * sampled root, the calls to Anthropic and Neon would otherwise send a
     * `sentry-trace` and `baggage` header (a trace id, the environment, the
     * public key) to both. Nothing personal, and nothing either needs
     * (Privacy axis, 2026-10-28).
     */
    tracePropagationTargets: [],

    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== "Console"),

    /**
     * The request, the exception text, the message, `extra` and `user`: see
     * `scrubErrorEvent` in `./redact.ts`, which says why each one goes. It
     * lives there so `tests/sentry-redaction.test.ts` can prove it without a
     * `.env`.
     */
    beforeSend: (event) => scrubErrorEvent(event),

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "console") return null
      if (breadcrumb.message) breadcrumb.message = redactParams(breadcrumb.message)
      if (breadcrumb.data) {
        delete breadcrumb.data.body
        delete breadcrumb.data.response_body
      }
      return breadcrumb
    },
  })

  console.log(`Sentry on (${env.SENTRY_ENVIRONMENT}), sendDefaultPii: false.`)
}

/**
 * Reports an unhandled route error.
 *
 * `userId` is the verified Clerk id and is attached as a tag so failures can be
 * counted per account. Nothing else about the request is added — the message
 * and stack are whatever was thrown, and `beforeSend` has the last word on all
 * of it.
 */
export function captureRouteError(err: unknown, userId?: string): void {
  if (!Sentry.isInitialized()) return
  Sentry.captureException(err, userId ? { tags: { userId } } : undefined)
}

/**
 * Times one label read and records how it ended.
 *
 * p50 / p95 come from the span's duration in Sentry's performance view; the
 * failure rate from `outcome` (the reader's `LabelReadOutcome`, kept there so
 * the list of outcomes is written once). **Nothing else is attached** — no label value,
 * no token count (those are in `ai_usage`), no image. Without a DSN this is a
 * plain call of `run`.
 *
 * A new trace and a parentless span, so the sampler decides on this span's own
 * name instead of inheriting the surrounding request's "drop".
 */
export async function traceLabelRead<T extends { outcome: string }>(
  run: () => Promise<T>,
): Promise<T> {
  if (!Sentry.isInitialized()) return run()

  return Sentry.startNewTrace(() =>
    Sentry.startSpan({ name: LABEL_READ_SPAN, op: "ai.label", parentSpan: null }, async (span) => {
      const result = await run()
      span.setAttribute("outcome", result.outcome)
      return result
    }),
  )
}

/**
 * Times one assistant turn and records how it ended (plan.md, Phase 9, Q14).
 *
 * The same contract as `traceLabelRead`: the outcome is the only attribute
 * (`ChatTurnOutcome`: ok, unsourced_number, cut_off, timeout, refused, error).
 * No message text, no tool result, no token count, no model name. The
 * transaction is scrubbed by `beforeSendTransaction` like the label one.
 */
export async function traceChatTurn<T extends { outcome: string }>(
  run: () => Promise<T>,
): Promise<T> {
  if (!Sentry.isInitialized()) return run()

  return Sentry.startNewTrace(() =>
    Sentry.startSpan({ name: CHAT_TURN_SPAN, op: "ai.chat", parentSpan: null }, async (span) => {
      const result = await run()
      span.setAttribute("outcome", result.outcome)
      return result
    }),
  )
}

/**
 * Counts a chat model failure that fell back to the cheaper model (Q8). A
 * message with the fixed text below and no other data: the error's own
 * message can echo the request, so it is never passed on (Q20).
 */
export function captureChatFallback(): void {
  if (!Sentry.isInitialized()) return
  Sentry.captureMessage("Chat model unavailable; the turn fell back to the cheaper model", "warning")
}

export { Sentry }
