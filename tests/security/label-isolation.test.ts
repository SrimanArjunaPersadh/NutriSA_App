import { randomBytes, randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The label reader's isolation and ledger guarantees, against real Postgres
 * (Phase 8, `label-ocr`).
 *
 * - an unauthenticated or forged caller reads nothing and costs nothing
 * - a read is billed to whoever is signed in, whatever the body claims
 * - every answered call lands in `ai_usage` as `feature='ocr'`, priced by the
 *   engine — refusals too, because they are billed
 * - a call that never answered (timeout) writes no row
 * - a body that is not a JPEG is refused before the model is called
 * - `POST /foods` stores `label_scan` when asked, and refuses `off`
 *
 * The model is mocked: the suite tests this server's boundaries, and neither a
 * third party's availability nor a real spend should decide whether it passes.
 * Clerk's `verifyToken` is stubbed as in the neighbouring files.
 */

const ids = vi.hoisted(() => ({ userA: "", userB: "" }))

const model = vi.hoisted(() => ({
  /** What the next call does. Set per test. */
  next: "ok" as "ok" | "refusal" | "timeout",
  calls: 0,
}))

vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => {
    if (token === "token-a") return { sub: ids.userA }
    if (token === "token-b") return { sub: ids.userB }
    throw new Error("Token verification failed")
  },
}))

vi.mock("../../server/ai/config", async () => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  return {
    LABEL_MODEL: "claude-haiku-5-5",
    LABEL_TIMEOUT_MS: 15_000,
    LABEL_MAX_TOKENS: 2048,
    anthropic: () => ({
      messages: {
        create: async () => {
          model.calls += 1
          if (model.next === "timeout") throw new Anthropic.APIConnectionTimeoutError()
          const usage = {
            input_tokens: 1800,
            output_tokens: 300,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          }
          if (model.next === "refusal") return { stop_reason: "refusal", content: [], usage }
          return {
            stop_reason: "end_turn",
            usage,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "ok",
                  name: "Sectest Oats",
                  basis: "per_100g",
                  servingSize: { value: 40, unit: "g" },
                  energyKj: 1590,
                  energyKcal: 380,
                  protein: 13,
                  carbohydrate: 60,
                  fat: 7,
                }),
              },
            ],
          }
        },
      },
    }),
  }
})

/** Same minter as `write-isolation.test.ts`, for the same reason. */
function uuidv7(): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(Date.now(), 0, 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    "-",
  )
}

/** The shortest body that passes the JPEG check. */
const IMAGE = "/9j/4AAQSkZJRgABAQ=="

let labelRoutes: Awaited<typeof import("../../server/routes/label")>["labelRoutes"]
let foodRoutes: Awaited<typeof import("../../server/routes/foods")>["foodRoutes"]
let db: Awaited<typeof import("../../server/db")>["db"]
let schema: Awaited<typeof import("../../server/db")>["schema"]
let withRetry: Awaited<typeof import("../../server/db/retry")>["withRetry"]

function setup<T>(label: string, run: () => Promise<T>): Promise<T> {
  return withRetry(`fixture ${label}`, run)
}

type Json = Record<string, unknown>

async function send(
  app: typeof labelRoutes,
  path: string,
  token: string | undefined,
  body: Json,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await app.request(path, { method: "POST", headers, body: JSON.stringify(body) })
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json }
}

const read = (token: string | undefined, body: Json = { image: IMAGE }) =>
  send(labelRoutes, "/label-reads", token, body)

function usageRows(userId: string) {
  return setup("ai_usage", () =>
    db.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId)),
  )
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set. These tests write and delete rows, so they need a " +
        "Neon branch of their own — never the main database. See vitest.security.config.mts.",
    )
  }

  ids.userA = `user_sectest_la_${randomUUID().replace(/-/g, "")}`
  ids.userB = `user_sectest_lb_${randomUUID().replace(/-/g, "")}`

  const dbModule = await import("../../server/db")
  db = dbModule.db
  schema = dbModule.schema
  withRetry = (await import("../../server/db/retry")).withRetry
  labelRoutes = (await import("../../server/routes/label")).labelRoutes
  foodRoutes = (await import("../../server/routes/foods")).foodRoutes

  await setup("users", () =>
    db.insert(schema.users).values([
      { clerkId: ids.userA, email: "la@sectest.invalid" },
      { clerkId: ids.userB, email: "lb@sectest.invalid" },
    ]),
  )
})

afterAll(async () => {
  if (!db || !withRetry) return
  // `ai_usage` and `foods` rows go with their users through the cascade.
  await setup("users cleanup", () =>
    db.delete(schema.users).where(inArray(schema.users.clerkId, [ids.userA, ids.userB])),
  )
})

describe("an unauthenticated caller reads nothing and costs nothing", () => {
  it("refuses no token and a forged one without calling the model", async () => {
    const before = model.calls
    expect((await read(undefined)).status).toBe(401)
    expect((await read("forged")).status).toBe(401)
    expect(model.calls).toBe(before)
  })
})

describe("a read is billed to whoever is signed in", () => {
  it("answers the reading and writes one ocr row for A, whatever the body says", async () => {
    model.next = "ok"
    const res = await read("token-a", { image: IMAGE, userId: ids.userB, user_id: ids.userB })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("Sectest Oats")
    expect(res.body.energyKj).toBe(1590)

    const rows = await usageRows(ids.userA)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      feature: "ocr",
      model: "claude-haiku-5-5",
      inputTokens: 1800,
      outputTokens: 300,
      // The engine's price: 1800 × $0.10/M + 300 × $0.50/M.
      costUsd: 0.00033,
      rateVersion: "2026-10-26",
    })

    expect(await usageRows(ids.userB)).toEqual([])
  })

  it("records a refusal, because it was billed, and answers upstream-failed", async () => {
    model.next = "refusal"
    const before = (await usageRows(ids.userB)).length
    const res = await read("token-b")
    expect(res.status).toBe(502)
    expect(res.body.code).toBe("upstream-failed")
    expect(await usageRows(ids.userB)).toHaveLength(before + 1)
  })

  it("writes no row for a timeout, which never answered", async () => {
    model.next = "timeout"
    const before = (await usageRows(ids.userB)).length
    const res = await read("token-b")
    expect(res.status).toBe(504)
    expect(res.body.code).toBe("upstream-failed")
    expect(await usageRows(ids.userB)).toHaveLength(before)
  })
})

describe("a body that is not a JPEG never reaches the model", () => {
  it.each([
    ["a PNG", { image: "iVBORw0KGgoAAAANSUhEUg==" }],
    ["no image", {}],
    ["line breaks in the base64", { image: "/9j/4AAQ\nSkZJRg==" }],
  ])("refuses %s with a 400", async (_label, body) => {
    const before = model.calls
    const res = await read("token-a", body)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe("bad-request")
    expect(model.calls).toBe(before)
  })
})

describe("POST /foods records how a food came in", () => {
  it("stores label_scan when the reader filled the form", async () => {
    const id = uuidv7()
    const res = await send(foodRoutes, "/foods", "token-a", {
      id,
      name: "Sectest label food",
      unit: "g",
      per: { kcal: 380, protein: 13, carbs: 60, fat: 7 },
      source: "label_scan",
    })
    expect(res.status).toBe(201)

    const rows = await setup("label food", () =>
      db.select().from(schema.foods).where(eq(schema.foods.id, id)),
    )
    expect(rows[0]?.source).toBe("label_scan")
    expect(rows[0]?.userId).toBe(ids.userA)
  })

  it("still stores manual when no source is sent", async () => {
    const id = uuidv7()
    await send(foodRoutes, "/foods", "token-a", {
      id,
      name: "Sectest typed food",
      unit: "g",
      per: { kcal: 100, protein: 1, carbs: 1, fat: 1 },
    })
    const rows = await setup("typed food", () =>
      db.select().from(schema.foods).where(eq(schema.foods.id, id)),
    )
    expect(rows[0]?.source).toBe("manual")
  })

  it.each(["off", "seed"])("refuses a client claiming source %s", async (source) => {
    const id = uuidv7()
    const res = await send(foodRoutes, "/foods", "token-a", {
      id,
      name: "Sectest forged source",
      unit: "g",
      per: { kcal: 100, protein: 1, carbs: 1, fat: 1 },
      source,
    })
    expect(res.status).toBe(400)
    const rows = await setup("forged source", () =>
      db.select().from(schema.foods).where(eq(schema.foods.id, id)),
    )
    expect(rows).toEqual([])
  })
})
