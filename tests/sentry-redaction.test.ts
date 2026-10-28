import { describe, expect, it } from "vitest"

import { redactParams, scrubErrorEvent } from "../server/observability/redact"

/**
 * The Sentry parameter cut, tested against the real shape it exists for.
 *
 * This is a privacy control, and an untested privacy control is one that
 * quietly stops working. It was added after the Privacy axis of
 * `/nutrisa-review` found that `beforeSend` scrubbed the request and left the
 * exception message — the Sentry issue **title** — carrying the bound
 * parameters of the failing query.
 *
 * The first case below is a verbatim capture of a real failure from
 * 2026-08-15, weights and all. If a driver upgrade changes that format, this
 * test still passes while the protection silently stops matching — so the
 * shape assertions matter as much as the redaction ones.
 */

const REAL_FAILURE = `Failed query: insert into "weight_logs" ("id", "user_id", "date", "weight", "created_at") values ($1, $2, $3, $4, default), ($5, $6, $7, $8, default)
params: 2ca5f4ce-f275-4008-85d2-1550084287a9,user_sectest_a_95fb3ddd,2026-08-13,100,b78096b6-9a46-47fc-9ff5-1d60fa910ec2,user_sectest_a_95fb3ddd,2026-08-14,100`

describe("redactParams", () => {
  it("removes the bound parameters from a real driver error", () => {
    const redacted = redactParams(REAL_FAILURE)
    expect(redacted).not.toContain("2026-08-13")
    expect(redacted).not.toContain("2ca5f4ce")
    expect(redacted).toContain("params: [redacted]")
  })

  it("drops the weight itself", () => {
    // The whole point. `100` is a bodyweight in kg, and it is the field POPIA
    // treats as Special Personal Information.
    const redacted = redactParams(REAL_FAILURE)
    expect(redacted.split("params:")[1]).not.toMatch(/\b100\b/)
  })

  it("keeps the half that says what broke", () => {
    const redacted = redactParams(REAL_FAILURE)
    // Column names and $n placeholders carry no data and are the only thing
    // that makes the issue actionable. Redacting them too would leave a Sentry
    // issue nobody can do anything with.
    expect(redacted).toContain("insert into")
    expect(redacted).toContain("weight_logs")
    expect(redacted).toContain("$1")
  })

  it("cuts across the newline the driver puts before the parameters", () => {
    // The reason the pattern uses [\s\S] rather than `.` — with `.` the cut
    // stops at the end of the first line and the parameters survive intact.
    expect(redactParams("query\nparams: 98.84").split("\n").length).toBe(2)
    expect(redactParams("query\nparams: 98.84")).not.toContain("98.84")
  })

  it("handles parameters on the same line", () => {
    expect(redactParams("failed params: 100, 2026-08-14")).toBe(
      "failed params: [redacted]",
    )
  })

  it("is case-insensitive", () => {
    expect(redactParams("Params: 98.84")).not.toContain("98.84")
    expect(redactParams("PARAMS: 98.84")).not.toContain("98.84")
  })

  it("leaves an ordinary message untouched", () => {
    const plain = "Connection terminated unexpectedly"
    expect(redactParams(plain)).toBe(plain)
  })

  it("leaves a message that merely mentions the word alone", () => {
    // `\b` on the pattern means "parameters" does not trigger it, but the cut
    // is deliberately greedy once it does match — so this asserts the boundary
    // rather than assuming it.
    const message = "Invalid parameters supplied to the handler"
    expect(redactParams(message)).toBe(message)
  })

  it("is safe on an empty string", () => {
    expect(redactParams("")).toBe("")
  })
})

/**
 * Phase 9, Q20: "a test proves a failed turn's event holds no chat text".
 *
 * The event below is what Sentry would build if storing a chat message failed
 * inside `POST /chat/turns`: the driver's error quoting the insert with the
 * message as a bound parameter (the shape of `REAL_FAILURE` above, on
 * `chat_messages`), the request with the turn as its body, and an `extra` bag.
 * Every route in `routes/chat.ts` reports through `captureRouteError`, so this
 * gate is the one every chat failure passes.
 */
describe("scrubErrorEvent on a failed chat turn", () => {
  const SECRET = "I binged on a whole cake and weigh 91.4 kg"

  const chatFailure = () => ({
    type: undefined,
    exception: {
      values: [
        {
          type: "DrizzleQueryError",
          value: `Failed query: insert into "chat_messages" ("id", "user_id", "conversation_id", "role", "content", "status", "proposal", "unsourced_numbers", "created_at") values ($1, $2, $3, $4, $5, default, default, default, default)
params: 0192f0c1-7d2e-7a10-8b3c-1a2b3c4d5e6f,user_2abc,0192f0c1-7d2e-7a10-8b3c-aaaaaaaaaaaa,user,${SECRET}`,
        },
      ],
    },
    message: `chat failed: params: ${SECRET}`,
    request: {
      method: "POST",
      url: "https://api.example/api/chat/turns?debug=1",
      data: JSON.stringify({ conversationId: "c", messageId: "m", text: SECRET }),
      headers: { Authorization: "Bearer live-token", "Content-Type": "application/json" },
      cookies: { session: "x" },
      query_string: "debug=1",
    },
    extra: { turn: { text: SECRET } },
    user: { id: "user_2abc", email: "someone@example.com" },
  })

  it("leaves no chat text anywhere in the event", () => {
    const scrubbed = scrubErrorEvent(chatFailure() as never)
    const sent = JSON.stringify(scrubbed)
    expect(sent).not.toContain("binged")
    expect(sent).not.toContain("91.4")
    expect(sent).not.toContain("live-token")
    expect(sent).not.toContain("someone@example.com")
  })

  it("keeps what broke: the statement and the request's path", () => {
    const scrubbed = scrubErrorEvent(chatFailure() as never) as ReturnType<typeof chatFailure>
    expect(scrubbed.exception.values[0]!.value).toContain('insert into "chat_messages"')
    expect(scrubbed.exception.values[0]!.value).toContain("params: [redacted]")
    expect(scrubbed.request).toEqual({
      method: "POST",
      url: "https://api.example/api/chat/turns",
      data: undefined,
      headers: undefined,
      cookies: undefined,
      query_string: undefined,
    })
    expect(scrubbed).not.toHaveProperty("extra")
    expect(scrubbed).not.toHaveProperty("user")
  })
})

