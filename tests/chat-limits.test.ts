import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CHAT_MESSAGE_MAX_CHARS, chatTurnRequestSchema } from "@shared"

/**
 * The assistant's two request limits, offline (plan.md, Phase 9, Q11 and Q22):
 * 60 turns per user per hour, and 2,000 characters a message.
 *
 * `../server/auth/user-scope` is replaced so `server/env.ts` never loads; the
 * stand-in `getScope` reads the scope the test app sets, which is all the
 * limiter asks of it. The real check that the scope comes from a verified
 * token is the security suite's.
 */

vi.mock("../server/auth/user-scope", () => ({
  getScope: (c: { get: (key: string) => unknown }) => c.get("scope"),
}))

const { chatTurnRateLimit } = await import("../server/http/limits")

function appFor(userId: string) {
  const app = new Hono<{ Variables: { scope: { userId: string } } }>()
  app.use("*", async (c, next) => {
    c.set("scope", { userId })
    await next()
  })
  app.post("/chat/turns", chatTurnRateLimit as never, (c) => c.json({ ok: true }))
  return app
}

const turn = (app: ReturnType<typeof appFor>) => app.request("/chat/turns", { method: "POST" })

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("chatTurnRateLimit", () => {
  it("allows 60 turns an hour and refuses the 61st with a Retry-After", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const app = appFor("user_limit_a")
    for (let i = 0; i < 60; i += 1) expect((await turn(app)).status).toBe(200)

    const refused = await turn(app)
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ code: "rate-limited" })
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0)
  })

  it("counts each user on their own", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const busy = appFor("user_limit_b")
    for (let i = 0; i < 61; i += 1) await turn(busy)
    expect((await turn(appFor("user_limit_c"))).status).toBe(200)
  })

  it("opens again once the hour has passed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-28T08:00:00Z"))
    const app = appFor("user_limit_d")
    for (let i = 0; i < 61; i += 1) await turn(app)
    expect((await turn(app)).status).toBe(429)

    vi.setSystemTime(new Date("2026-10-28T09:00:01Z"))
    expect((await turn(app)).status).toBe(200)
  })

  it("logs the user id, never the request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const app = appFor("user_limit_e")
    for (let i = 0; i < 61; i += 1) await turn(app)
    expect(warn).toHaveBeenCalledWith("Chat turn limit hit by user_limit_e")
  })
})

describe("the 2,000-character message cap", () => {
  const ids = { conversationId: "0192f0c1-7d2e-7a10-8b3c-1a2b3c4d5e6f", messageId: "0192f0c1-7d2e-7a10-8b3c-aaaaaaaaaaaa" }

  it("is 2,000", () => {
    expect(CHAT_MESSAGE_MAX_CHARS).toBe(2000)
  })

  it("accepts 2,000 characters and refuses 2,001", () => {
    expect(chatTurnRequestSchema.safeParse({ ...ids, text: "a".repeat(2000) }).success).toBe(true)
    expect(chatTurnRequestSchema.safeParse({ ...ids, text: "a".repeat(2001) }).success).toBe(false)
  })

  it("refuses an empty or blank message", () => {
    expect(chatTurnRequestSchema.safeParse({ ...ids, text: "" }).success).toBe(false)
    expect(chatTurnRequestSchema.safeParse({ ...ids, text: "   " }).success).toBe(false)
  })

  it("refuses ids that are not client-minted v7s", () => {
    expect(chatTurnRequestSchema.safeParse({ conversationId: crypto.randomUUID(), messageId: ids.messageId, text: "hi" }).success).toBe(false)
  })
})
