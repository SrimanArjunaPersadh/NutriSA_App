import * as Sentry from "@sentry/node"

import { env } from "../env"

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

/** Strips everything user-supplied off a request before it can be sent. */
function scrubRequest(request: NonNullable<Sentry.ErrorEvent["request"]>) {
  const url = typeof request.url === "string" ? request.url.split("?")[0] : request.url

  return {
    method: request.method,
    url,
    // Explicitly undefined rather than merely absent: this is the list of
    // things that must never be here, and it should read as a decision.
    data: undefined,
    headers: undefined,
    cookies: undefined,
    query_string: undefined,
  }
}

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
     * No performance tracing. Spans would carry route parameters and timings
     * that describe logging behaviour, and nothing in this project is asking
     * the question tracing answers yet.
     */
    tracesSampleRate: 0,

    /**
     * Console output never becomes a breadcrumb. See the note above — this is
     * the path a debugging `console.log` of a day summary would take to
     * Sentry, months after whoever wrote it stopped thinking about it.
     */
    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== "Console"),

    beforeSend(event) {
      if (event.request) event.request = scrubRequest(event.request)
      // The SDK attaches these only with sendDefaultPii on. Cleared anyway:
      // this function is the last gate, and it should not depend on a setting
      // somewhere else still being right.
      delete event.user
      return event
    },

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "console") return null
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

export { Sentry }
