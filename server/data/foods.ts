import { randomUUID } from "node:crypto"

import { and, asc, desc, eq, ilike, sql } from "drizzle-orm"

import type { MealSlot } from "@engine"
import type { BarcodeLookup, Food, FoodSearch, FoodWriteResult, RecentFoods, WriteFood } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { foods, mealLogs } from "../db/schema"
import { lookupOff, searchOff } from "../food/off"
import { foodFromRow, likePattern, recentFoodsFromMeals, rowValuesFromFood } from "../food/rows"
import {
  insertOwned,
  insertSharedFood,
  selectOwned,
  selectVisibleFoods,
  type WriteOutcome,
} from "./scoped"

/**
 * The food logger's data: search, recent foods, barcode lookup, and a food of
 * the user's own.
 *
 * Search and lookup both go **local first**. The user's own foods and every
 * product anyone has already resolved are in `foods`, and a hit there is a
 * single indexed query instead of a round trip to a third party with a
 * per-minute budget. plan.md, Phase 7: "Local `foods` lookup by barcode
 * **first** — cached hit never touches the network."
 */

/** How many local matches a search returns. The list is a phone screen. */
const LOCAL_SEARCH_LIMIT = 25

/** OFF is asked from three characters. "ch" matches half the database. */
const OFF_MIN_QUERY_CHARS = 3

/** Recent foods: enough meals to find variety, few enough to stay cheap. */
const RECENT_MEALS_SCANNED = 60
const RECENT_FOODS_LIMIT = 20

/** "Your foods" at the top of a search: MyNetDiary shows five, and so do we. */
const RECENT_MATCH_LIMIT = 5

/**
 * The user's own rows before the shared ones, then by name. A food someone
 * typed in themselves is the one they meant.
 */
const OWN_FIRST = [asc(sql`${foods.userId} is null`), asc(foods.name)]

function mapRows(rows: (typeof foods.$inferSelect)[]): Food[] {
  return rows.map(foodFromRow).filter((food): food is Food => food !== null)
}

/**
 * `GET /foods/search` — what you have logged before, then local matches, then
 * Open Food Facts.
 *
 * **Your own logged foods lead**, up to five, with last time's serving: the
 * pattern that puts MyNetDiary second in the logging-speed ranking
 * (`research designs/mynetdiary/notes.md`). A local row with the same name as
 * one of them is dropped, because the logged line already carries the serving
 * the user actually eats.
 *
 * Then local rows, then OFF, with any OFF product whose barcode is already a
 * local row dropped: the cached row is the same product, already resolved, and
 * listing it twice would offer two identical rows that differ only in which one
 * writes a cache entry.
 */
export async function searchFoods(scope: UserScope, query: string): Promise<FoodSearch> {
  // OFF is the slow half (a third party, 1 to 4 seconds), so it starts at the
  // same moment as the database reads instead of after them.
  const offPending = query.length < OFF_MIN_QUERY_CHARS ? null : searchOff(query)
  const local = await searchLocalFoods(scope, query)
  if (!offPending) return local

  const off = await offPending
  const known = new Set(local.foods.map((food) => food.barcode).filter(Boolean))
  const fresh = off.foods.filter((food) => !food.barcode || !known.has(food.barcode))

  return { query, foods: [...local.foods, ...fresh], off: off.status }
}

/**
 * `GET /foods/search/local` — the fast half of a search: your logged foods and
 * the `foods` table, never Open Food Facts.
 *
 * Search felt slow on the iPhone (2026-10-20) because nothing showed until OFF
 * answered. The logger now asks for this and the full search together, draws
 * this the moment it lands (a few hundred milliseconds), and fills OFF in under
 * it when that arrives. Same order and same de-duplication as `searchFoods`,
 * which is built on it.
 */
export async function searchLocalFoods(scope: UserScope, query: string): Promise<FoodSearch> {
  const [meals, rows] = await Promise.all([
    selectOwned(scope, mealLogs, {
      orderBy: [desc(mealLogs.date), desc(mealLogs.createdAt)],
      limit: RECENT_MEALS_SCANNED,
    }),
    selectVisibleFoods(scope, {
      where: ilike(foods.name, likePattern(query)),
      orderBy: OWN_FIRST,
      limit: LOCAL_SEARCH_LIMIT,
    }),
  ])

  const yours = recentFoodsFromMeals(meals, RECENT_MATCH_LIMIT, { query })
  const yourNames = new Set(yours.map((food) => food.name.toLowerCase()))
  const local = mapRows(rows).filter((food) => !yourNames.has(food.name.toLowerCase()))

  return { query, foods: [...yours, ...local], off: "skipped" }
}

/**
 * `GET /foods/recent?slot=` — what this user has logged lately, one line per
 * food, with last time's serving. What the search box shows before anything is
 * typed: "Usually at breakfast" when the logger is filling breakfast, which is
 * what `slot` ranks by (see `recentFoodsFromMeals`).
 */
export async function recentFoods(scope: UserScope, slot?: MealSlot): Promise<RecentFoods> {
  const meals = await selectOwned(scope, mealLogs, {
    orderBy: [desc(mealLogs.date), desc(mealLogs.createdAt)],
    limit: RECENT_MEALS_SCANNED,
  })

  return { foods: recentFoodsFromMeals(meals, RECENT_FOODS_LIMIT, slot ? { slot } : {}) }
}

/**
 * `GET /foods/barcode/:code` — local row, else Open Food Facts, cached.
 *
 * A product resolved from OFF is written as a global row before it is
 * returned, so the next scan of the same packet — by anyone — is answered
 * locally. If that write fails the product is still returned: the user is
 * holding the packet and the macros are in hand, and failing their log because
 * a cache write did not land would be the wrong priority. The next scan simply
 * asks OFF again.
 */
export async function lookupBarcode(scope: UserScope, barcode: string): Promise<BarcodeLookup> {
  const local = mapRows(
    await selectVisibleFoods(scope, {
      where: eq(foods.barcode, barcode),
      orderBy: OWN_FIRST,
      limit: 1,
    }),
  )
  if (local[0]) return { barcode, food: local[0], off: "ok" }

  const off = await lookupOff(barcode)
  if (!off.food) return { barcode, food: null, off: off.status }

  try {
    const inserted = await insertSharedFood(scope, {
      id: randomUUID(),
      ...rowValuesFromFood(off.food),
      source: "off",
    })
    const row = inserted[0]
      ? inserted
      : // Somebody else cached it between our read and our write. Theirs stands.
        await selectVisibleFoods(scope, {
          where: and(eq(foods.barcode, barcode), sql`${foods.userId} is null`),
          limit: 1,
        })
    const cached = mapRows(row)[0]
    // The row has no image column; carry this lookup's photo on the answer.
    if (cached) return { barcode, food: { ...cached, imageUrl: off.food.imageUrl }, off: "ok" }
  } catch (error) {
    console.warn(
      `Caching OFF product failed: ${error instanceof Error ? error.name : "unknown"}`,
    )
  }

  return { barcode, food: off.food, off: "ok" }
}

/**
 * `POST /foods` — a food of the user's own, `source='manual'`.
 *
 * Idempotent on the client-minted id, like every other create: a retry carrying
 * the same id finds its own row and answers `created: false`.
 *
 * A barcode the user already has a food for answers with that food rather than
 * a second one. `foods_user_barcode_key` would refuse the insert anyway — with
 * a unique violation, which is a 500 for what is really "you already made
 * this". Checked first so the answer is the useful one.
 */
export async function createFood(
  scope: UserScope,
  input: WriteFood,
): Promise<WriteOutcome<FoodWriteResult>> {
  if (input.barcode) {
    const existing = mapRows(
      await selectOwned(scope, foods, { where: eq(foods.barcode, input.barcode), limit: 1 }),
    )
    if (existing[0]) return { ok: true, value: { food: existing[0], created: false } }
  }

  const perHundred = input.unit === "g" || input.unit === "ml"
  const values = rowValuesFromFood({
    name: input.name,
    brand: null,
    barcode: input.barcode ?? null,
    unit: input.unit,
    per: input.per,
    serving: { quantity: input.servingQuantity ?? (perHundred ? 100 : 1), label: null },
  })

  const inserted = await insertOwned(scope, foods, { id: input.id, ...values, source: "manual" })
  if (inserted[0]) {
    const food = foodFromRow(inserted[0])
    if (food) return { ok: true, value: { food, created: true } }
  }

  // Nothing inserted: either this is a retry of our own write, or the id is
  // somebody else's. Only the ownership-filtered read can tell which.
  const own = mapRows(await selectOwned(scope, foods, { where: eq(foods.id, input.id), limit: 1 }))
  if (own[0]) return { ok: true, value: { food: own[0], created: false } }

  return { ok: false, reason: "id-taken" }
}
