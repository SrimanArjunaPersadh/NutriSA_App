import { randomBytes, randomUUID } from "node:crypto"

import { and, eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The write half of the isolation guarantee, against real Postgres.
 *
 * `user-isolation.test.ts` proves user A cannot **read** user B's rows. This
 * file proves the other half of plan.md's line — "User A cannot read or write
 * user B's rows" — and the parts of `api-writes` that only a database can
 * settle:
 *
 * - a body carrying `user_id` does not change whose row is written
 * - a client-minted UUIDv7 makes a retried write idempotent
 * - an id that belongs to somebody else is refused, and tells the caller nothing
 * - deleting somebody else's meal deletes nothing and admits nothing
 * - a back-dated row keeps a real `created_at`
 * - one weigh-in per day, replaced rather than duplicated
 *
 * Same shape as its neighbour: everything is real except Clerk's `verifyToken`,
 * which stands in for "Clerk said this token belongs to user X" and nothing
 * else. The test cannot forge a `UserScope` — the brand symbol is
 * module-private — so it comes in through the front door, which is also the
 * only door an attacker has.
 *
 * ⚠️ The write routes carry a per-user rate limit (60/minute — see
 * `server/http/limits.ts`). This file writes well under that as user A. A much
 * larger suite would start seeing 429s and should reach for a longer window
 * rather than removing the limit.
 */

const ids = vi.hoisted(() => ({
  userA: "",
  userB: "",
}))

vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => {
    if (token === "token-a") return { sub: ids.userA }
    if (token === "token-b") return { sub: ids.userB }
    throw new Error("Token verification failed")
  },
}))

/**
 * A UUIDv7, minted the way the client will have to.
 *
 * Written here rather than imported from the app. `src/lib/uuid.ts` now exists
 * and mints the real thing on `meal-logging`, but it reaches for `expo-crypto`,
 * which is a native module with no binding under Node — importing it here would
 * make this suite depend on a React Native runtime to test Postgres. The two
 * are checked against each other by contract instead: both are parsed by
 * `clientIdSchema`, and `tests/uuidv7.test.ts` asserts the client's version
 * against it directly. What must match is the **shape**: 48 bits of millisecond
 * timestamp, version 7 in the high nibble of byte 6, the RFC variant in byte 8,
 * random everywhere else.
 */
function uuidv7(): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(Date.now(), 0, 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-")
}

/** Populated in `beforeAll` — see the note in `user-isolation.test.ts`. */
let writes: Awaited<typeof import("../../server/routes/writes")>["writes"]
let reads: Awaited<typeof import("../../server/routes/reads")>["reads"]
let db: Awaited<typeof import("../../server/db")>["db"]
let schema: Awaited<typeof import("../../server/db")>["schema"]
let withRetry: Awaited<typeof import("../../server/db/retry")>["withRetry"]
let today: string
let addDays: Awaited<typeof import("@engine")>["addDays"]

function setup<T>(label: string, run: () => Promise<T>): Promise<T> {
  return withRetry(`fixture ${label}`, run)
}

type Json = Record<string, unknown>

async function send(
  app: typeof writes,
  method: string,
  path: string,
  token: string | undefined,
  body?: Json,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  return { status: res.status, body: (await res.json()) as Json }
}

const post = (path: string, token: string | undefined, body: Json) =>
  send(writes, "POST", path, token, body)

const patch = (path: string, token: string | undefined, body: Json) =>
  send(writes, "PATCH", path, token, body)

const del = (path: string, token: string | undefined) =>
  send(writes, "DELETE", path, token)

/** A complete, valid meal body. Spread it and override the interesting field. */
function meal(overrides: Json = {}): Json {
  return {
    id: uuidv7(),
    name: "Test meal",
    macros: { kcal: 500, protein: 40, carbs: 50, fat: 10 },
    items: [
      { name: "Test item", qty: "1", macros: { kcal: 500, protein: 40, carbs: 50, fat: 10 } },
    ],
    ...overrides,
  }
}

async function mealRows(userId: string) {
  return setup("read meals", () =>
    db.select().from(schema.mealLogs).where(eq(schema.mealLogs.userId, userId)),
  )
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set. These tests write and delete rows, so they need a " +
        "Neon branch of their own — never the main database. See vitest.security.config.mts.",
    )
  }

  ids.userA = `user_sectest_wa_${randomUUID().replace(/-/g, "")}`
  ids.userB = `user_sectest_wb_${randomUUID().replace(/-/g, "")}`

  const dbModule = await import("../../server/db")
  db = dbModule.db
  schema = dbModule.schema
  withRetry = (await import("../../server/db/retry")).withRetry
  writes = (await import("../../server/routes/writes")).writes
  reads = (await import("../../server/routes/reads")).reads

  const engine = await import("@engine")
  addDays = engine.addDays
  today = engine.currentLoggingDay()

  await setup("users", () =>
    db.insert(schema.users).values([
      { clerkId: ids.userA, email: "wa@sectest.invalid" },
      { clerkId: ids.userB, email: "wb@sectest.invalid" },
    ]),
  )
})

afterAll(async () => {
  if (!db || !withRetry) return
  await setup("cleanup", () =>
    db.delete(schema.users).where(inArray(schema.users.clerkId, [ids.userA, ids.userB])),
  )
})

describe("an unauthenticated write is refused, and writes nothing", () => {
  it("refuses POST /meal-logs with no Authorization header", async () => {
    const body = meal()
    const res = await post("/meal-logs", undefined, body)

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: "unauthenticated" })

    // The row is the assertion. A 401 that still wrote would look identical
    // from the client's side.
    const rows = await setup("orphan check", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, body.id as string)),
    )
    expect(rows).toEqual([])
  })

  it("refuses a forged token on every write route", async () => {
    expect((await post("/meal-logs", "forged", meal())).status).toBe(401)
    expect((await post("/weight-logs", "forged", { id: uuidv7(), weightKg: 90 })).status).toBe(401)
    expect((await del("/meal-logs/" + randomUUID(), "forged")).status).toBe(401)
  })
})

describe("user_id never comes from the client", () => {
  /**
   * The attack this whole layer exists to stop, stated directly. Every field
   * name a client might try is in this body at once; the row must still be A's.
   */
  it("ignores a user id in the body", async () => {
    const body = meal({
      name: "A's meal",
      user_id: ids.userB,
      userId: ids.userB,
      scope: { userId: ids.userB },
    })

    const res = await post("/meal-logs", "token-a", body)
    expect(res.status).toBe(201)

    const rows = await setup("owner check", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, body.id as string)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.userId).toBe(ids.userA)
    expect(rows[0]!.userId).not.toBe(ids.userB)
  })

  it("gives B none of A's rows afterwards", async () => {
    expect(await mealRows(ids.userB)).toEqual([])
  })
})

describe("the client-minted id makes a retry idempotent", () => {
  it("writes once and reports created: false on the replay", async () => {
    const body = meal({ name: "Retried meal" })

    const first = await post("/meal-logs", "token-a", body)
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ created: true })

    // The same request again, as a client that never saw the first response
    // would send it.
    const replay = await post("/meal-logs", "token-a", body)
    expect(replay.status).toBe(200)
    expect(replay.body).toMatchObject({ created: false })

    const rows = await setup("dupe check", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, body.id as string)),
    )
    expect(rows).toHaveLength(1)
  })

  it("answers a replay with the stored row, not the second body", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id, name: "First words" }))

    const replay = await post("/meal-logs", "token-a", meal({ id, name: "Second words" }))
    expect(replay.body).toMatchObject({ created: false })

    const rows = await setup("stored words", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(rows[0]!.name).toBe("First words")
  })

  /**
   * An id already held by another user. Random v7 ids do not collide into each
   * other, so this is a client minting them badly or somebody probing — and
   * either way the answer must not confirm that the row exists or say whose it
   * is.
   */
  it("refuses an id that belongs to someone else, and leaves it alone", async () => {
    const id = uuidv7()
    expect((await post("/meal-logs", "token-b", meal({ id, name: "B's meal" }))).status).toBe(201)

    const res = await post("/meal-logs", "token-a", meal({ id, name: "A's overwrite" }))
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: "conflict" })
    expect(JSON.stringify(res.body)).not.toContain(ids.userB)

    const rows = await setup("untouched", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(rows[0]!.userId).toBe(ids.userB)
    expect(rows[0]!.name).toBe("B's meal")
  })
})

describe("deleting", () => {
  it("cannot delete another user's meal, and does not say so", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-b", meal({ id, name: "B's dinner" }))

    const res = await del(`/meal-logs/${id}`, "token-a")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ deleted: false })

    const rows = await setup("still there", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(rows).toHaveLength(1)
  })

  it("deletes its own meal, and is idempotent about it", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id }))

    expect((await del(`/meal-logs/${id}`, "token-a")).body).toMatchObject({ deleted: true })
    // The same answer shape as deleting somebody else's — deliberately. A
    // replayed delete from the offline queue is not a failure.
    expect((await del(`/meal-logs/${id}`, "token-a")).body).toMatchObject({ deleted: false })
  })

  it("refuses an id that is not a UUID rather than 500ing on the cast", async () => {
    const res = await del("/meal-logs/not-a-uuid", "token-a")
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: "bad-request" })
  })
})

describe("editing", () => {
  it("cannot patch another user's meal, and learns nothing from trying", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-b", meal({ id, name: "B's dinner" }))

    const res = await patch(`/meal-logs/${id}`, "token-a", { name: "A's dinner" })
    expect(res.status).toBe(404)

    const rows = await setup("unchanged", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(rows[0]?.name).toBe("B's dinner")
    expect(rows[0]?.userId).toBe(ids.userB)
  })

  /**
   * The same 404 for an id that does not exist anywhere. That is what makes the
   * case above safe to answer at all: a prober cannot tell "not yours" from
   * "not a thing", so the route is not an existence oracle over other people's
   * rows.
   */
  it("answers the same way for an id nobody owns", async () => {
    const res = await patch(`/meal-logs/${uuidv7()}`, "token-a", { name: "Nothing" })
    expect(res.status).toBe(404)
  })

  it("edits its own meal in place, keeping the id and created_at", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id, name: "Lunch" }))

    const before = await setup("before", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )

    const res = await patch(`/meal-logs/${id}`, "token-a", {
      name: "Late lunch",
      macros: { kcal: 700, protein: 50, carbs: 60, fat: 20 },
    })
    expect(res.status).toBe(200)

    const after = await setup("after", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(after).toHaveLength(1)
    expect(after[0]?.name).toBe("Late lunch")
    // The whole reason this is a patch and not a delete-and-re-post.
    expect(after[0]?.createdAt.getTime()).toBe(before[0]?.createdAt.getTime())
    expect(after[0]?.sortOrder).toBe(before[0]?.sortOrder)
  })

  it("leaves a field alone when the patch does not mention it", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id, name: "Snack", loggedTime: "15:30" }))

    await patch(`/meal-logs/${id}`, "token-a", { name: "Afternoon snack" })

    const rows = await setup("read back", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(rows[0]?.loggedTime).toBe("15:30")
  })

  it("clears the time when the patch sends null", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id, loggedTime: "15:30" }))

    await patch(`/meal-logs/${id}`, "token-a", { loggedTime: null })

    const rows = await setup("read back", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(rows[0]?.loggedTime).toBeNull()
  })

  /**
   * A meal that moves day cannot keep its position: `sort_order` is a place
   * within a day, and carrying it across would drop the meal on top of whatever
   * already holds that slot on the day it lands on.
   */
  it("gives a meal that moves day a fresh position on the day it lands on", async () => {
    const target = addDays(today, -5)
    // Two meals already on the target day, so its next free position is 2.
    await post("/meal-logs", "token-a", meal({ date: target }))
    await post("/meal-logs", "token-a", meal({ date: target }))

    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id, date: addDays(today, -6) }))

    const res = await patch(`/meal-logs/${id}`, "token-a", { date: target })
    expect(res.body).toMatchObject({ date: target, sortOrder: 2 })
    expect(res.body).toMatchObject({ previousDate: addDays(today, -6) })
  })

  it("bounds a move by the same window a create is bounded by", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id }))

    expect((await patch(`/meal-logs/${id}`, "token-a", { date: addDays(today, 1) })).status).toBe(400)
    expect(
      (await patch(`/meal-logs/${id}`, "token-a", { date: addDays(today, -400) })).status,
    ).toBe(400)
  })

  it("refuses an empty patch rather than reporting a successful no-op", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id }))

    const res = await patch(`/meal-logs/${id}`, "token-a", {})
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: "bad-request" })
  })

  it("refuses an id that is not a UUID rather than 500ing on the cast", async () => {
    const res = await patch("/meal-logs/not-a-uuid", "token-a", { name: "x" })
    expect(res.status).toBe(400)
  })

  /**
   * An unauthenticated patch is refused before it reaches anything, the same as
   * every other write. Listed here as well as in the blanket case above because
   * this route was added a branch later, and a route that forgets to sit behind
   * the middleware looks exactly like one that does until someone checks.
   */
  it("refuses an unauthenticated patch", async () => {
    const id = uuidv7()
    await post("/meal-logs", "token-a", meal({ id }))

    const res = await patch(`/meal-logs/${id}`, undefined, { name: "Anyone's" })
    expect(res.status).toBe(401)
  })
})

describe("back-dating", () => {
  it("accepts a day inside the window and stores it as the log day", async () => {
    const day = addDays(today, -3)
    const res = await post("/meal-logs", "token-a", meal({ date: day, name: "Tuesday's lunch" }))

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ date: day })
  })

  /**
   * The rule plan.md states as "`date` accepted and validated, `created_at`
   * always real instant". Both truths on one row: eaten then, entered now.
   */
  it("keeps created_at at the real instant of the write", async () => {
    const id = uuidv7()
    const day = addDays(today, -10)
    const before = Date.now()

    await post("/meal-logs", "token-a", meal({ id, date: day }))

    const rows = await setup("created_at", () =>
      db.select().from(schema.mealLogs).where(eq(schema.mealLogs.id, id)),
    )
    expect(rows[0]!.date).toBe(day)
    // Written now, not on the day it is dated to. A minute of slack for the
    // round trip and the database's own clock.
    expect(rows[0]!.createdAt.getTime()).toBeGreaterThan(before - 60_000)
  })

  it("refuses tomorrow", async () => {
    const res = await post("/meal-logs", "token-a", meal({ date: addDays(today, 1) }))
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: "bad-request" })
  })

  it("refuses a day older than the window any surface can show", async () => {
    const res = await post("/meal-logs", "token-a", meal({ date: addDays(today, -400) }))
    expect(res.status).toBe(400)
  })

  it("refuses a date that is not a real day", async () => {
    expect((await post("/meal-logs", "token-a", meal({ date: "2026-02-30" }))).status).toBe(400)
  })
})

describe("the day's order comes from the server", () => {
  it("appends each meal after the last, without the client saying where", async () => {
    const day = addDays(today, -20)

    const first = await post("/meal-logs", "token-a", meal({ date: day, name: "Breakfast" }))
    const second = await post("/meal-logs", "token-a", meal({ date: day, name: "Lunch" }))

    expect(first.body).toMatchObject({ sortOrder: 0 })
    expect(second.body).toMatchObject({ sortOrder: 1 })
  })

  it("does not count another user's meals on the same day", async () => {
    const day = addDays(today, -21)

    await post("/meal-logs", "token-b", meal({ date: day, name: "B's breakfast" }))
    await post("/meal-logs", "token-b", meal({ date: day, name: "B's lunch" }))

    const mine = await post("/meal-logs", "token-a", meal({ date: day, name: "A's first" }))
    // 0, not 2 — the position is read through the scoped layer like everything
    // else, so B's day is invisible to it.
    expect(mine.body).toMatchObject({ sortOrder: 0 })
  })
})

describe("weigh-ins are one per day", () => {
  it("records the first one", async () => {
    const res = await post("/weight-logs", "token-a", {
      id: uuidv7(),
      date: addDays(today, -1),
      weightKg: 98.4,
    })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ replaced: false, weightKg: 98.4 })
  })

  it("replaces it rather than duplicating the day", async () => {
    const day = addDays(today, -1)
    const res = await post("/weight-logs", "token-a", {
      id: uuidv7(),
      date: day,
      weightKg: 97.9,
    })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ replaced: true, weightKg: 97.9 })

    const rows = await setup("one per day", () =>
      db
        .select()
        .from(schema.weightLogs)
        .where(and(eq(schema.weightLogs.userId, ids.userA), eq(schema.weightLogs.date, day))),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.weight).toBe(97.9)
  })

  /**
   * The upsert conflicts on `(user_id, date)`. If that target ever loses its
   * user column, this is the test that catches it — A writing the same day
   * would overwrite B's weigh-in instead of its own.
   */
  it("does not touch another user's weigh-in for the same day", async () => {
    const day = addDays(today, -1)
    await post("/weight-logs", "token-b", { id: uuidv7(), date: day, weightKg: 50 })
    await post("/weight-logs", "token-a", { id: uuidv7(), date: day, weightKg: 96.5 })

    const bs = await setup("B's weigh-in", () =>
      db
        .select()
        .from(schema.weightLogs)
        .where(and(eq(schema.weightLogs.userId, ids.userB), eq(schema.weightLogs.date, day))),
    )
    expect(bs).toHaveLength(1)
    expect(bs[0]!.weight).toBe(50)
  })

  it("refuses a weight the column cannot hold", async () => {
    const res = await post("/weight-logs", "token-a", { id: uuidv7(), weightKg: 1000 })
    expect(res.status).toBe(400)
  })

  it("refuses a v4 id", async () => {
    const res = await post("/weight-logs", "token-a", { id: randomUUID(), weightKg: 90 })
    expect(res.status).toBe(400)
  })
})

describe("targets", () => {
  const macros = { kcal: 2300, protein: 167, carbs: 195, fat: 60 }

  async function getTargets(token: string) {
    const res = await reads.request("/targets", {
      headers: { Authorization: `Bearer ${token}` },
    })
    return { status: res.status, body: (await res.json()) as Json }
  }

  it("sets targets and reads them back as the ones in force", async () => {
    const res = await post("/targets", "token-a", { id: uuidv7(), macros })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ replaced: false, validFrom: today })

    const read = await getTargets("token-a")
    expect(read.status).toBe(200)
    expect(read.body.current).toMatchObject({ validFrom: today, macros })
  })

  it("updates the same day rather than adding a second row for it", async () => {
    const changed = { ...macros, kcal: 2400 }
    const res = await post("/targets", "token-a", { id: uuidv7(), macros: changed })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ replaced: true })

    const read = await getTargets("token-a")
    expect(read.body.current).toMatchObject({ macros: changed })
    expect((read.body.history as unknown[]).filter(Boolean)).toHaveLength(1)
  })

  it("keeps an earlier day's targets in history when a later day supersedes them", async () => {
    const earlier = addDays(today, -30)
    await post("/targets", "token-a", {
      id: uuidv7(),
      validFrom: earlier,
      macros: { kcal: 2000, protein: 150, carbs: 180, fat: 55 },
    })

    const read = await getTargets("token-a")
    // Today's row is still what is in force; the older one is history, and the
    // engine resolved that, not a `LIMIT 1` on insertion order.
    expect(read.body.current).toMatchObject({ validFrom: today })
    expect(read.body.history).toHaveLength(2)
  })

  it("shows B none of A's targets", async () => {
    const read = await getTargets("token-b")
    expect(read.body.current).toBeNull()
    expect(read.body.history).toEqual([])
  })

  it("refuses targets dated in the future", async () => {
    const res = await post("/targets", "token-a", {
      id: uuidv7(),
      validFrom: addDays(today, 1),
      macros,
    })
    expect(res.status).toBe(400)
  })
})

describe("malformed bodies", () => {
  it("refuses a body that is not JSON", async () => {
    const res = await writes.request("/meal-logs", {
      method: "POST",
      headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
      body: "{not json",
    })
    expect(res.status).toBe(400)
  })

  it("names the field that failed, without echoing the value", async () => {
    const res = await post("/meal-logs", "token-a", meal({ macros: { kcal: -1, protein: 0, carbs: 0, fat: 0 } }))
    expect(res.status).toBe(400)

    const message = String(res.body.message)
    expect(message).toContain("macros.kcal")
    // The value is health data. The shape that was expected is not.
    expect(message).not.toContain("-1")
  })
})
