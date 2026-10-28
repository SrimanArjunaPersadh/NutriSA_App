import type { ErrorEvent } from "@sentry/node"

/**
 * Cuts bound query parameters out of an error message.
 *
 * ## The hole this closes
 *
 * `sentry.ts` named this exact threat in its own docblock — "a Postgres driver
 * error that helpfully quotes the failing statement, with the parameters
 * interpolated" — and then its `beforeSend` scrubbed only `event.request`. The
 * exception's own message went to Sentry untouched, **as the issue title**.
 * Found by the Privacy axis of `/nutrisa-review`, 2026-08-15.
 *
 * It is not hypothetical. A real failure earlier the same day produced:
 *
 *     DrizzleQueryError: Failed query: insert into "weight_logs" (…) values ($1, $2, $3, $4)
 *     params: 2ca5f4ce-…, user_…, 2026-08-13, 100
 *
 * The statement itself is safe — column names and `$n` placeholders carry no
 * data. Everything after `params:` is the row, and on these tables the row is a
 * bodyweight or a macro. So the cut is made there, keeping the half that says
 * what broke and dropping the half that says whose it was.
 *
 * **This is a targeted cut for a known driver shape, not a general PII
 * scrubber.** A library that formats errors differently would slip past it. The
 * defence in depth is that nothing in this codebase puts a health value into a
 * message deliberately; this catches the library that does it for us.
 *
 * ## Why this is its own module
 *
 * So it can be tested without importing `sentry.ts`, which imports `../env`,
 * which asserts `DATABASE_URL` and friends at load. The default vitest suite is
 * deliberately pure and offline — nothing in it should fail because a `.env` is
 * missing — and a privacy control that is awkward to test is one that ends up
 * untested. See `tests/sentry-redaction.test.ts`.
 */
export function redactParams(text: string): string {
  // `[\s\S]` rather than `.` so the cut spans the newline the driver puts
  // before the parameter list.
  return text.replace(/\bparams:[\s\S]*/i, "params: [redacted]")
}

/** Strips everything user-supplied off a request before it can be sent. */
export function scrubRequest(request: NonNullable<ErrorEvent["request"]>) {
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

/**
 * The last gate before an error event leaves this server (`beforeSend` in
 * `./sentry.ts`).
 *
 * - **The request** loses its body, headers, cookies and query string. A chat
 *   message, a meal or a weigh-in would otherwise ride along as the body.
 * - **The exception message** is the Sentry issue **title**, the most visible
 *   field on the event; its bound parameters are cut (`redactParams`). A failed
 *   insert into `chat_messages` lists the message text there.
 * - **A captured message** gets the same cut.
 * - **`extra`** is dropped whole: an allowlist would be a promise about code
 *   that has not been written yet.
 * - **`user`** is cleared even though `sendDefaultPii` is off, so this gate does
 *   not depend on a setting somewhere else still being right.
 *
 * Moved here from `initSentry` on `ai-chat` (2026-10-28) so a test can prove a
 * failed chat turn's event carries no chat text.
 */
export function scrubErrorEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) event.request = scrubRequest(event.request)

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactParams(exception.value)
  }

  if (event.message) event.message = redactParams(event.message)
  if (event.logentry?.message) {
    event.logentry.message = redactParams(event.logentry.message)
  }

  delete event.extra
  delete event.user
  return event
}

