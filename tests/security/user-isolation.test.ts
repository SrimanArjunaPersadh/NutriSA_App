import { randomUUID } from "node:crypto"

import { inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The two security tests that gate `api-scope-and-reads`.
 *
 * plan.md:
 *
 * > ### Security tests (Neon branch, real Postgres — not mocks)
 * > - User A cannot read or write user B's rows
 * > - Unauthenticated request to a protected route is refused
 *
 * ## What is real here and what is not
 *
 * **Real:** Postgres, the schema, the rows, the Drizzle queries, the scoped
 * query layer, the `UserScope` brand, the Hono routes, the engine, and the
 * middleware's decision to allow or refuse a request.
 *
 * **Mocked:** exactly one function — Clerk's `verifyToken`. Minting a genuine
 * Clerk session token would need a live sign-in against a hosted instance, and
 * that would make this suite depend on Clerk being up to tell us whether *our*
 * query layer leaks. The mock stands in for "Clerk said this token belongs to
 * user X" and nothing else; every line after that point is the real thing.
 *
 * The subtlety this buys: because the mock returns a subject and the real
 * middleware turns it into a real `UserScope`, the test cannot cheat by
 * constructing a scope. It could not anyway — the brand symbol in
 * `server/auth/user-scope.ts` is module-private — and that is exactly why the
 * test has to come in through the front door, which is also how an attacker
 * would.
 *
 * ## The table it is really testing
 *
 * Not `weight_logs` specifically. The claim is about `selectOwned`, which every
 * user-scoped read in the app goes through, so a leak found here would be a
 * leak in all of them at once. The reads are checked table by table anyway,
 * because "the helper is correct" and "every caller used the helper" are two
 * different statements and only the second one is about this branch.
 */

const ids = vi.hoisted(() => ({
  userA: "",
  userB: "",
}))

/**
 * `Bearer token-a` means "Clerk verified this as user A". Anything else is
 * rejected the way a real expired or forged token would be — by throwing, which
 * is what `verifyToken` does and what `requireUser` catches.
 */
vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => {
    if (token === "token-a") return { sub: ids.userA }
    if (token === "token-b") return { sub: ids.userB }
    throw new Error("Token verification failed")
  },
}))

const DAY = "2026-08-14"
const EARLIER = "2026-08-13"

/** Populated in `beforeAll` — see the note there on why these are dynamic. */
let app: Awaited<typeof import("../../server/routes/reads")>["reads"]
let db: Awaited<typeof import("../../server/db")>["db"]
let schema: Awaited<typeof import("../../server/db")>["schema"]
let withRetry: Awaited<typeof import("../../server/db/retry")>["withRetry"]

/**
 * Fixture writes go through the same retry the query layer uses.
 *
 * Learned the hard way on the first real run: `beforeAll` inserted the `users`
 * rows, then died on `weight_logs` with a 10s connect timeout, and all twelve
 * tests were skipped without one assertion running. A Neon branch is a fresh
 * compute that has never been woken, so it is *more* likely to stall here than
 * the main database, not less.
 *
 * The routes under test are already covered — `selectOwned` retries internally.
 * It was only the scaffolding that was unprotected, which is the worst place
 * for it: a flaky setup makes a security suite look unreliable, and an
 * unreliable security suite is one people start skipping.
 */
function setup<T>(label: string, run: () => Promise<T>): Promise<T> {
  return withRetry(`fixture ${label}`, run)
}

async function get(path: string, token?: string) {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  const res = await app.request(path, headers ? { headers } : undefined)
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set. These tests write and delete rows, so they need a " +
        "Neon branch of their own — never the main database. Create one in the Neon " +
        "console and add its pooled connection string to .env as TEST_DATABASE_URL. " +
        "See vitest.security.config.mts.",
    )
  }

  ids.userA = `user_sectest_a_${randomUUID().replace(/-/g, "")}`
  ids.userB = `user_sectest_b_${randomUUID().replace(/-/g, "")}`

  /**
   * Imported dynamically, after the ids exist and after the env check.
   *
   * `server/db` opens its connection from `DATABASE_URL` at module load, and a
   * static import would be hoisted above the check above — turning a missing
   * `TEST_DATABASE_URL` into a "Missing DATABASE_URL" thrown from a file nobody
   * was looking at, instead of the message that says what to do about it.
   */
  const dbModule = await import("../../server/db")
  db = dbModule.db
  schema = dbModule.schema
  withRetry = (await import("../../server/db/retry")).withRetry
  app = (await import("../../server/routes/reads")).reads

  await setup("users", () =>
    db.insert(schema.users).values([
      { clerkId: ids.userA, email: "a@sectest.invalid" },
      { clerkId: ids.userB, email: "b@sectest.invalid" },
    ]),
  )

  await setup("weight_logs", () =>
    db.insert(schema.weightLogs).values([
      { id: randomUUID(), userId: ids.userA, date: EARLIER, weight: 100 },
      { id: randomUUID(), userId: ids.userA, date: DAY, weight: 100 },
      // Wildly different, so a leak shows up as an absurd number rather than as
      // a plausible one nobody questions.
      { id: randomUUID(), userId: ids.userB, date: DAY, weight: 50 },
    ]),
  )

  const items = [{ name: "Test item", qty: "1", kcal: 0, pro: 0, carb: 0, fat: 0 }]

  await setup("meal_logs", () =>
    db.insert(schema.mealLogs).values([
      {
        id: randomUUID(),
        userId: ids.userA,
        date: DAY,
        name: "A's meal",
        kcal: 500,
        pro: 40,
        carb: 50,
        fat: 10,
        items,
      },
      {
        id: randomUUID(),
        userId: ids.userB,
        date: DAY,
        name: "B's meal",
        kcal: 999,
        pro: 99,
        carb: 99,
        fat: 99,
        items,
      },
    ]),
  )

  await setup("targets", () =>
    db.insert(schema.targets).values([
      {
        id: randomUUID(),
        userId: ids.userA,
        validFrom: EARLIER,
        kcal: 2300,
        pro: 167,
        carb: 195,
        fat: 60,
      },
      {
        id: randomUUID(),
        userId: ids.userB,
        validFrom: EARLIER,
        kcal: 1200,
        pro: 80,
        carb: 100,
        fat: 30,
      },
    ]),
  )

  // A only. B has no profile, so B's goal weight must come back null rather
  // than 85 — a leak through a table the day route does not even touch.
  await setup("profiles", () =>
    db.insert(schema.profiles).values({
      id: randomUUID(),
      userId: ids.userA,
      goalWeightKg: 85,
    }),
  )
})

afterAll(async () => {
  if (!db || !withRetry) return
  /**
   * One delete per user. Every user-scoped table cascades from `users`, which
   * is the Phase 11 guarantee — so this also quietly exercises it.
   *
   * Retried for a reason the setup does not share: a failed cleanup leaves
   * rows behind on the branch, and the *next* run then starts against a
   * database that is not what the tests assume. Failing to tidy up is worse
   * than failing to set up.
   */
  await setup("cleanup", () =>
    db.delete(schema.users).where(inArray(schema.users.clerkId, [ids.userA, ids.userB])),
  )
})

describe("an unauthenticated request to a protected route is refused", () => {
  it("refuses GET /day/:date with no Authorization header", async () => {
    const res = await get(`/day/${DAY}`)
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: "unauthenticated" })
  })

  it("refuses GET /weight-logs with no Authorization header", async () => {
    const res = await get("/weight-logs")
    expect(res.status).toBe(401)
  })

  it("refuses a token that does not verify", async () => {
    expect((await get(`/day/${DAY}`, "forged-token")).status).toBe(401)
  })

  it("refuses a bearer header with an empty token", async () => {
    const res = await app.request(`/day/${DAY}`, { headers: { Authorization: "Bearer " } })
    expect(res.status).toBe(401)
  })

  it("refuses a non-bearer scheme", async () => {
    const res = await app.request(`/day/${DAY}`, {
      headers: { Authorization: `Basic ${ids.userA}` },
    })
    expect(res.status).toBe(401)
  })

  /**
   * The attack the scope layer exists to stop, stated directly: naming another
   * user in the request must not change whose data comes back. There is no code
   * that reads any of these, which is the point — this proves the absence.
   */
  it("ignores a user id supplied in the query string or a header", async () => {
    const res = await app.request(`/day/${DAY}?user_id=${ids.userB}&userId=${ids.userB}`, {
      headers: { Authorization: "Bearer token-a", "x-user-id": ids.userB },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { consumed: { kcal: number }; targets: { kcal: number } }
    expect(body.consumed.kcal).toBe(500)
    expect(body.targets.kcal).toBe(2300)
  })
})

describe("user A cannot read user B's rows", () => {
  it("returns only A's meals from GET /day/:date", async () => {
    const { status, body } = await get(`/day/${DAY}`, "token-a")
    expect(status).toBe(200)

    const day = body as {
      meals: { name: string }[]
      consumed: { kcal: number }
      targets: { kcal: number }
    }

    expect(day.meals.map((meal) => meal.name)).toEqual(["A's meal"])
    // 500, not 999 (B's meal instead of A's) and not 1499 (both).
    expect(day.consumed.kcal).toBe(500)
    expect(day.targets.kcal).toBe(2300)
  })

  /**
   * The streak and the logged-day list are derived from a *different* query
   * than the meals — `selectOwnedDays`, which builds its own `WHERE` rather
   * than going through `selectOwned`. So they are a second place the ownership
   * filter has to be right, and a leak here would be invisible in the meal
   * assertions above: the day view would look correct while the header counted
   * somebody else's discipline.
   */
  it("counts only A's own logged days in the streak", async () => {
    const { body } = await get(`/day/${DAY}`, "token-a")
    const day = body as { streak: { days: number }; loggedDays: string[] }

    // A has exactly one logged day, on DAY. B has one on the same date, so a
    // leak would not change the day count — it would show up as a duplicate in
    // the list, which is why both are asserted.
    expect(day.loggedDays).toEqual([DAY])
    expect(day.streak.days).toBeLessThanOrEqual(1)
  })

  it("returns only B's meals from the same route for B", async () => {
    const { body } = await get(`/day/${DAY}`, "token-b")
    const day = body as { meals: { name: string }[]; consumed: { kcal: number }; targets: { kcal: number } }

    expect(day.meals.map((meal) => meal.name)).toEqual(["B's meal"])
    expect(day.consumed.kcal).toBe(999)
    expect(day.targets.kcal).toBe(1200)
  })

  it("returns only A's weigh-ins from GET /weight-logs", async () => {
    const { status, body } = await get("/weight-logs", "token-a")
    expect(status).toBe(200)

    const series = body as {
      points: { weight: number | null }[]
      latest: { trend: number }
      goalWeightKg: number | null
    }

    const weights = series.points.map((point) => point.weight).filter((w) => w !== null)
    expect(weights).toEqual([100, 100])
    expect(weights).not.toContain(50)
    expect(series.latest.trend).toBe(100)
    expect(series.goalWeightKg).toBe(85)
  })

  it("returns only B's weigh-ins, and B's absent goal weight", async () => {
    const { body } = await get("/weight-logs", "token-b")
    const series = body as {
      points: { weight: number | null }[]
      latest: { trend: number }
      goalWeightKg: number | null
    }

    expect(series.points.map((point) => point.weight)).toEqual([50])
    expect(series.latest.trend).toBe(50)
    // B has no profiles row. Absent, not A's 85 and not a 0 that would draw a
    // goal line along the bottom of B's chart.
    expect(series.goalWeightKg).toBeNull()
  })

  it("shows a user with no data an empty series rather than someone else's", async () => {
    const emptyUser = `user_sectest_c_${randomUUID().replace(/-/g, "")}`
    await setup("empty user", () =>
      db.insert(schema.users).values({ clerkId: emptyUser, email: "c@sectest.invalid" }),
    )

    const previous = ids.userB
    ids.userB = emptyUser
    try {
      const { body } = await get("/weight-logs", "token-b")
      const series = body as { points: unknown[]; latest: unknown; goal: unknown }
      expect(series.points).toEqual([])
      expect(series.latest).toBeNull()
      expect(series.goal).toBeNull()

      const day = (await get(`/day/${DAY}`, "token-b")).body as {
        meals: unknown[]
        consumed: { kcal: number }
        targets: unknown
        remaining: unknown
        streak: { days: number; lit: boolean }
        loggedDays: unknown[]
      }
      expect(day.meals).toEqual([])
      // A genuine zero — nothing logged. Distinct from `targets`, which is null
      // because this user has never set any.
      expect(day.consumed.kcal).toBe(0)
      expect(day.targets).toBeNull()
      expect(day.remaining).toBeNull()
      expect(day.loggedDays).toEqual([])
      expect(day.streak).toEqual({ days: 0, lit: false })
    } finally {
      ids.userB = previous
      await setup("empty user cleanup", () =>
        db.delete(schema.users).where(inArray(schema.users.clerkId, [emptyUser])),
      )
    }
  })
})
