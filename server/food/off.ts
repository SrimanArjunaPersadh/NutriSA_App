import type { Food, OffStatus } from "@shared"

import { env } from "../env"
import { foodFromOff } from "./rows"

/**
 * Open Food Facts, from the server only.
 *
 * The phone never talks to OFF directly. Every hit is cached as a global row
 * (plan.md, Phase 7: "Cache every OFF hit permanently"), and the cache is in
 * Neon, so the request has to pass through the server anyway — and OFF's rate
 * limits are per IP, which on a phone would be per user and here is one shared
 * budget this module can actually manage.
 *
 * ## Two APIs
 *
 * - **Search** goes to search-a-licious (`search.openfoodfacts.org`), OFF's
 *   Elasticsearch service. It takes a country filter in the query string, so
 *   results are restricted to products sold in South Africa, and it answered in
 *   single-digit milliseconds when probed on 2026-10-19.
 * - **Barcode** goes to the v2 product API on `world.openfoodfacts.org`.
 *
 * ## The budget
 *
 * OFF's published limits: 10 searches and 15 product reads per minute per IP.
 * Fixed windows here, in-process, conservative. A search over budget is not an
 * error — the route still answers with the user's own and the shared foods and
 * says `rate-limited` — because "no OFF this minute" must not read as "no food".
 *
 * ## Degrade, don't hang
 *
 * plan.md: "OFF timeout / outage handled — degrade to manual, don't hang". Hard
 * timeouts below, and every failure is a status, never a throw: the caller has
 * local results to return regardless.
 *
 * ## What is never logged
 *
 * The search text. It is what someone ate, and nothing about OFF's availability
 * needs it. Status codes only.
 */

const SEARCH_URL = "https://search.openfoodfacts.org/search"
const PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product"

/** The fields `foodFromOff` reads, and nothing else. A full product is ~50 KB. */
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "product_quantity_unit",
  "image_front_url",
  "image_front_small_url",
].join(",")

/**
 * Search waits less than a barcode lookup. A search is typed, and a slow one is
 * replaced by the next keystroke's; a scan is one deliberate action somebody is
 * standing still for.
 */
const SEARCH_TIMEOUT_MS = 4_000
const PRODUCT_TIMEOUT_MS = 6_000

const SEARCH_PAGE_SIZE = 20

const WINDOW_MS = 60_000
const SEARCHES_PER_WINDOW = 10
const PRODUCTS_PER_WINDOW = 15

/**
 * OFF asks every client to identify itself as `AppName/Version (contact)`.
 * Configurable because the contact belongs to whoever deploys this, and it is
 * not something to hard-code into a repo.
 */
const USER_AGENT = env.OFF_USER_AGENT

type Budget = { startedAt: number; used: number }

const budgets = {
  search: { startedAt: 0, used: 0 } as Budget,
  product: { startedAt: 0, used: 0 } as Budget,
}

function spend(kind: keyof typeof budgets, limit: number, now: number): boolean {
  const budget = budgets[kind]
  if (now - budget.startedAt >= WINDOW_MS) {
    budget.startedAt = now
    budget.used = 0
  }
  if (budget.used >= limit) return false
  budget.used += 1
  return true
}

/**
 * Recent search answers, so retyping or backspacing does not spend budget.
 *
 * Small and short-lived: OFF changes slowly, but a product someone just added
 * to OFF should show up within minutes, and the map must not grow without
 * bound. A `Map` iterates in insertion order, so the first key is the oldest.
 */
const SEARCH_CACHE_TTL_MS = 10 * 60_000
const SEARCH_CACHE_MAX = 200
const searchCache = new Map<string, { at: number; foods: Food[] }>()

export type OffSearch = { status: OffStatus; foods: Food[] }
export type OffLookup = { status: OffStatus; food: Food | null }

/**
 * Products sold in South Africa matching `query`, parsed and filtered to the
 * ones `foodFromOff` will accept.
 */
export async function searchOff(query: string): Promise<OffSearch> {
  const key = query.trim().toLowerCase()
  const now = Date.now()

  const cached = searchCache.get(key)
  if (cached && now - cached.at < SEARCH_CACHE_TTL_MS) {
    return { status: "ok", foods: cached.foods }
  }

  if (!spend("search", SEARCHES_PER_WINDOW, now)) {
    return { status: "rate-limited", foods: [] }
  }

  const params = new URLSearchParams({
    // search-a-licious takes Lucene-style filters inside `q`. The phrase is
    // the user's; the filter is ours, and it is appended after a space so a
    // query cannot close a quote and escape it into the filter.
    q: `${query.replace(/"/g, " ")} countries_tags:"en:south-africa"`,
    page_size: String(SEARCH_PAGE_SIZE),
    fields: FIELDS,
  })

  const body = await fetchJson(`${SEARCH_URL}?${params}`, SEARCH_TIMEOUT_MS)
  if (!body.ok) return { status: body.status, foods: [] }

  const hits = (body.json as { hits?: unknown }).hits
  const foods = Array.isArray(hits)
    ? hits.map(foodFromOff).filter((food): food is Food => food !== null)
    : []

  if (searchCache.size >= SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value
    if (oldest !== undefined) searchCache.delete(oldest)
  }
  searchCache.set(key, { at: now, foods })

  return { status: "ok", foods }
}

/**
 * One product by barcode.
 *
 * `{ status: "ok", food: null }` covers two cases the caller treats the same
 * way: OFF has never heard of the barcode, and OFF has it without the four
 * numbers `foodFromOff` insists on. Either way the scanner offers to create it.
 */
export async function lookupOff(barcode: string): Promise<OffLookup> {
  if (!spend("product", PRODUCTS_PER_WINDOW, Date.now())) {
    return { status: "rate-limited", food: null }
  }

  const body = await fetchJson(
    `${PRODUCT_URL}/${encodeURIComponent(barcode)}?fields=${FIELDS}`,
    PRODUCT_TIMEOUT_MS,
    // The product API answers an unknown barcode with a 404 and a JSON body
    // that says so. That is an answer, not an outage.
    [404],
  )
  if (!body.ok) return { status: body.status, food: null }

  const product = (body.json as { product?: unknown }).product
  return { status: "ok", food: product ? foodFromOff(product) : null }
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  acceptStatuses: readonly number[] = [],
): Promise<{ ok: true; json: unknown } | { ok: false; status: "unavailable" | "rate-limited" }> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (cause) {
    const reason = cause instanceof Error ? cause.name : "unknown"
    console.warn(`Open Food Facts unreachable (${reason})`)
    return { ok: false, status: "unavailable" }
  }

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    console.warn(`Open Food Facts answered ${response.status}`)
    return { ok: false, status: response.status === 429 ? "rate-limited" : "unavailable" }
  }

  try {
    return { ok: true, json: await response.json() }
  } catch {
    console.warn("Open Food Facts sent a body that is not JSON")
    return { ok: false, status: "unavailable" }
  }
}
