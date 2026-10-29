import { isPortionUnit, kcalFromKj, normaliseMacros, slotOfMeal, type MealSlot } from "@engine"
import {
  barcodeSchema,
  foodDisplayName,
  fromMacros,
  MAX_NAME_CHARS,
  naturalMeasure,
  parseMealItems,
  toMacros,
  type DayMealItem,
  type Food,
  type WriteMeal,
} from "@shared"

import type { Food as FoodRow, foods, MealItem } from "../db/schema"

/**
 * The pure half of the food logger's server side: turning the three things a
 * food can come from — a `foods` row, an Open Food Facts product, a line in a
 * logged meal — into the one `Food` shape the client takes.
 *
 * It lives outside `server/data/` on purpose. Every exported function in that
 * directory takes a `UserScope` first, which is what makes a verified session a
 * precondition of reading anything (`tests/scoped-access.test.ts`). Nothing here
 * reads anything: these are mappings over values already in hand, and they are
 * here so they can be tested without a database.
 *
 * No arithmetic beyond the one conversion OFF data needs, and that one is the
 * engine's — `kcalFromKj`.
 */

/** A `foods` row, as the client sees it. `null` when its macros are unreadable. */
export function foodFromRow(row: FoodRow): Food | null {
  const basis = row.per100 ?? row.perUnit
  const per = readMacros(basis)
  if (!per) return null

  const origin = row.userId === null ? "shared" : "mine"

  if (row.per100) {
    /**
     * Weight unless the row says volume. The 11 migrated foods predate this
     * app's unit vocabulary, and a per-100 row with a unit like "grams" or no
     * unit at all is still a per-100-gram row — that is what `per100` means.
     */
    const unit = row.unit === "ml" ? "ml" : "g"
    const defaultQty = positiveOr(row.defaultQty, 0)
    const measure = naturalMeasure(row.name, unit, defaultQty > 0 ? defaultQty : null, row.unitLabel)
    return {
      id: row.id,
      name: row.name,
      brand: null,
      barcode: row.barcode,
      origin,
      unit,
      per,
      serving: { quantity: defaultQty > 0 ? defaultQty : (measure?.grams ?? 100), label: row.unitLabel },
      ...(measure ? { measure } : {}),
      imageUrl: null,
    }
  }

  /**
   * A per-one row in a unit this build knows keeps it; anything else is a
   * "piece" with the stored word kept as the label. "1 egg" logged as "1
   * piece" with the label "egg" still multiplies correctly — the basis is one
   * either way — and the word the user chose is still on screen.
   */
  const known = row.unit !== null && isPortionUnit(row.unit)
  return {
    id: row.id,
    name: row.name,
    brand: null,
    barcode: row.barcode,
    origin,
    unit: known ? row.unit! : "piece",
    per,
    serving: {
      quantity: positiveOr(row.defaultQty, 1),
      label: row.unitLabel ?? (known ? null : row.unit),
    },
    imageUrl: null,
  }
}

/**
 * The column values a `foods` row is written with, from a food the client sent
 * or OFF resolved. The inverse of `foodFromRow`, and the one place that decides
 * which of `per100` / `per_unit` gets filled — the table's `foods_one_basis`
 * check demands exactly one.
 */
export function rowValuesFromFood(
  food: Pick<Food, "name" | "brand" | "barcode" | "unit" | "per" | "serving">,
): Pick<
  typeof foods.$inferInsert,
  "name" | "unit" | "defaultQty" | "per100" | "perUnit" | "unitLabel" | "barcode"
> {
  const perHundred = food.unit === "g" || food.unit === "ml"
  return {
    name: foodDisplayName(food.name, food.brand),
    unit: food.unit,
    defaultQty: food.serving.quantity,
    per100: perHundred ? fromMacros(food.per) : null,
    perUnit: perHundred ? null : fromMacros(food.per),
    unitLabel: food.serving.label,
    barcode: food.barcode,
  }
}

/**
 * One line of a write request, in the shape the jsonb column holds.
 *
 * Shared by `meal_logs` and `custom_meals`, whose `items` columns are the same
 * shape by design — a saved meal is a logged meal without a day. Moved here
 * from `server/data/meals.ts` on `food-logger` (2026-10-19) when saved meals
 * needed it too; a second copy is how the two tables' items would drift.
 *
 * The macro vocabularies differ on either side of this function — the engine
 * and the wire say `protein`/`carbs`, the column says `pro`/`carb` — and
 * `fromMacros` is the only place that translation is allowed to happen. It runs
 * twice per item here: once for the line's own totals, once for the per-unit
 * figures inside `portion`, which are macros like any others.
 *
 * `portion` is dropped when absent rather than written as `null`. A key that is
 * not in the object reads back as `undefined` through `mealPortionSchema
 * .optional()`, which is the same state the 38 migrated rows are already in —
 * so old rows and new portionless ones are one case downstream instead of two.
 */
export function storedItemFromWrite(item: WriteMeal["items"][number]): MealItem {
  return {
    name: item.name,
    qty: item.qty,
    ...fromMacros(item.macros),
    ...(item.portion
      ? {
          portion: {
            quantity: item.portion.quantity,
            unit: item.portion.unit,
            per: fromMacros(item.portion.per),
            ...(item.portion.measure ? { measure: item.portion.measure } : {}),
          },
        }
      : {}),
  }
}

/**
 * A stored `items` column, in the read contract's shape. The inverse of
 * `storedItemFromWrite`, shared by the day view and the saved meals for the
 * same reason.
 *
 * `portion` is `null` when absent — on the 38 migrated rows and anything
 * logged as bare macros — which the client's editor reads as "no portion
 * behind this line" and edits the macros directly. `toMacros` on the per-unit
 * figures too: they are macros, and the vocabulary translation is not optional
 * for them either.
 */
export function readMealItems(value: unknown): DayMealItem[] {
  return parseMealItems(value).map((item) => ({
    name: item.name,
    qty: item.qty,
    macros: toMacros(item),
    portion: item.portion
      ? {
          quantity: item.portion.quantity,
          unit: item.portion.unit,
          per: toMacros(item.portion.per),
          ...(item.portion.measure ? { measure: item.portion.measure } : {}),
        }
      : null,
  }))
}

/**
 * Recent foods from this user's own logged meals, one per name.
 *
 * Only lines that recorded a **portion** qualify. A line without one — all 38
 * migrated rows, and anything typed as bare macros — has an absolute total and
 * no basis, so there is nothing to scale and offering it in a list where every
 * other row takes a quantity would be a lie about what it can do.
 *
 * Deduplicated on the trimmed, lower-cased name, keeping the **newest**: the
 * serving it carries is what was eaten last time, which is the one a repeat log
 * most likely wants. `meals` must arrive newest first for that to hold.
 *
 * ## `slot`: what you usually have at this meal
 *
 * With a slot, foods eaten at that meal come first, the ones eaten there most
 * often at the top, and everything else follows newest first. This is the
 * logger's "Usually at breakfast" list — MacroFactor's "3 PM Picks"
 * (`research designs/macrofactor/notes.md`), keyed on the meal rather than the
 * hour because NutriSA's day is built from meals. Which meal a logged meal was
 * is the engine's `slotOfMeal`, the same rule the day view groups by, so a food
 * shows up as "usual" at exactly the meal the user sees it under.
 *
 * Search does not filter this list; it ranks `foodHistory` instead.
 */
export function recentFoodsFromMeals(
  meals: readonly { name?: string; loggedTime?: string | null; items: unknown }[],
  limit: number,
  options: { slot?: MealSlot } = {},
): Food[] {
  const found = new Map<string, { food: Food; atSlot: number }>()

  for (const meal of meals) {
    const atSlot =
      options.slot !== undefined && slotOfMeal(meal.name ?? "", meal.loggedTime ?? null) === options.slot
    const counted = new Set<string>()

    for (const item of parseMealItems(meal.items)) {
      if (!item.portion) continue
      const key = foodKey(item.name)
      if (key.length === 0) continue

      let entry = found.get(key)
      if (!entry) {
        entry = { food: recentFood(item.name, item.portion), atSlot: 0 }
        found.set(key, entry)
      }
      // Once per meal: two lines of rice in one dinner is still one dinner.
      if (atSlot && !counted.has(key)) {
        counted.add(key)
        entry.atSlot += 1
      }
    }
  }

  // Map order is first-seen, which is newest first. The sort is stable, so
  // foods eaten at the slot equally often keep that order between them.
  const ranked = [...found.values()]
  if (options.slot !== undefined) ranked.sort((a, b) => b.atSlot - a.atSlot)
  return ranked.slice(0, limit).map((entry) => entry.food)
}

/** How a user has logged one food, by name: what search ranks by (Q32). */
export type FoodHistory = {
  /** The newest line with a portion, as a recent food; null if none had one. */
  food: Food | null
  /** Meals that held it. Two lines of rice in one dinner is one. */
  timesLogged: number
  /** The newest of those meals' days. */
  lastLogged: string
}

/**
 * Every food in `meals`, keyed by `foodKey`, with how often and how lately it
 * was logged. `meals` must arrive newest first, as for `recentFoodsFromMeals`,
 * and already cut to the window that counts (the last 90 days).
 *
 * A line without a portion still counts: a migrated "Oats" line is still
 * evidence the user eats oats, and lifts an "Oats" row in search. It just
 * cannot be offered itself, having nothing to scale (`food` stays null).
 */
export function foodHistory(
  meals: readonly { date: string; items: unknown }[],
): Map<string, FoodHistory> {
  const history = new Map<string, FoodHistory>()

  for (const meal of meals) {
    const counted = new Set<string>()
    for (const item of parseMealItems(meal.items)) {
      const key = foodKey(item.name)
      if (key.length === 0) continue

      let entry = history.get(key)
      if (!entry) {
        entry = { food: null, timesLogged: 0, lastLogged: meal.date }
        history.set(key, entry)
      }
      if (!entry.food && item.portion) entry.food = recentFood(item.name, item.portion)
      if (!counted.has(key)) {
        counted.add(key)
        entry.timesLogged += 1
      }
    }
  }

  return history
}

/** One name, however it was typed: trimmed and lower-cased. */
export function foodKey(name: string): string {
  return name.trim().toLowerCase()
}

type LinePortion = NonNullable<ReturnType<typeof parseMealItems>[number]["portion"]>

function recentFood(name: string, portion: LinePortion): Food {
  return {
    id: null,
    name: name.trim(),
    brand: null,
    barcode: null,
    origin: "recent",
    unit: portion.unit,
    per: toMacros(portion.per),
    serving: { quantity: portion.quantity, label: null },
    // Last time's unit too: a banana logged as 1 banana comes back as one.
    ...(portion.measure ? { measure: portion.measure } : {}),
    imageUrl: null,
  }
}

/**
 * An Open Food Facts product, or `null` when it cannot honestly be logged.
 *
 * ## What "honestly" means here
 *
 * Energy and all three macros, per 100. OFF is crowd-sourced and a large share
 * of SA entries carry a name and a barcode and nothing else, or energy and fat
 * with no protein. Showing a missing macro as 0 would let someone log "baked
 * beans: 0 g protein" and believe it, so a product missing any of the four is
 * not a food this app can offer. The scanner falls through to "create it" for
 * those, which is the right answer to a packet in someone's hand.
 *
 * Energy may be kcal or kJ. SA labels lead with kJ and many OFF records carry
 * only that; `kcalFromKj` is the engine's conversion. kcal wins when both are
 * present, because it is what the label printed rather than a derivation.
 *
 * The two OFF APIs disagree about `brands` — the product API sends a comma
 * string, search-a-licious an array — and about `serving_quantity`, which is
 * sometimes a numeric string. Both are accepted.
 */
export function foodFromOff(raw: unknown): Food | null {
  if (!raw || typeof raw !== "object") return null
  const product = raw as Record<string, unknown>

  const code = barcodeSchema.safeParse(product.code)
  if (!code.success) return null

  const name = typeof product.product_name === "string" ? product.product_name.trim() : ""
  if (name.length === 0) return null

  const nutriments =
    product.nutriments && typeof product.nutriments === "object"
      ? (product.nutriments as Record<string, unknown>)
      : {}

  const kcalDirect = finiteNonNegative(nutriments["energy-kcal_100g"])
  const kj = finiteNonNegative(nutriments["energy-kj_100g"])
  const kcal = kcalDirect ?? (kj === null ? null : kcalFromKj(kj))
  const protein = finiteNonNegative(nutriments.proteins_100g)
  const carbs = finiteNonNegative(nutriments.carbohydrates_100g)
  const fat = finiteNonNegative(nutriments.fat_100g)
  if (kcal === null || protein === null || carbs === null || fat === null) return null

  const servingQuantity = finiteNonNegative(product.serving_quantity)
  const servingLabel =
    typeof product.serving_size === "string" && product.serving_size.trim().length > 0
      ? product.serving_size.trim()
      : null

  const unit = product.product_quantity_unit === "ml" ? "ml" : "g"
  const hasServing = servingQuantity !== null && servingQuantity > 0
  // "1 slice (35 g)" from the packet, else the common-food list: a banana is
  // offered as 1 banana, not 100 g of one (Sriman, 2026-10-20).
  const measure = naturalMeasure(name, unit, hasServing ? servingQuantity : null, servingLabel)

  return {
    id: null,
    name: name.slice(0, MAX_NAME_CHARS),
    brand: firstBrand(product.brands),
    barcode: code.data,
    origin: "off",
    unit,
    per: normaliseMacros({ kcal, protein, carbs, fat }),
    serving: hasServing
      ? { quantity: servingQuantity, label: servingLabel }
      : { quantity: measure?.grams ?? 100, label: null },
    ...(measure ? { measure } : {}),
    imageUrl: offImage(product.image_front_url) ?? offImage(product.image_front_small_url),
  }
}

/**
 * A photo URL, but only one on OFF's own image host over HTTPS. The record is
 * crowd-sourced; the phone loads whatever this returns, and an arbitrary URL
 * there would be an arbitrary request from every phone that sees the product.
 */
function offImage(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("https://images.openfoodfacts.org/")
    ? value
    : null
}

/**
 * `ILIKE` with the user's text taken literally.
 *
 * `%` and `_` are wildcards in a `LIKE` pattern, and a search for "100%" would
 * otherwise match everything. Backslash is Postgres's default escape.
 */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
}

function firstBrand(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : typeof value === "string" ? value.split(",")[0] : null
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function finiteNonNegative(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null
}

function positiveOr(value: number | null, fallback: number): number {
  return value !== null && Number.isFinite(value) && value > 0 ? value : fallback
}

/** `foods.per100` / `per_unit` is jsonb — typed by Drizzle, checked by nobody. */
function readMacros(value: unknown): Food["per"] | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const kcal = finiteNonNegative(row.kcal)
  const pro = finiteNonNegative(row.pro)
  const carb = finiteNonNegative(row.carb)
  const fat = finiteNonNegative(row.fat)
  if (kcal === null || pro === null || carb === null || fat === null) return null
  return toMacros({ kcal, pro, carb, fat })
}
