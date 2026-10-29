import { randomBytes, randomUUID } from "node:crypto"

import { asc, eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { addDays, currentLoggingDay } from "@engine"
import { parseSseChunk, type ChatEvent } from "@shared"

/**
 * The assistant's isolation, consent and ledger guarantees, against real
 * Postgres (plan.md, Phase 9, Q23).
 *
 * - an unauthenticated or forged caller reaches no chat route and costs nothing
 * - one user cannot read, delete or dismiss another's chat (404, nothing changes)
 * - an id that is someone else's is a conflict, and nothing is written into
 *   their conversation
 * - a lookup cannot reach another user's private food, and a card cannot name it
 * - no consent, or a spent month, refuses the turn before the model is called
 * - a turn stores both messages, writes a `chat` ledger row priced by the
 *   engine, and its card is confirmed through the ordinary `POST /meal-logs`
 * - deleting a user removes their chats
 *
 * The model is a scripted fake, as in `label-isolation.test.ts`: this suite
 * tests the server's boundaries, and a real spend should not decide whether it
 * passes. Clerk's `verifyToken` is stubbed as in the neighbouring files.
 *
 * Not here: the export carrying cards. Phase 11 builds the export; `proposal`
 * is a column of `chat_messages`, which its table list already names.
 */

const ids = vi.hoisted(() => ({ userA: "", userB: "", userC: "" }))

type Scripted = { text?: string; toolUses?: { id: string; name: string; input: unknown }[] }

const model = vi.hoisted(() => ({
  queue: [] as Scripted[],
  calls: 0,
  /** Every request body the fake was sent, for inspecting tool results. */
  requests: [] as unknown[],
}))

vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => {
    if (token === "token-a") return { sub: ids.userA }
    if (token === "token-b") return { sub: ids.userB }
    if (token === "token-c") return { sub: ids.userC }
    throw new Error("Token verification failed")
  },
}))

vi.mock("../../server/ai/config", () => ({
  LABEL_MODEL: "claude-haiku-5-5",
  LABEL_TIMEOUT_MS: 15_000,
  LABEL_MAX_TOKENS: 2048,
  CHAT_MODEL: "claude-sonnet-5-5",
  CHAT_FALLBACK_MODEL: "claude-haiku-5-5",
  CHAT_EFFORT: "low",
  CHAT_MAX_LOOKUPS: 4,
  CHAT_MAX_TOKENS: 4096,
  CHAT_TURN_TIMEOUT_MS: 20_000,
  anthropic: () => ({
    messages: {
      stream: (params: unknown) => {
        model.calls += 1
        // A copy: the turn keeps appending to the same `messages` array, and
        // the real SDK serialises each request at the moment it is sent.
        model.requests.push(structuredClone(params))
        const next = model.queue.shift() ?? { text: "ok" }
        const toolUses = next.toolUses ?? []
        const content = [
          ...(next.text ? [{ type: "text", text: next.text, citations: null }] : []),
          ...toolUses.map((use) => ({ type: "tool_use", ...use })),
        ]
        const final = { stop_reason: toolUses.length ? "tool_use" : "end_turn", content }
        return {
          async *[Symbol.asyncIterator]() {
            yield {
              type: "message_start",
              message: {
                usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
              },
            }
            if (next.text) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: next.text } }
            yield { type: "message_delta", delta: {}, usage: { output_tokens: 100 } }
          },
          finalMessage: async () => final,
        }
      },
    },
  }),
}))

/** Same minter as `write-isolation.test.ts`, for the same reason. */
function uuidv7(): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(Date.now(), 0, 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
}

const TAG = `sectest${randomBytes(4).toString("hex")}`

let chatRoutes: Awaited<typeof import("../../server/routes/chat")>["chatRoutes"]
let writes: Awaited<typeof import("../../server/routes/writes")>["writes"]
let db: Awaited<typeof import("../../server/db")>["db"]
let schema: Awaited<typeof import("../../server/db")>["schema"]
let withRetry: Awaited<typeof import("../../server/db/retry")>["withRetry"]

function setup<T>(label: string, run: () => Promise<T>): Promise<T> {
  return withRetry(`fixture ${label}`, run)
}

type Json = Record<string, unknown>

async function call(method: string, path: string, token: string | undefined, body?: unknown, app = chatRoutes) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  const type = res.headers.get("content-type") ?? ""
  if (type.includes("text/event-stream")) {
    return { status: res.status, body: {} as Json, events: parseSseChunk(text).events }
  }
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json, events: [] as ChatEvent[] }
}

const sendTurn = (token: string, conversationId: string, text: string, messageId = uuidv7()) =>
  call("POST", "/chat/turns", token, { conversationId, messageId, text })

const messagesOf = (conversationId: string) =>
  setup("messages", () =>
    db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.conversationId, conversationId))
      .orderBy(asc(schema.chatMessages.createdAt)),
  )

/** The tool results the fake was handed in request `index`, parsed. */
function toolResultsIn(index: number): unknown[] {
  const request = model.requests[index] as { messages: { role: string; content: unknown }[] }
  const last = request.messages.at(-1) as { content: { type: string; content: string }[] }
  return last.content.filter((block) => block.type === "tool_result").map((block) => JSON.parse(block.content))
}

const usageOf = (userId: string) =>
  setup("ai_usage", () => db.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId)))

/** A's first conversation, made through the route in `beforeAll`. */
let conversationA = ""

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set. These tests write and delete rows, so they need a " +
        "Neon branch of their own — never the main database. See vitest.security.config.mts.",
    )
  }

  ids.userA = `user_sectest_ca_${randomUUID().replace(/-/g, "")}`
  ids.userB = `user_sectest_cb_${randomUUID().replace(/-/g, "")}`
  ids.userC = `user_sectest_cc_${randomUUID().replace(/-/g, "")}`

  const dbModule = await import("../../server/db")
  db = dbModule.db
  schema = dbModule.schema
  withRetry = (await import("../../server/db/retry")).withRetry
  chatRoutes = (await import("../../server/routes/chat")).chatRoutes
  writes = (await import("../../server/routes/writes")).writes

  await setup("users", () =>
    db.insert(schema.users).values([
      { clerkId: ids.userA, email: "ca@sectest.invalid" },
      { clerkId: ids.userB, email: "cb@sectest.invalid" },
      { clerkId: ids.userC, email: "cc@sectest.invalid" },
    ]),
  )
  // A and B have agreed to AI features; C has not (Q15).
  await setup("consent", () =>
    db.insert(schema.profiles).values([
      { id: randomUUID(), userId: ids.userA, aiConsentAt: new Date() },
      { id: randomUUID(), userId: ids.userB, aiConsentAt: new Date() },
    ]),
  )
  // A private food of A's, which B must never see.
  await setup("private food", () =>
    db.insert(schema.foods).values({
      id: randomUUID(),
      userId: ids.userA,
      name: `${TAG} secret granola`,
      unit: "g",
      per100: { kcal: 450, pro: 10, carb: 60, fat: 18 },
      source: "manual",
    }),
  )

  const granolaLine = {
    name: `${TAG} secret granola`,
    qty: "60 g",
    kcal: 270,
    pro: 6,
    carb: 36,
    fat: 11,
    portion: { quantity: 60, unit: "g", per: { kcal: 450, pro: 10, carb: 60, fat: 18 } },
  }
  // And a meal of A's with it, so A has a most-logged list for B's miss to
  // leak (food-search, Q33 c). Three days back: inside the 90, not today.
  await setup("A's meal", () =>
    db.insert(schema.mealLogs).values({
      id: randomUUID(),
      userId: ids.userA,
      date: addDays(currentLoggingDay(), -3),
      name: "Breakfast",
      kcal: 270,
      pro: 6,
      carb: 36,
      fat: 11,
      items: [granolaLine],
    }),
  )

  conversationA = uuidv7()
  model.queue = [{ text: "Hello A." }]
  const opened = await sendTurn("token-a", conversationA, "Hi coach")
  if (opened.status !== 200) throw new Error(`fixture turn failed: ${opened.status}`)
})

afterAll(async () => {
  if (!db || !withRetry) return
  // Chats, cards, ledger rows, profiles and the private food go with their users.
  await setup("users cleanup", () =>
    db.delete(schema.users).where(inArray(schema.users.clerkId, [ids.userA, ids.userB, ids.userC])),
  )
})

describe("an unauthenticated caller reaches nothing and costs nothing", () => {
  const routes: [string, string, unknown?][] = [
    ["GET", "/chat/conversations"],
    ["GET", `/chat/conversations/${uuidv7()}`],
    ["DELETE", `/chat/conversations/${uuidv7()}`],
    ["DELETE", "/chat/conversations"],
    ["POST", "/chat/turns", { conversationId: uuidv7(), messageId: uuidv7(), text: "hi" }],
    ["POST", `/chat/messages/${uuidv7()}/dismiss`],
    ["GET", "/ai/consent"],
    ["PUT", "/ai/consent", { granted: true }],
    ["GET", "/ai/allowance"],
  ]

  it("answers 401 to no token and a forged one on every route, without calling the model", async () => {
    const before = model.calls
    for (const [method, path, body] of routes) {
      expect((await call(method, path, undefined, body)).status, `${method} ${path}`).toBe(401)
      expect((await call(method, path, "forged", body)).status, `${method} ${path}`).toBe(401)
    }
    expect(model.calls).toBe(before)
  })
})

describe("a turn", () => {
  it("stores the message and the reply, and bills a chat row priced by the engine", async () => {
    const stored = await messagesOf(conversationA)
    expect(stored.map((row) => [row.role, row.content, row.status, row.userId])).toEqual([
      ["user", "Hi coach", "complete", ids.userA],
      ["assistant", "Hello A.", "complete", ids.userA],
    ])
    const usage = await usageOf(ids.userA)
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({
      feature: "chat",
      model: "claude-sonnet-5-5",
      inputTokens: 1000,
      outputTokens: 100,
      // 1000 × $2/M + 100 × $10/M.
      costUsd: 0.003,
      rateVersion: "2026-10-28",
    })
  })

  it("is billed to whoever is signed in, whatever the body claims", async () => {
    model.queue = [{ text: "Hi B." }]
    const conversation = uuidv7()
    const res = await call("POST", "/chat/turns", "token-b", {
      conversationId: conversation,
      messageId: uuidv7(),
      text: "hello",
      userId: ids.userA,
      user_id: ids.userA,
    })
    expect(res.status).toBe(200)
    expect((await messagesOf(conversation)).every((row) => row.userId === ids.userB)).toBe(true)
    expect(await usageOf(ids.userA)).toHaveLength(1)
  })

  it("refuses a message over 2,000 characters before the model is called", async () => {
    const before = model.calls
    const res = await sendTurn("token-b", uuidv7(), "a".repeat(2001))
    expect(res.status).toBe(400)
    expect(model.calls).toBe(before)
  })
})

describe("one user cannot reach another's chat", () => {
  it("cannot list it or read it", async () => {
    const list = await call("GET", "/chat/conversations", "token-b")
    expect((list.body.conversations as { id: string }[]).map((c) => c.id)).not.toContain(conversationA)
    expect((await call("GET", `/chat/conversations/${conversationA}`, "token-b")).status).toBe(404)
    expect((await call("GET", `/chat/conversations/${conversationA}`, "token-a")).status).toBe(200)
  })

  it("cannot delete it, alone or with 'delete all'", async () => {
    expect((await call("DELETE", `/chat/conversations/${conversationA}`, "token-b")).body).toEqual({ deleted: false })
    await call("DELETE", "/chat/conversations", "token-b")
    expect(await messagesOf(conversationA)).toHaveLength(2)
  })

  it("cannot write into it: A's conversation id is a conflict for B, and nothing lands", async () => {
    const before = model.calls
    const res = await sendTurn("token-b", conversationA, "let me in")
    expect(res.status).toBe(409)
    expect(model.calls).toBe(before)
    expect(await messagesOf(conversationA)).toHaveLength(2)
  })

  it("cannot reuse A's message id", async () => {
    const [first] = await messagesOf(conversationA)
    const res = await sendTurn("token-b", uuidv7(), "copy", first!.id)
    expect(res.status).toBe(409)
  })
})

describe("lookups and cards stay inside the user's own data", () => {
  it("does not find another user's private food, and cannot put it on a card", async () => {
    model.queue = [
      { toolUses: [{ id: "t1", name: "search_foods", input: { queries: [`${TAG} secret granola`] } }] },
      {
        toolUses: [
          { id: "t2", name: "propose_meal_log", input: { slot: "Breakfast", items: [{ ref: "f1", count: null, servings: 1, amount: null, unit: null }] } },
        ],
      },
      { text: "I couldn't find that food." },
    ]
    const requestsBefore = model.requests.length
    const conversation = uuidv7()
    const res = await sendTurn("token-b", conversation, "log my granola")
    expect(res.status).toBe(200)

    // A miss also hands over B's most-logged foods (food-search, Q33 c): B's
    // own, of which there are none, and never A's granola, which A has logged.
    expect(toolResultsIn(requestsBefore + 1)).toEqual([
      { results: [{ query: `${TAG} secret granola`, foods: [] }], noMatch: true, mostLogged: [] },
    ])
    expect(JSON.stringify(toolResultsIn(requestsBefore + 2))).toContain("was not returned by search_foods")
    expect(res.events.some((event) => event.type === "proposal")).toBe(false)
    const reply = (await messagesOf(conversation)).find((row) => row.role === "assistant")
    expect(reply?.proposal).toBeNull()
  })

  it("never sends a user id or email to the model", async () => {
    const sent = JSON.stringify(model.requests)
    for (const id of [ids.userA, ids.userB]) expect(sent).not.toContain(id)
    expect(sent).not.toContain("sectest.invalid")
  })

  it("confirms a card through POST /meal-logs, once, and only for its owner", async () => {
    // A's own private food, found by A, proposed, confirmed.
    model.queue = [
      { toolUses: [{ id: "t1", name: "search_foods", input: { queries: [`${TAG} secret granola`] } }] },
      {
        toolUses: [
          { id: "t2", name: "propose_meal_log", input: { slot: "Breakfast", items: [{ ref: "f1", count: null, servings: null, amount: 60, unit: "g" }] } },
        ],
      },
      { text: "Here's your granola." },
    ]
    const conversation = uuidv7()
    const res = await sendTurn("token-a", conversation, "log 60 g granola")
    const card = res.events.find((event) => event.type === "proposal")
    expect(card?.type).toBe("proposal")
    if (card?.type !== "proposal") return
    expect(card.proposal.confirmed).toBe(false)

    // Confirm twice: one meal. The second is the retry case, answered 200.
    expect((await call("POST", "/meal-logs", "token-a", card.proposal.meal, writes)).status).toBe(201)
    expect((await call("POST", "/meal-logs", "token-a", card.proposal.meal, writes)).status).toBe(200)

    // B cannot claim the confirmed card's id: a conflict, never a second meal.
    // (B has no way to read A's card in the first place; this is the backstop.)
    expect((await call("POST", "/meal-logs", "token-b", card.proposal.meal, writes)).status).toBe(409)

    const detail = await call("GET", `/chat/conversations/${conversation}`, "token-a")
    const messages = detail.body.messages as { proposal: { confirmed: boolean } | null }[]
    expect(messages.find((message) => message.proposal)?.proposal?.confirmed).toBe(true)
  })

  it("lets only the owner dismiss a card", async () => {
    model.queue = [
      { toolUses: [{ id: "t1", name: "search_foods", input: { queries: [`${TAG} secret granola`] } }] },
      {
        toolUses: [
          { id: "t2", name: "propose_meal_log", input: { slot: "Snack", items: [{ ref: "f1", count: null, servings: null, amount: 30, unit: "g" }] } },
        ],
      },
      { text: "Card's up." },
    ]
    const conversation = uuidv7()
    const res = await sendTurn("token-a", conversation, "snack")
    const done = res.events.find((event) => event.type === "done")
    if (done?.type !== "done") throw new Error("no done event")

    expect((await call("POST", `/chat/messages/${done.messageId}/dismiss`, "token-b")).status).toBe(404)
    const [stillOpen] = (await messagesOf(conversation)).filter((row) => row.proposal)
    expect(stillOpen?.proposal?.dismissed).toBe(false)

    expect((await call("POST", `/chat/messages/${done.messageId}/dismiss`, "token-a")).status).toBe(200)
    const [dismissed] = (await messagesOf(conversation)).filter((row) => row.proposal)
    expect(dismissed?.proposal?.dismissed).toBe(true)
  })
})

describe("the AI gate (Q8, Q15)", () => {
  it("refuses a user without consent before calling the model, and keeps no message", async () => {
    const before = model.calls
    const conversation = uuidv7()
    const res = await sendTurn("token-c", conversation, "hello")
    expect(res.status).toBe(403)
    expect(res.body.code).toBe("ai-consent-required")
    expect(model.calls).toBe(before)
    expect(await messagesOf(conversation)).toEqual([])
  })

  it("lets a user grant and withdraw consent for themselves only", async () => {
    expect((await call("GET", "/ai/consent", "token-c")).body).toEqual({ consentedAt: null })
    const granted = await call("PUT", "/ai/consent", "token-c", { granted: true })
    expect(granted.body.consentedAt).toEqual(expect.any(String))
    expect((await call("GET", "/ai/consent", "token-a")).body.consentedAt).toEqual(expect.any(String))
    const withdrawn = await call("PUT", "/ai/consent", "token-c", { granted: false })
    expect(withdrawn.body).toEqual({ consentedAt: null })
  })

  it("refuses once the month's $5 is spent, and reports the allowance", async () => {
    const spent = await setup("spend", () =>
      db
        .insert(schema.aiUsage)
        .values({ id: randomUUID(), userId: ids.userB, feature: "ocr", model: "claude-haiku-5-5", costUsd: 5, rateVersion: "2026-10-28" })
        .returning({ id: schema.aiUsage.id }),
    )
    const before = model.calls
    const res = await sendTurn("token-b", uuidv7(), "hello")
    expect(res.status).toBe(429)
    expect(res.body.code).toBe("ai-allowance-used")
    expect(res.body.resetsOn).toMatch(/^\d{4}-\d{2}-01$/)
    expect(model.calls).toBe(before)

    const allowance = await call("GET", "/ai/allowance", "token-b")
    expect(allowance.body).toMatchObject({ budgetUsd: 5, rung: "exhausted" })
    // A's spend is A's own.
    expect((await call("GET", "/ai/allowance", "token-a")).body.rung).toBe("full")

    await setup("unspend", () => db.delete(schema.aiUsage).where(eq(schema.aiUsage.id, spent[0]!.id)))
  })
})

describe("keeping chats (Q17)", () => {
  it("'Delete all chats' removes every one of the user's own chats, and only theirs", async () => {
    model.queue = [{ text: "one" }, { text: "two" }]
    const first = uuidv7()
    const second = uuidv7()
    await sendTurn("token-b", first, "first chat")
    await sendTurn("token-b", second, "second chat")
    const usageBefore = (await usageOf(ids.userB)).length

    const res = await call("DELETE", "/chat/conversations", "token-b")
    expect(res.body.deleted).toBeGreaterThanOrEqual(2)
    expect(await messagesOf(first)).toEqual([])
    expect(await messagesOf(second)).toEqual([])
    expect((await call("GET", "/chat/conversations", "token-b")).body.conversations).toEqual([])
    // A's chat is untouched, and B's ledger stays: it holds no text.
    expect(await messagesOf(conversationA)).toHaveLength(2)
    expect(await usageOf(ids.userB)).toHaveLength(usageBefore)
  })

  it("the daily cleanup removes a chat untouched for 12 months and keeps a recent one", async () => {
    const stale = uuidv7()
    const recent = uuidv7()
    await setup("old chats", () =>
      db.insert(schema.chatConversations).values([
        { id: stale, userId: ids.userA, title: "old", updatedAt: new Date(Date.now() - 400 * 86_400_000) },
        { id: recent, userId: ids.userA, title: "recent", updatedAt: new Date(Date.now() - 300 * 86_400_000) },
      ]),
    )
    await setup("old message", () =>
      db.insert(schema.chatMessages).values({ id: uuidv7(), userId: ids.userA, conversationId: stale, role: "user", content: "old" }),
    )

    const { deleteStaleChatRows } = await import("../../server/inngest/functions")
    expect(await deleteStaleChatRows()).toBeGreaterThanOrEqual(1)

    const left = await setup("left", () =>
      db
        .select({ id: schema.chatConversations.id })
        .from(schema.chatConversations)
        .where(inArray(schema.chatConversations.id, [stale, recent, conversationA])),
    )
    expect(left.map((row) => row.id).sort()).toEqual([recent, conversationA].sort())
    expect(await messagesOf(stale)).toEqual([])
  })
})

describe("deleting a user removes their chats (Q17, the cascade)", () => {
  it("leaves no conversation or message behind", async () => {
    model.queue = [{ text: "bye" }]
    await call("PUT", "/ai/consent", "token-c", { granted: true })
    const conversation = uuidv7()
    await sendTurn("token-c", conversation, "remember me")
    expect((await messagesOf(conversation)).length).toBeGreaterThan(0)

    await setup("delete C", () => db.delete(schema.users).where(eq(schema.users.clerkId, ids.userC)))
    expect(await messagesOf(conversation)).toEqual([])
    const conversations = await setup("conversations", () =>
      db.select().from(schema.chatConversations).where(eq(schema.chatConversations.userId, ids.userC)),
    )
    expect(conversations).toEqual([])
  })
})

