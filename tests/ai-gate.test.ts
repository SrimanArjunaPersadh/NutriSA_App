import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The check before every model call (plan.md, Phase 9, Q2, Q8 and Q15):
 * consent, then the month's allowance, failing closed when either cannot be
 * read. The reads are replaced; the real ones are exercised against Postgres
 * by the security suite.
 */

const reads = vi.hoisted(() => ({
  readAiConsent: vi.fn(),
  readAiAllowance: vi.fn(),
  captureRouteError: vi.fn(),
}))

vi.mock("../server/data/profile", () => ({ readAiConsent: reads.readAiConsent }))
vi.mock("../server/data/ai-usage", () => ({ readAiAllowance: reads.readAiAllowance }))
vi.mock("../server/observability/sentry", () => ({ captureRouteError: reads.captureRouteError }))

const { checkAiGate } = await import("../server/ai/gate")

const scope = { userId: "user_test" } as never

const allowance = (spentUsd: number, rung: "full" | "cheaper" | "exhausted") => ({
  spentUsd,
  budgetUsd: 5,
  rung,
  resetsOn: "2026-11-01",
})

beforeEach(() => {
  for (const fn of Object.values(reads)) fn.mockReset()
  reads.readAiConsent.mockResolvedValue({ consentedAt: "2026-10-28T08:00:00.000Z" })
  reads.readAiAllowance.mockResolvedValue(allowance(1.2, "full"))
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe("checkAiGate", () => {
  it("lets a consenting user under budget through, with the rung", async () => {
    expect(await checkAiGate(scope)).toEqual({ ok: true, allowance: allowance(1.2, "full") })
  })

  it("passes the cheaper rung on, for the turn to use Haiku", async () => {
    reads.readAiAllowance.mockResolvedValue(allowance(4.1, "cheaper"))
    const gate = await checkAiGate(scope)
    expect(gate.ok && gate.allowance.rung).toBe("cheaper")
  })

  it("refuses without consent (Q15)", async () => {
    reads.readAiConsent.mockResolvedValue({ consentedAt: null })
    expect(await checkAiGate(scope)).toMatchObject({ ok: false, status: 403, body: { code: "ai-consent-required" } })
  })

  it("refuses once the month's $5 is spent, saying when it resets (Q8)", async () => {
    reads.readAiAllowance.mockResolvedValue(allowance(5.02, "exhausted"))
    expect(await checkAiGate(scope)).toMatchObject({
      ok: false,
      status: 429,
      body: { code: "ai-allowance-used", resetsOn: "2026-11-01" },
    })
  })

  it("fails closed when the ledger cannot be read, and reports it", async () => {
    const failure = new Error("connection terminated")
    reads.readAiAllowance.mockRejectedValue(failure)
    expect(await checkAiGate(scope)).toMatchObject({ ok: false, status: 503, body: { code: "server-error" } })
    expect(reads.captureRouteError).toHaveBeenCalledWith(failure, "user_test")
  })

  it("sends no reset date with any other refusal", async () => {
    reads.readAiConsent.mockResolvedValue({ consentedAt: null })
    const gate = await checkAiGate(scope)
    expect(gate.ok === false && gate.body).not.toHaveProperty("resetsOn")
  })

  it("fails closed when consent cannot be read", async () => {
    reads.readAiConsent.mockRejectedValue(new Error("timeout"))
    expect(await checkAiGate(scope)).toMatchObject({ ok: false, status: 503 })
  })
})
