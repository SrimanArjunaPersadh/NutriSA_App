import { z } from "zod"

import { amountForMeasure, gramsPerMeasure, isPlausibleWeight, type Measure } from "@engine"

/**
 * Where a food's natural unit comes from: "1 slice", "1 banana", "1 glass"
 * rather than 100 g (Sriman, 2026-10-20: "make sure units of measurement make
 * sense"). The arithmetic is the engine's (`measureCount`, `amountForMeasure`,
 * `measureLabel`); this module only decides **which** measure a food has.
 *
 * Two sources, in order:
 *
 * 1. **The packet.** Open Food Facts carries the label's serving as text,
 *    "1 slice (35 g)", next to its weight, 35. A serving named by a thing
 *    (slice, biscuit, bar, tub) becomes the measure; one that is only a weight
 *    ("30 g") does not.
 * 2. **A short list of common foods**, for what has no packet serving: bread,
 *    fruit, eggs, spreads. Typical weights from USDA FoodData Central's
 *    standard portions, rounded, and SA sizes where they differ (a slice of
 *    SA sandwich bread is about 38 g). A guess about an average banana is
 *    still a better default than 100 g of one, and the panel shows the grams
 *    beside the count, so the user sees exactly what is assumed.
 */

/**
 * Its own ceiling rather than `writes.ts`'s `MAX_GRAMS`: `writes.ts` imports
 * this schema, and importing back would be a cycle. No single natural unit of
 * food weighs 5 kg.
 */
const MAX_MEASURE_GRAMS = 5000

export const measureSchema = z.object({
  noun: z.string().trim().min(1).max(30),
  grams: z.number().gt(0).max(MAX_MEASURE_GRAMS),
})

/** Words that name a weight or a volume, not a thing: never a measure. */
const NOT_A_NOUN = new Set([
  "g", "gr", "gram", "grams", "gm", "kg", "mg", "ml", "l", "litre", "liter", "cl", "dl",
  "oz", "fl oz", "lb", "x", "e", "portion size",
])

/** "½" and "one" are how labels write a single or a half. */
function readCount(text: string | undefined): number | null {
  if (text === undefined || text.length === 0) return 1
  if (text === "½") return 0.5
  if (text.toLowerCase() === "one") return 1
  const value = Number(text.replace(",", "."))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** "slices" → "slice" for a count above one; the measure is always one of them. */
function singular(noun: string): string {
  const words = noun.split(" ")
  const last = words[words.length - 1] ?? ""
  let one = last
  if (/ies$/i.test(last)) one = `${last.slice(0, -3)}y`
  else if (/(ches|shes|xes|sses)$/i.test(last)) one = last.slice(0, -2)
  else if (/[^s]s$/i.test(last)) one = last.slice(0, -1)
  return [...words.slice(0, -1), one].join(" ")
}

/**
 * The measure a label's serving names, or null.
 *
 * "1 slice (35 g)" with 35 → slice, 35 g. "2 biscuits (25 g)" with 25 →
 * biscuit, 12.5 g. "30 g" → null: a weight is not a thing to count.
 */
export function measureFromServingSize(text: string | null, servingQuantity: number | null): Measure | null {
  if (!text || servingQuantity === null || !(servingQuantity > 0)) return null
  const match = /^\s*(\d+(?:[.,]\d+)?|½|one)?\s*([a-z][a-z\- ]*?)\s*(?:\(|$)/i.exec(text)
  if (!match) return null

  const count = readCount(match[1])
  const raw = (match[2] ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  if (count === null || raw.length === 0 || raw.length > 30 || raw.split(" ").length > 3) return null
  if (NOT_A_NOUN.has(raw)) return null

  const noun = count === 1 ? raw : singular(raw)
  const grams = gramsPerMeasure(servingQuantity, count)
  return grams === null ? null : { noun, grams }
}

type Common = { match: RegExp; noun: string; grams: number; unit?: "g" | "ml" }

/**
 * Common foods without a packet serving. **Order matters**: the first match
 * wins, so "banana bread" is bread (a slice) before it is a banana, and
 * "peanut butter" is a spread before it is butter.
 */
const COMMON: readonly Common[] = [
  // Sourdough is cut thicker: 44 g a slice, Sriman's own (2026-10-20). The
  // bread word may follow it: the food word must end the name (see
  // `commonMeasure`), and "Sourdough bread" used to fall through to 38 g.
  { match: /\bsourdough(?:\s+(?:bread|loaf|toast))?\b/i, noun: "slice", grams: 44 },
  { match: /\b(bread|toast|loaf|rye)\b/i, noun: "slice", grams: 38 },
  { match: /\brusks?\b/i, noun: "rusk", grams: 30 },
  { match: /\b(wrap|tortilla)s?\b/i, noun: "wrap", grams: 60 },
  { match: /\bpitas?\b/i, noun: "pita", grams: 60 },
  { match: /\b(bagel)s?\b/i, noun: "bagel", grams: 100 },
  { match: /\b(muffin|croissant|scone)s?\b/i, noun: "piece", grams: 60 },
  { match: /\b(roll|bun)s?\b/i, noun: "roll", grams: 50 },
  { match: /\b(biscuit|cookie)s?\b/i, noun: "biscuit", grams: 12 },
  { match: /\bpeanut butter\b/i, noun: "tablespoon", grams: 16 },
  { match: /\b(butter|margarine|oil)\b/i, noun: "tablespoon", grams: 14 },
  { match: /\bhoney\b/i, noun: "tablespoon", grams: 21 },
  { match: /\b(jam|syrup)\b/i, noun: "tablespoon", grams: 20 },
  { match: /\bbananas?\b/i, noun: "banana", grams: 118 },
  { match: /\bapples?\b/i, noun: "apple", grams: 180 },
  { match: /\b(naartjie|mandarin|tangerine)s?\b/i, noun: "naartjie", grams: 90 },
  { match: /\boranges?\b/i, noun: "orange", grams: 140 },
  { match: /\bpears?\b/i, noun: "pear", grams: 170 },
  { match: /\bpeach(es)?\b/i, noun: "peach", grams: 150 },
  { match: /\bplums?\b/i, noun: "plum", grams: 65 },
  { match: /\bkiwis?\b/i, noun: "kiwi", grams: 75 },
  { match: /\bmangoe?s?\b/i, noun: "mango", grams: 200 },
  { match: /\bavocados?\b/i, noun: "avocado", grams: 170 },
  { match: /\beggs?\b(?!\s*plant)/i, noun: "egg", grams: 50 },
  { match: /\bsweet potato(es)?\b/i, noun: "sweet potato", grams: 130 },
  { match: /\bpotato(es)?\b/i, noun: "potato", grams: 170 },
  { match: /\btomato(es)?\b/i, noun: "tomato", grams: 120 },
  { match: /\bonions?\b/i, noun: "onion", grams: 110 },
  { match: /\bcarrots?\b/i, noun: "carrot", grams: 60 },
  { match: /\bchicken breasts?\b/i, noun: "breast", grams: 170 },
  { match: /\b(milk|juice)\b/i, noun: "glass", grams: 250, unit: "ml" },
]

/**
 * A common food's measure, by name; null if it is not on the list.
 *
 * The food word must be the **last** word of the name, or come just before a
 * comma, bracket or dash ("Bananas, raw"). Product names describe more than
 * they are: "Baked Beans in Tomato Sauce" is not a tomato and "Milk
 * Chocolate" is not milk, but "Albany Brown Bread" is bread and "Large Eggs"
 * are eggs. A name that only mentions a food stays in grams.
 */
export function commonMeasure(name: string, unit: string): Measure | null {
  for (const entry of COMMON) {
    const atEnd = new RegExp(String.raw`${entry.match.source}\s*(?:$|[,(/–-])`, "i")
    if (!atEnd.test(name.trim())) continue
    // A volume measure only fits a food measured by volume, and a weight
    // measure only one measured by weight.
    if ((entry.unit ?? "g") !== (unit === "ml" ? "ml" : "g")) return null
    return { noun: entry.noun, grams: entry.grams }
  }
  return null
}

/**
 * A weighed food's natural unit: the packet's serving if it names a thing,
 * else the common-food list, else null (the food stays in grams). Only for g
 * and ml foods; a food already counted in slices or pieces has its unit.
 */
export function naturalMeasure(
  name: string,
  unit: string,
  servingQuantity: number | null,
  servingSize: string | null,
): Measure | null {
  if (unit !== "g" && unit !== "ml") return null
  return measureFromServingSize(servingSize, servingQuantity) ?? commonMeasure(name, unit)
}

/** The leading number of an amount as typed: "2g" → 2, "0.75 scoop" → 0.75, "1,5" → 1.5. */
function leadingNumber(text: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)/.exec(text)
  if (!match?.[1]) return null
  const value = Number(match[1].replace(",", "."))
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * The weight a stored amount states, if it really is one.
 *
 * Lines from the old app carry a free-text amount and absolute macros, and the
 * old app put a "g" on everything: "200g" of yoghurt is 200 g, but "0.75g" of
 * whey at 99 kcal was three quarters of a scoop and "2g" of sourdough at 180
 * kcal was two slices. A weight is taken only when it could hold the calories
 * (`isPlausibleWeight`), so the real ones are used and the false ones are not.
 *
 * Reads "200g", "200 g", "250 ml", "250ml", and a weight in brackets as this
 * app writes it, "1.5 bananas (177 g)".
 */
export function weightFromQty(qty: string, kcal: number): { amount: number; unit: "g" | "ml" } | null {
  const bracketed = /\((\d+(?:[.,]\d+)?)\s*(g|ml)\)\s*$/i.exec(qty)
  const bare = /^\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grams?|ml)\s*$/i.exec(qty)
  const match = bracketed ?? bare
  if (!match?.[1] || !match[2]) return null
  const amount = Number(match[1].replace(",", "."))
  if (!isPlausibleWeight(kcal, amount)) return null
  return { amount, unit: match[2].toLowerCase() === "ml" ? "ml" : "g" }
}

/**
 * A first guess at what a weightless amount weighed, for the user to confirm:
 * the amount's leading number times the common measure for the food's name.
 * "Sunbake Sourdough", "2g" → 2 slices → 88 g. Null when the food is not on the
 * common list; the user then types the weight.
 */
export function suggestedWeight(name: string, qty: string): number | null {
  const measure = commonMeasure(name, "g")
  if (!measure) return null
  return amountForMeasure(leadingNumber(qty) ?? 1, measure)
}
