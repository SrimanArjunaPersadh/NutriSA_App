import { describe, expect, it } from "vitest"

import { redactParams } from "../server/observability/redact"

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
