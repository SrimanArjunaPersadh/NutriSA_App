import { randomUUID } from "node:crypto"

import { inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { currentLoggingDay, searchText, wordSimilarity } from "@engine"

/**
 * Food search against real Postgres (plan.md, branch `food-search`, Q42, Q45).
 *
 * - The phrase table: about 25 things a person types or says, each with the
 *   food it must find, through `GET /foods/search/local`, the same route the
 *   Nutrition box asks first. It runs the database's half (the trigram index,
 *   `LIKE`, `<%`, `nutrisa_unaccent`) and the engine's half together, so a
 *   phrase the engine would accept but the database never fetched fails here.
 * - History ranks: a food the user logged comes first, as their own line.
 * - An all-filler query answers with recent foods.
 * - Q42: a fuzzy match never returns another user's private food. The
 *   trigram clause goes through `selectVisibleFoods`, so B's typo finds the
 *   shared row and never A's.
 *
 * Needs migrations 0005 and 0006 on the `test` branch (`pg_trgm`, `unaccent`,
 * `nutrisa_unaccent`, the index). The first test says so plainly if not.
 */

const ids = vi.hoisted(() => ({ userA: "", userB: "" }))

vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => {
    if (token === "token-a") return { sub: ids.userA }
    if (token === "token-b") return { sub: ids.userB }
    throw new Error("Token verification failed")
  },
}))

vi.mock("../../server/food/off", () => ({
  searchOff: async () => ({ status: "ok", foods: [] }),
  lookupOff: async () => ({ status: "ok", food: null }),
}))

let foodRoutes: Awaited<typeof import("../../server/routes/foods")>["foodRoutes"]
let db: Awaited<typeof import("../../server/db")>["db"]
let schema: Awaited<typeof import("../../server/db")>["schema"]
let withRetry: Awaited<typeof import("../../server/db/retry")>["withRetry"]

function setup<T>(label: string, run: () => Promise<T>): Promise<T> {
  return withRetry(`fixture ${label}`, run)
}

type Found = { id: string | null; name: string; origin: string }

async function search(query: string, token: string): Promise<Found[]> {
  const res = await foodRoutes.request(`/foods/search/local?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status).toBe(200)
  return ((await res.json()) as { foods: Found[] }).foods
}

/** A's own foods: private, so B must never see one. */
const FOODS = {
  whey: "USN Hardcore Whey",
  sourdough: "Sourdough bread",
  egg: "Large egg",
  creme: "Crème fraîche",
  chicken: "Chicken breast, cooked",
  oats: "Jungle Oats",
  rice: "Cooked white rice",
  milk: "Full cream milk",
  peanut: "Peanut butter, smooth",
  banana: "Banana",
  yoghurt: "Greek yoghurt, plain",
  tomato: "Tomatoes, canned",
  broccoli: "Broccoli, steamed",
  biltong: "Beef biltong",
  rooibos: "Rooibos tea",
  isolate: "Whey isolate",
} as const
type Key = keyof typeof FOODS
const foodIds = Object.fromEntries(Object.keys(FOODS).map((key) => [key, randomUUID()])) as Record<Key, string>

/** A shared row with the same words as A's whey: what B's typo may find. */
const sharedWheyId = randomUUID()

const PHRASES: [string, Key][] = [
  ["a scoop of whey protein", "whey"],
  ["usn", "whey"],
  ["hardcor whey", "whey"],
  ["whey hardcore", "whey"],
  ["Hardcore", "whey"],
  ["WHEY", "whey"],
  ["sourdough toast", "sourdough"],
  ["sourdogh bread", "sourdough"],
  // Typos alone, with no correct word beside them to carry the match.
  ["sourdogh", "sourdough"],
  ["buter", "peanut"],
  ["2 eggs", "egg"],
  ["an egg", "egg"],
  ["creme fraiche", "creme"],
  ["crème fraîche", "creme"],
  ["200g chicken breast", "chicken"],
  ["chicken", "chicken"],
  ["jungle oats", "oats"],
  ["oats", "oats"],
  ["a cup of rice", "rice"],
  ["250ml milk", "milk"],
  ["peanut butter", "peanut"],
  ["2 tablespoons of peanut butter", "peanut"],
  ["bananas", "banana"],
  ["greek yogurt", "yoghurt"],
  ["tomatoes", "tomato"],
  ["brocoli", "broccoli"],
  ["biltong", "biltong"],
  ["rooibos", "rooibos"],
]

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is not set. See vitest.security.config.mts.")
  }

  ids.userA = `user_sectest_sa_${randomUUID().replace(/-/g, "")}`
  ids.userB = `user_sectest_sb_${randomUUID().replace(/-/g, "")}`

  const dbModule = await import("../../server/db")
  db = dbModule.db
  schema = dbModule.schema
  withRetry = (await import("../../server/db/retry")).withRetry
  foodRoutes = (await import("../../server/routes/foods")).foodRoutes

  await setup("users", () =>
    db.insert(schema.users).values([
      { clerkId: ids.userA, email: "sa@sectest.invalid" },
      { clerkId: ids.userB, email: "sb@sectest.invalid" },
    ]),
  )

  const per100 = { kcal: 100, pro: 10, carb: 10, fat: 1 }
  await setup("A's foods", () =>
    db.insert(schema.foods).values([
      ...(Object.keys(FOODS) as Key[]).map((key) => ({
        id: foodIds[key],
        userId: ids.userA,
        name: FOODS[key],
        unit: "g",
        defaultQty: 100,
        per100,
        source: "manual" as const,
      })),
      { id: sharedWheyId, userId: null, name: "Shared hardcore whey", unit: "g", defaultQty: 30, per100, source: "seed" as const },
    ]),
  )

  // A logged the isolate today, twice in one meal: one meal, so once.
  const line = { name: FOODS.isolate, qty: "30 g", kcal: 114, pro: 27, carb: 1, fat: 0, portion: { quantity: 30, unit: "g", per: { kcal: 380, pro: 90, carb: 3, fat: 1 } } }
  await setup("A's meal", () =>
    db.insert(schema.mealLogs).values({
      id: randomUUID(),
      userId: ids.userA,
      date: currentLoggingDay(),
      name: "Snack",
      kcal: 228,
      pro: 54,
      carb: 2,
      fat: 0,
      items: [line, line],
    }),
  )
})

afterAll(async () => {
  if (!db || !withRetry) return
  await setup("shared cleanup", () => db.delete(schema.foods).where(inArray(schema.foods.id, [sharedWheyId])))
  await setup("users cleanup", () =>
    db.delete(schema.users).where(inArray(schema.users.clerkId, [ids.userA, ids.userB])),
  )
})

describe("the database has what search needs", () => {
  it("has pg_trgm, unaccent and the immutable wrapper (migrations 0005, 0006)", async () => {
    const rows = await setup("extensions", () =>
      db.execute<{ name: string; index: string | null }>(sql`
        select nutrisa_unaccent('Crème fraîche') as name,
               (select indexname from pg_indexes where indexname = 'foods_name_trgm_idx') as index
      `),
    )
    expect(rows.rows[0]).toEqual({ name: "Creme fraiche", index: "foods_name_trgm_idx" })
  })
})

describe("the engine scores a typo as Postgres does", () => {
  // Each pair: a query word, a name. 0.6 is the line (FUZZY_WORD_THRESHOLD).
  const PAIRS: [string, string][] = [
    ["word", "two words"],
    ["chiken", "Chicken breast, cooked"],
    ["sourdogh", "Sourdough bread"],
    ["brocoli", "Broccoli, steamed"],
    ["yogurt", "Greek yoghurt, plain"],
    ["hardcroe", "USN Hardcore Whey"],
    ["wey", "USN Hardcore Whey"],
    ["hey", "USN Hardcore Whey"],
    ["core", "USN Hardcore Whey"],
    ["rice", "Price's mixed nuts"],
    ["banana", "Bananas and bananas"],
    ["creme", "Crème fraîche"],
  ]

  it.each(PAIRS)("word_similarity(%s, %s)", async (word, name) => {
    const rows = await setup("similarity", () =>
      db.execute<{ score: number }>(
        sql`select word_similarity(${searchText(word)}, nutrisa_unaccent(lower(${name})))::float8 as score`,
      ),
    )
    expect(wordSimilarity(word, name)).toBeCloseTo(Number(rows.rows[0]!.score), 5)
  })
})

describe("the phrase table (Q45)", () => {
  it.each(PHRASES)("%s finds %s near the top", async (phrase, key) => {
    const found = await search(phrase, "token-a")
    // Third at worst: the whey phrases put A's logged isolate first, and a
    // shared row may sit beside A's own.
    expect(found.slice(0, 3).map((food) => food.id ?? food.name)).toContain(food(key))
  })

  it("finds the whey first for the phrase that missed on the iPhone", async () => {
    const found = await search("a scoop of whey protein", "token-a")
    // The isolate matches "whey" too and was logged, so it leads; then the USN.
    expect(found.slice(0, 2).map((food) => food.name)).toEqual([FOODS.isolate, FOODS.whey])
  })

  it("finds nothing for a food nobody has", async () => {
    // Not "dragonfruit smoothie": "smoothie" is a trigram typo of the peanut
    // butter's "smooth" (0.67), and both halves agree it matches.
    expect((await search("a dragonfruit", "token-a")).map((food) => food.name)).toEqual([])
  })
})

describe("history and filler", () => {
  it("puts a logged food first, as the user's own line with last time's serving", async () => {
    const [first] = await search("whey", "token-a")
    expect(first).toMatchObject({ name: FOODS.isolate, origin: "recent", id: null })
  })

  it("answers an all-filler query with recent foods", async () => {
    const found = await search("a scoop of", "token-a")
    expect(found.map((food) => food.name)).toEqual([FOODS.isolate])
  })
})

describe("a fuzzy match never returns another user's private food (Q42)", () => {
  it.each(["hardcor whey", "whey hardcore", "usn", "brocoli", "sourdogh bread", "greek yogurt"])(
    "B's %s returns none of A's foods",
    async (phrase) => {
      const found = await search(phrase, "token-b")
      const mine = new Set(Object.values(foodIds))
      expect(found.filter((food) => food.id !== null && mine.has(food.id))).toEqual([])
      expect(found.some((food) => food.name === FOODS.isolate)).toBe(false)
    },
  )

  it("while B's typo still finds the shared row", async () => {
    const found = await search("hardcor whey", "token-b")
    expect(found.map((food) => food.id)).toContain(sharedWheyId)
  })
})

/** What a phrase must find: the row's id, or the name for A's logged line. */
function food(key: Key): string {
  return key === "isolate" ? FOODS.isolate : foodIds[key]
}
