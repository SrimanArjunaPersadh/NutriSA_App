import { z } from "zod"

import { MEAL_SLOTS, PORTION_UNITS } from "@engine"

import { macrosSchema } from "./common"
import { measureSchema } from "./measures"
import { clientIdSchema, MAX_GRAMS, MAX_NAME_CHARS, writeMacrosSchema } from "./writes"

/**
 * The food logger's contracts: search, recent foods, barcode lookup, and
 * creating a food of your own.
 *
 * ## One food shape, whatever it came from
 *
 * A search result can be the user's own `foods` row, a shared global row, an
 * Open Food Facts product nobody has cached yet, or a line they logged last
 * week. The logger does the same thing with all four — show it, take a
 * quantity, put it on the plate — so they travel as one shape, and `origin`
 * says which is which for the one place that cares (the row's subtitle).
 *
 * ## The macros are per *basis*, never absolute
 *
 * `per` is what one basis-worth of `unit` contains: per 100 for `g` and `ml`,
 * per one for the countable units. Exactly the rule `PORTION_BASIS` encodes in
 * the engine, and exactly the shape a meal item's `portion.per` is stored in,
 * so a food goes onto the plate without anything being converted on the way.
 * The engine's `scalePortion` is the only thing that ever multiplies it.
 */

/**
 * A retail barcode: EAN-8, UPC-A, EAN-13 or ITF-14 — digits only, 8 to 14.
 *
 * Checked before it reaches Open Food Facts or a query. The camera hands back
 * whatever it decoded, and a QR code pointed at by accident is a URL, not a
 * product.
 */
export const barcodeSchema = z.string().regex(/^\d{8,14}$/, "Expected a retail barcode")

/** Where a food came from. See the module note. */
export const foodOriginSchema = z.enum([
  /** A `foods` row this user created. */
  "mine",
  /** A global `foods` row (`user_id IS NULL`) — usually a cached OFF product. */
  "shared",
  /** An Open Food Facts search hit that has not been cached as a row yet. */
  "off",
  /** A line from one of this user's own logged meals. Has no `foods` row. */
  "recent",
])

export type FoodOrigin = z.infer<typeof foodOriginSchema>

export const foodSchema = z.object({
  /** The `foods` row, when there is one. `off` and `recent` foods have none. */
  id: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  origin: foodOriginSchema,
  /**
   * The unit `per` is quoted against. A plain string on the read path, for the
   * same reason `mealPortionSchema.unit` is one: a stored unit this build does
   * not recognise must degrade on the client, not fail the whole response.
   */
  unit: z.string(),
  per: macrosSchema,
  /**
   * The quantity the `+` button adds, in `unit`. For an OFF product it is the
   * label's serving ("20 g"); for a recent food it is what was eaten last time,
   * which is the "remembers your usual serving" behaviour that makes repeat
   * logging one tap.
   */
  serving: z.object({
    quantity: z.number(),
    /** The serving as the label prints it, e.g. "1 slice (35 g)". Display only. */
    label: z.string().nullable(),
  }),
  /**
   * The food's natural unit for a g or ml food: "slice" 38 g, "banana" 118 g.
   * Set by the server from the packet's serving or the common-food list
   * (`naturalMeasure`); absent when the food is best counted in grams. When
   * present, `serving.quantity` is a whole number of these, so the `+` adds
   * "1 banana", not 100 g.
   */
  measure: measureSchema.nullish(),
  /**
   * The packet's front photo, from Open Food Facts' own image host — the only
   * source the server passes through. `null` for everything else: own foods,
   * recents, and cached rows, since `foods` has no image column (adding one is
   * a migration, deferred). The client draws a placeholder.
   *
   * Hotlinked, not stored. ImageKit is for images this app stores and serves;
   * these are OFF's, CC BY-SA, and never pass through the server.
   */
  imageUrl: z.string().nullable(),
})

export type Food = z.infer<typeof foodSchema>

/**
 * "KOO Baked Beans in Tomato Sauce" — the brand folded into the name.
 *
 * Here rather than on either side because both need it and must agree: the
 * server writes it as the `foods.name` of a cached OFF product (there is no
 * brand column, and adding one is a migration against a live database for a
 * subtitle), and the client writes it as the name of the meal line. On an SA
 * shelf the brand *is* part of the name people use. Not doubled when the
 * product name already starts with it, which OFF entries often do.
 */
export function foodDisplayName(name: string, brand: string | null): string {
  const trimmed = name.trim()
  const full =
    brand && !trimmed.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${trimmed}` : trimmed
  return full.slice(0, MAX_NAME_CHARS)
}

/**
 * What happened when the server asked Open Food Facts.
 *
 * Reported rather than hidden, because the four mean different things on the
 * screen: `skipped` is a query too short to send, `unavailable` is OFF down or
 * slow, and `rate-limited` is this server's own budget against OFF's
 * per-minute limit. A search that silently drops the OFF half would read as
 * "this product does not exist", which is the wrong conclusion to hand someone
 * holding the packet.
 */
export const offStatusSchema = z.enum(["ok", "skipped", "unavailable", "rate-limited"])

export type OffStatus = z.infer<typeof offStatusSchema>

/** `GET /foods/search?q=` */
export const foodSearchSchema = z.object({
  query: z.string(),
  foods: z.array(foodSchema),
  off: offStatusSchema,
})

export type FoodSearch = z.infer<typeof foodSearchSchema>

/** `GET /foods/recent` — what the empty search box shows. */
export const recentFoodsSchema = z.object({
  foods: z.array(foodSchema),
})

export type RecentFoods = z.infer<typeof recentFoodsSchema>

/**
 * `GET /foods/barcode/:code`
 *
 * `food: null` with `off: "ok"` is a real answer — OFF was asked and does not
 * know this product — and the scanner offers to create it. `food: null` with
 * any other status means nobody could be asked, and the copy says so instead.
 */
export const barcodeLookupSchema = z.object({
  barcode: z.string(),
  food: foodSchema.nullable(),
  off: offStatusSchema,
})

export type BarcodeLookup = z.infer<typeof barcodeLookupSchema>

/** The search box's ceiling. Nothing anyone types for a food is longer. */
export const MAX_FOOD_QUERY_CHARS = 100

export const foodQuerySchema = z.string().trim().min(1).max(MAX_FOOD_QUERY_CHARS)

/**
 * `GET /foods/recent?slot=` — which meal the logger is filling, so the list can
 * lead with what is usually eaten at it. Optional: without it the list is
 * newest first, as before.
 */
export const mealSlotSchema = z.enum(MEAL_SLOTS)

/**
 * `POST /foods` — a food of the user's own, written to `foods` with
 * `source='manual'`.
 *
 * One `unit` and one `per`, and the server decides from the unit whether the
 * row is `per100` or `per_unit`. The table's `foods_one_basis` check demands
 * exactly one of the two; letting the client send both columns would make it
 * possible to send a row the database refuses, and the unit already says which.
 */
export const writeFoodSchema = z.object({
  id: clientIdSchema,
  name: z.string().trim().min(1).max(MAX_NAME_CHARS),
  unit: z.enum(PORTION_UNITS),
  per: writeMacrosSchema,
  /** The default quantity, in `unit`. Absent means 100 for g/ml and 1 otherwise. */
  servingQuantity: z.number().gt(0).max(MAX_GRAMS).nullish(),
  /**
   * Set when the food is being created from a scan OFF could not resolve, so
   * the next scan of the same packet finds it locally.
   */
  barcode: barcodeSchema.nullish(),
})

export type WriteFood = z.infer<typeof writeFoodSchema>

export const foodWriteResultSchema = z.object({
  food: foodSchema,
  created: z.boolean(),
})

export type FoodWriteResult = z.infer<typeof foodWriteResultSchema>
