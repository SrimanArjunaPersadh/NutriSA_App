import { randomUUID } from "node:crypto"

import { and, asc, desc, eq, gte, like, or, sql, type SQL } from "drizzle-orm"

import {
  addDays,
  currentLoggingDay,
  rankSearchCandidates,
  searchWords,
  wordsMatched,
  type MealSlot,
  type SearchCandidate,
} from "@engine"
import type { BarcodeLookup, Food, FoodSearch, FoodWriteResult, RecentFoods, WriteFood } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { foods, mealLogs } from "../db/schema"
import { lookupOff, searchOff } from "../food/off"
import {
  foodFromRow,
  foodHistory,
  foodKey,
  likePattern,
  recentFoodsFromMeals,
  rowValuesFromFood,
  type FoodHistory,
} from "../food/rows"
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

/**
 * Candidates fetched for the engine to rank. More than the list shows, so a
 * row the engine puts first is not cut by the database's rougher order.
 */
const LOCAL_CANDIDATES = 100

/** How far back "the user logs this" counts in search (Q32). */
const HISTORY_DAYS = 90

/** Four meals a day for 90 days, with room. */
const HISTORY_MEALS_SCANNED = 500

/**
 * The user's own rows before the shared ones, then by name. A food someone
 * typed in themselves is the one they meant.
 */
const OWN_FIRST = [asc(sql`${foods.userId} is null`), asc(foods.name)]

function mapRows(rows: (typeof foods.$inferSelect)[]): Food[] {
  return rows.map(foodFromRow).filter((food): food is Food => food !== null)
}

/**
 * `GET /foods/search` — local matches (`searchLocalFoods`), then Open Food
 * Facts, whose search is unchanged by `food-search` (Q35).
 *
 * The user's history lifts what they eat to the top of the local half, with
 * last time's serving: MyNetDiary's "your foods first", the pattern that puts
 * it second in the logging-speed ranking (`research designs/mynetdiary/notes.md`).
 *
 * OFF follows, with any OFF product whose barcode is already a
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
 * it when that arrives. `searchFoods` is built on it.
 *
 * ## Which foods, in what order (`food-search`, Q31, Q32)
 *
 * The query becomes words (`searchWords`: "a scoop of whey protein" is whey,
 * protein). The database fetches candidates through the trigram index: any
 * word inside the name, or a typo away from a word of it. The engine then
 * decides: a food matches when a word starts a word of its name or is a typo
 * away (`wordsMatched`), and `rankSearchCandidates` orders them by words
 * matched, then how often and how lately the user logged it in the last 90
 * days, then theirs over shared over cached OFF, then name.
 *
 * Their logged lines and the `foods` rows are ranked together. A row named
 * like a logged line is dropped for it, because the line carries the serving
 * the user actually eats.
 *
 * A query that is all filler ("a scoop of") has nothing to look for, and
 * answers with the user's recent foods instead.
 */
export async function searchLocalFoods(scope: UserScope, query: string): Promise<FoodSearch> {
  const words = searchWords(query)
  const [meals, rows] = await Promise.all([
    mealsInHistory(scope),
    words.length === 0
      ? Promise.resolve([])
      : selectVisibleFoods(scope, {
          where: nameMatchesAny(words),
          orderBy: [desc(closestWord(words)), ...OWN_FIRST],
          limit: LOCAL_CANDIDATES,
        }),
  ])

  if (words.length === 0) {
    return { query, foods: recentFoodsFromMeals(meals, RECENT_FOODS_LIMIT), off: "skipped" }
  }

  const candidates = searchCandidates(words, foodHistory(meals), rows)
  const found = rankSearchCandidates(candidates.filter((candidate) => candidate.wordsMatched > 0))
  return { query, foods: found.slice(0, LOCAL_SEARCH_LIMIT).map((candidate) => candidate.food), off: "skipped" }
}

/**
 * The foods this user logged most in the last 90 days, most first: what the
 * coach is handed when a search finds nothing (Q33 c), so it can see what
 * "my usual shake" might mean. Same order as search, with no words to match.
 */
export async function mostLoggedFoods(scope: UserScope, limit: number): Promise<Food[]> {
  const candidates = searchCandidates([], foodHistory(await mealsInHistory(scope)), [])
  return rankSearchCandidates(candidates)
    .slice(0, limit)
    .map((candidate) => candidate.food)
}

/** The meals search ranks by: the last 90 days, newest first. */
function mealsInHistory(scope: UserScope) {
  return selectOwned(scope, mealLogs, {
    where: gte(mealLogs.date, addDays(currentLoggingDay(), -HISTORY_DAYS)),
    orderBy: [desc(mealLogs.date), desc(mealLogs.createdAt)],
    limit: HISTORY_MEALS_SCANNED,
  })
}

/**
 * The name as the trigram index holds it. Written exactly as the index in
 * `server/db/schema.ts` is, or the planner falls back to reading every row.
 */
const searchableName = sql`nutrisa_unaccent(lower(${foods.name}))`

/**
 * Any word inside the name (`LIKE`, which the index serves from three
 * letters), or close to a word of it (`<%`, `pg_trgm`'s word similarity at its
 * default 0.6, the engine's `FUZZY_WORD_THRESHOLD`). Looser than the engine's
 * match on purpose: "hey" is inside "whey" but starts no word of it, and the
 * engine drops it. The words are letters and digits only, and still escaped.
 */
function nameMatchesAny(words: readonly string[]): SQL {
  return or(
    ...words.flatMap((word) => [
      like(searchableName, likePattern(word)),
      sql`${word} <% ${searchableName}`,
    ]),
  )!
}

/** The best word similarity of any query word: which candidates to fetch first. */
function closestWord(words: readonly string[]): SQL {
  return sql`greatest(${sql.join(
    words.map((word) => sql`word_similarity(${word}, ${searchableName})`),
    sql`, `,
  )})`
}

type Candidate = SearchCandidate & { food: Food }

/**
 * Logged lines and `foods` rows as the engine ranks them, each with its words
 * matched and its 90-day history. A row whose name was logged with a portion
 * is left out: the logged line stands for it.
 */
function searchCandidates(
  words: readonly string[],
  history: Map<string, FoodHistory>,
  rows: (typeof foods.$inferSelect)[],
): Candidate[] {
  const candidates: Candidate[] = []

  for (const entry of history.values()) {
    if (!entry.food) continue
    candidates.push({
      food: entry.food,
      name: entry.food.name,
      origin: "mine",
      wordsMatched: wordsMatched(words, entry.food.name),
      timesLogged: entry.timesLogged,
      lastLogged: entry.lastLogged,
    })
  }

  for (const row of rows) {
    const food = foodFromRow(row)
    if (!food) continue
    const logged = history.get(foodKey(food.name))
    if (logged?.food) continue
    candidates.push({
      food,
      name: food.name,
      origin: row.userId !== null ? "mine" : row.source === "off" ? "off" : "shared",
      wordsMatched: wordsMatched(words, food.name),
      timesLogged: logged?.timesLogged ?? 0,
      lastLogged: logged?.lastLogged ?? null,
    })
  }

  return candidates
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

  const inserted = await insertOwned(scope, foods, {
    id: input.id,
    ...values,
    source: input.source ?? "manual",
  })
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
