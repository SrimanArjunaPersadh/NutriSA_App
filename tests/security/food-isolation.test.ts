import { randomBytes, randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The food routes' isolation guarantee, against real Postgres.
 *
 * `foods` is the one table where "scoped to this user" is the wrong question —
 * global rows (`user_id IS NULL`) are everyone's — so it has its own read
 * helper in the scoped layer, and a widening `OR` is exactly where a leak would
 * hide. This file proves the `OR` widens to shared rows and nothing else:
 *
 * - a food A creates is A's, whatever the body claims
 * - B's search and B's barcode lookup never return A's own food
 * - a shared row is visible to both
 * - an OFF product resolved by A's scan is cached as **global**, not as A's
 * - a retried create is idempotent; B reusing A's id is refused
 * - saved meals: B can neither list, change, delete nor reuse the id of A's
 *
 * Open Food Facts is mocked. The suite tests this server's boundaries, and a
 * third party's availability must not decide whether it passes.
 */

const ids = vi.hoisted(() => ({
  userA: "",
  userB: "",
}))

const off = vi.hoisted(() => ({
  /** What the next `lookupOff` answers. Set per test. */
  product: null as unknown,
}))

vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => {
    if (token === "token-a") return { sub: ids.userA }
    if (token === "token-b") return { sub: ids.userB }
    throw new Error("Token verification failed")
  },
}))

vi.mock("../../server/food/off", () => ({
  searchOff: async () => ({ status: "ok", foods: [] }),
  lookupOff: async () => ({ status: "ok", food: off.product }),
}))

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

/** A 13-digit barcode nobody else's test will mint. */
function barcode(): string {
  return `2${randomBytes(6).readUIntBE(0, 6).toString().padStart(12, "0").slice(0, 12)}`
}

let foodRoutes: Awaited<typeof import("../../server/routes/foods")>["foodRoutes"]
let db: Awaited<typeof import("../../server/db")>["db"]
let schema: Awaited<typeof import("../../server/db")>["schema"]
let withRetry: Awaited<typeof import("../../server/db/retry")>["withRetry"]

/** A word unique to this run, so searches match only this file's rows. */
const TAG = `sectest${randomUUID().slice(0, 8)}`
const sharedBarcodes: string[] = []

function setup<T>(label: string, run: () => Promise<T>): Promise<T> {
  return withRetry(`fixture ${label}`, run)
}

type Json = Record<string, unknown>

async function send(method: string, path: string, token: string | undefined, body?: Json) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await foodRoutes.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: (await res.json()) as Json }
}

function food(overrides: Json = {}): Json {
  return {
    id: uuidv7(),
    name: `${TAG} oats`,
    unit: "g",
    per: { kcal: 380, protein: 13, carbs: 60, fat: 7 },
    ...overrides,
  }
}

function names(body: Json): string[] {
  return (body.foods as { name: string }[]).map((row) => row.name)
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set. These tests write and delete rows, so they need a " +
        "Neon branch of their own — never the main database. See vitest.security.config.mts.",
    )
  }

  ids.userA = `user_sectest_fa_${randomUUID().replace(/-/g, "")}`
  ids.userB = `user_sectest_fb_${randomUUID().replace(/-/g, "")}`

  const dbModule = await import("../../server/db")
  db = dbModule.db
  schema = dbModule.schema
  withRetry = (await import("../../server/db/retry")).withRetry
  foodRoutes = (await import("../../server/routes/foods")).foodRoutes

  await setup("users", () =>
    db.insert(schema.users).values([
      { clerkId: ids.userA, email: "fa@sectest.invalid" },
      { clerkId: ids.userB, email: "fb@sectest.invalid" },
    ]),
  )
})

afterAll(async () => {
  if (!db || !withRetry) return
  // Own rows go with their users through the cascade. Global rows belong to
  // nobody and have to be removed by name.
  if (sharedBarcodes.length > 0) {
    await setup("shared cleanup", () =>
      db.delete(schema.foods).where(inArray(schema.foods.barcode, sharedBarcodes)),
    )
  }
  await setup("users cleanup", () =>
    db.delete(schema.users).where(inArray(schema.users.clerkId, [ids.userA, ids.userB])),
  )
})

describe("an unauthenticated caller gets nothing", () => {
  it.each([
    ["GET", "/foods/search?q=oats"],
    ["GET", "/foods/recent"],
    ["GET", "/foods/barcode/6009522310363"],
  ])("refuses %s %s", async (method, path) => {
    expect((await send(method, path, undefined)).status).toBe(401)
    expect((await send(method, path, "forged")).status).toBe(401)
  })

  it("refuses POST /foods and writes nothing", async () => {
    const body = food()
    expect((await send("POST", "/foods", undefined, body)).status).toBe(401)
    const rows = await setup("orphan", () =>
      db.select().from(schema.foods).where(eq(schema.foods.id, body.id as string)),
    )
    expect(rows).toEqual([])
  })
})

describe("a created food belongs to whoever is signed in", () => {
  it("ignores a user id in the body", async () => {
    const body = food({ name: `${TAG} A private`, user_id: ids.userB, userId: ids.userB })
    const res = await send("POST", "/foods", "token-a", body)
    expect(res.status).toBe(201)

    const rows = await setup("owner", () =>
      db.select().from(schema.foods).where(eq(schema.foods.id, body.id as string)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.userId).toBe(ids.userA)
    expect(rows[0]!.source).toBe("manual")
  })

  it("is found by A's search and not by B's", async () => {
    expect(names((await send("GET", `/foods/search?q=${TAG}`, "token-a")).body)).toContain(
      `${TAG} A private`,
    )
    expect(names((await send("GET", `/foods/search?q=${TAG}`, "token-b")).body)).not.toContain(
      `${TAG} A private`,
    )
  })

  it("is not returned by B's barcode lookup of A's barcode", async () => {
    const code = barcode()
    expect((await send("POST", "/foods", "token-a", food({ barcode: code }))).status).toBe(201)

    off.product = null
    const res = await send("GET", `/foods/barcode/${code}`, "token-b")
    expect(res.status).toBe(200)
    expect(res.body.food).toBeNull()

    const mine = await send("GET", `/foods/barcode/${code}`, "token-a")
    expect((mine.body.food as Json).origin).toBe("mine")
  })
})

describe("shared rows are everyone's, and only shared rows", () => {
  it("shows a global row to both users", async () => {
    const code = barcode()
    sharedBarcodes.push(code)
    await setup("global", () =>
      db.insert(schema.foods).values({
        id: randomUUID(),
        userId: null,
        name: `${TAG} shared beans`,
        unit: "g",
        per100: { kcal: 95, pro: 5, carb: 16.5, fat: 0.5 },
        barcode: code,
        source: "off",
      }),
    )

    for (const token of ["token-a", "token-b"]) {
      const res = await send("GET", `/foods/search?q=${TAG}`, token)
      const shared = (res.body.foods as Json[]).find((row) => row.name === `${TAG} shared beans`)
      expect(shared?.origin).toBe("shared")
    }
  })

  it("caches an OFF product resolved by A's scan as global, not as A's", async () => {
    const code = barcode()
    sharedBarcodes.push(code)
    off.product = {
      id: null,
      name: `${TAG} scanned`,
      brand: null,
      barcode: code,
      origin: "off",
      unit: "g",
      per: { kcal: 100, protein: 1, carbs: 2, fat: 3 },
      serving: { quantity: 30, label: "30 g" },
      imageUrl: null,
    }

    const res = await send("GET", `/foods/barcode/${code}`, "token-a")
    expect((res.body.food as Json).origin).toBe("shared")

    const rows = await setup("cached", () =>
      db.select().from(schema.foods).where(eq(schema.foods.barcode, code)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.userId).toBeNull()
    expect(rows[0]!.source).toBe("off")

    // And B now gets it locally — OFF is not asked a second time.
    off.product = null
    const again = await send("GET", `/foods/barcode/${code}`, "token-b")
    expect((again.body.food as Json).name).toBe(`${TAG} scanned`)
  })
})

describe("the client-minted id", () => {
  it("makes a retried create idempotent", async () => {
    const body = food({ name: `${TAG} retried` })
    expect((await send("POST", "/foods", "token-a", body)).status).toBe(201)
    const replay = await send("POST", "/foods", "token-a", body)
    expect(replay.status).toBe(200)
    expect(replay.body.created).toBe(false)

    const rows = await setup("retry", () =>
      db.select().from(schema.foods).where(eq(schema.foods.id, body.id as string)),
    )
    expect(rows).toHaveLength(1)
  })

  it("refuses B reusing A's id, and leaves A's row alone", async () => {
    const body = food({ name: `${TAG} A owns this id` })
    expect((await send("POST", "/foods", "token-a", body)).status).toBe(201)

    const clash = await send("POST", "/foods", "token-b", { ...body, name: `${TAG} B's attempt` })
    expect(clash.status).toBe(409)
    expect(JSON.stringify(clash.body)).not.toContain("A owns this id")

    const rows = await setup("clash", () =>
      db.select().from(schema.foods).where(eq(schema.foods.id, body.id as string)),
    )
    expect(rows[0]!.userId).toBe(ids.userA)
    expect(rows[0]!.name).toBe(`${TAG} A owns this id`)
  })
})

describe("saved meals are their owner's alone", () => {
  const macros = { kcal: 500, protein: 40, carbs: 50, fat: 10 }

  function savedMeal(overrides: Json = {}): Json {
    return {
      id: uuidv7(),
      name: `${TAG} saved`,
      macros,
      items: [{ name: "Rice", qty: "150 g", macros }],
      ...overrides,
    }
  }

  async function savedRow(id: string) {
    const rows = await setup("saved row", () =>
      db.select().from(schema.customMeals).where(eq(schema.customMeals.id, id)),
    )
    return rows[0]
  }

  it("belongs to A whatever the body says, and B's list does not show it", async () => {
    const body = savedMeal({ user_id: ids.userB, userId: ids.userB })
    expect((await send("POST", "/saved-meals", "token-a", body)).status).toBe(201)
    expect((await savedRow(body.id as string))?.userId).toBe(ids.userA)

    const mine = await send("GET", "/saved-meals", "token-a")
    const theirs = await send("GET", "/saved-meals", "token-b")
    const ids_ = (res: { body: Json }) => (res.body.meals as { id: string }[]).map((m) => m.id)
    expect(ids_(mine)).toContain(body.id)
    expect(ids_(theirs)).not.toContain(body.id)
  })

  it("refuses B's patch with the same 404 as a missing id, and changes nothing", async () => {
    const body = savedMeal({ name: `${TAG} untouchable` })
    await send("POST", "/saved-meals", "token-a", body)

    const res = await send("PATCH", `/saved-meals/${body.id as string}`, "token-b", { name: "hijacked" })
    expect(res.status).toBe(404)
    const missing = await send("PATCH", `/saved-meals/${randomUUID()}`, "token-b", { name: "x" })
    expect(missing.body).toEqual(res.body)

    expect((await savedRow(body.id as string))?.name).toBe(`${TAG} untouchable`)
  })

  it("deletes nothing when B deletes A's meal, and admits nothing", async () => {
    const body = savedMeal()
    await send("POST", "/saved-meals", "token-a", body)

    const res = await send("DELETE", `/saved-meals/${body.id as string}`, "token-b")
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(false)
    expect(await savedRow(body.id as string)).toBeDefined()
  })

  it("refuses B reusing A's id", async () => {
    const body = savedMeal()
    await send("POST", "/saved-meals", "token-a", body)
    expect((await send("POST", "/saved-meals", "token-b", body)).status).toBe(409)
  })

  it("leaves the header alone on a rename", async () => {
    const body = savedMeal()
    await send("POST", "/saved-meals", "token-a", body)

    const res = await send("PATCH", `/saved-meals/${body.id as string}`, "token-a", { name: `${TAG} renamed` })
    expect(res.status).toBe(200)
    const row = await savedRow(body.id as string)
    expect(row?.name).toBe(`${TAG} renamed`)
    expect(row?.kcal).toBe(500)
  })
})
