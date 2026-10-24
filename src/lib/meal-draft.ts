import {
  currentClockTime,
  isPortionUnit,
  measureLabel,
  normaliseMacros,
  perHundredFrom,
  portionLabel,
  scalePortion,
  sumMacros,
  type Macros,
  type Measure,
  type PortionUnit,
} from "@engine"
import {
  commonMeasure,
  foodDisplayName,
  weightFromQty,
  type DayMealItem,
  type Food,
  type WriteMeal,
} from "@shared"

import { parseDecimal } from "@/lib/format"
import { uuidv7 } from "@/lib/uuid"

/**
 * The manual entry form's working state, and the two translations at its edges.
 *
 * A form holds strings. The API holds numbers. This module is the boundary, and
 * it exists as a module rather than as helpers inside the screen so that the
 * screen is layout and this is logic — and so the round trip (log a meal, open
 * it again, see the same fields) can be reasoned about in one file.
 *
 * **No arithmetic lives here.** `scalePortion`, `sumMacros` and
 * `normaliseMacros` all come from `packages/engine/`. What this does is parse
 * text into numbers and shuffle keys, which is the part that is allowed outside
 * the engine and is exactly the part the engine must not know about.
 */

/** The four macro fields, as the user is typing them. */
export type MacroText = {
  kcal: string
  protein: string
  carbs: string
  fat: string
}

/**
 * One line of the form.
 *
 * ## Two modes, and why the second one has to exist
 *
 * `portion` is the normal case and the one plan.md describes: a quantity, a
 * unit, and the macros one basis-worth contains — the engine multiplies.
 *
 * `direct` is for a line whose portion is not recorded. The 38 migrated rows
 * are all like this: they carry a `qty` string like "1 slice" and an absolute
 * macro total, and **nothing may parse that string** (see `meal-items.ts`), so
 * there is no honest way to show them as a quantity times anything. Rather than
 * invent "1 × piece" and quietly misrepresent the row, the line drops to
 * editing exactly what is stored.
 *
 * A line written by this form is always `portion`, so `direct` is a mode you
 * arrive in and never choose.
 */
export type DraftItem = {
  /**
   * A React list key, not a database id. Lines have no identity server-side —
   * they are a jsonb array, replaced wholesale on every write — but they need a
   * stable key here or removing the second of three lines re-mounts the third
   * and drops whatever was half-typed in it. Minted with the same v7 function
   * as everything else because there is already one and it is right here.
   */
  key: string
  name: string
  mode: "portion" | "direct"
  /** `portion` mode. */
  quantity: string
  unit: PortionUnit
  per: MacroText
  /** `direct` mode: the free text as stored, and the absolute macros. */
  qty: string
  macros: MacroText
  /**
   * The natural unit a g or ml amount is shown and entered in — "banana",
   * 118 g — when the food has one. `quantity` stays in grams (or ml) either
   * way; this only changes the label ("1.5 bananas (177 g)") and lets the
   * amount panel count in bananas. See `@shared`'s `measures.ts`.
   */
  measure: Measure | null
}

const ZERO_TEXT: MacroText = { kcal: "", protein: "", carbs: "", fat: "" }

/**
 * A number from a field that is still being typed.
 *
 * "" and "1." and "-" are all states a decimal pad passes through, and none of
 * them is a number. They become 0 rather than NaN: a NaN would reach the engine,
 * survive the multiplication, and print "NaN" against every macro on the screen.
 * Negative is clamped for the same reason the schema refuses it — a macro below
 * zero is not a thing.
 *
 * Through `parseDecimal`, not `Number()`. This used to be `Number(text)`, which
 * reads the SA decimal pad's "1,5" as `NaN` and so as zero — the same bug the
 * weigh-in field had on the device, on every quantity and macro in this form.
 */
export function toNumber(text: string): number {
  return parseDecimal(text) ?? 0
}

function macrosFrom(text: MacroText): Macros {
  return normaliseMacros({
    kcal: toNumber(text.kcal),
    protein: toNumber(text.protein),
    carbs: toNumber(text.carbs),
    fat: toNumber(text.fat),
  })
}

/** A fresh, blank line. Grams by default — the unit most things are logged in. */
export function emptyDraftItem(): DraftItem {
  return {
    key: uuidv7(),
    name: "",
    mode: "portion",
    quantity: "",
    unit: "g",
    per: ZERO_TEXT,
    qty: "",
    macros: ZERO_TEXT,
    measure: null,
  }
}

/** How the numbers are shown when a stored line is reopened. Blank stays blank. */
function textFrom(macros: Macros): MacroText {
  return {
    kcal: String(macros.kcal),
    protein: String(macros.protein),
    carbs: String(macros.carbs),
    fat: String(macros.fat),
  }
}

/**
 * A stored line, reopened for editing.
 *
 * Drops to `direct` when the row records no portion, or records a unit this
 * build does not know. The second case is deliberate lenience: `dayMealItem
 * .portion.unit` is a plain string on the read path precisely so a row written
 * by a later version is still *displayable* here, and displaying it as raw
 * macros is better than refusing to open the meal.
 */
export function draftItemFromLogged(item: DayMealItem): DraftItem {
  const portion = item.portion
  if (portion && isPortionUnit(portion.unit)) {
    return {
      key: uuidv7(),
      name: item.name,
      mode: "portion",
      quantity: String(portion.quantity),
      unit: portion.unit,
      per: textFrom(portion.per),
      qty: item.qty,
      macros: textFrom(item.macros),
      // A weighed line without its unit (logged in grams before natural units
      // existed) picks one up when the food is a common one: 76 g of sourdough
      // reopens as slices.
      measure:
        portion.measure ??
        (portion.unit === "g" || portion.unit === "ml" ? commonMeasure(item.name, portion.unit) : null),
    }
  }

  return {
    key: uuidv7(),
    name: item.name,
    mode: "direct",
    quantity: "",
    unit: "g",
    per: ZERO_TEXT,
    qty: item.qty,
    macros: textFrom(item.macros),
    measure: null,
  }
}

/**
 * A food from the logger — a search hit, a recent food, a scan — as a line.
 *
 * Always `portion` mode: a `Food` is per basis by contract, so it is exactly a
 * quantity, a unit and the macros one basis-worth contains, and nothing has to
 * be converted on the way onto the plate. `scalePortion` multiplies it, here
 * and on save, the same as a line typed by hand.
 *
 * `quantity` defaults to the food's serving — the label's serving for a
 * product, last time's amount for a recent food — which is what makes the `+`
 * button a one-tap log.
 *
 * A unit this build does not know becomes a piece. The server already does
 * this for stored rows; it is repeated here because the read contract keeps
 * `unit` a plain string, and a line with an unknown unit cannot be scaled.
 *
 * The food's natural unit comes along when it has one (`food.measure`), and
 * only for g and ml: a slice of bread, a banana.
 */
export function draftItemFromFood(food: Food, quantity: number = food.serving.quantity): DraftItem {
  const unit: PortionUnit = isPortionUnit(food.unit) ? food.unit : "piece"
  return {
    key: uuidv7(),
    name: foodDisplayName(food.name, food.brand),
    mode: "portion",
    quantity: String(quantity),
    unit,
    per: textFrom(food.per),
    qty: "",
    macros: ZERO_TEXT,
    measure: unit === "g" || unit === "ml" ? (food.measure ?? null) : null,
  }
}

/**
 * What one serving of a food contains — the numbers a search row prints beside
 * its `+`. The engine's `scalePortion`, with the same unknown-unit fallback as
 * `draftItemFromFood`, so the row and the line it becomes always agree.
 */
export function foodServingMacros(food: Food): Macros {
  const unit: PortionUnit = isPortionUnit(food.unit) ? food.unit : "piece"
  return scalePortion(food.per, food.serving.quantity, unit)
}

/**
 * What this line contributes, computed by the engine.
 *
 * The one number on this screen the user did not type, which is why it goes
 * through `scalePortion` rather than a `*` in a component.
 */
export function draftItemMacros(item: DraftItem): Macros {
  if (item.mode === "direct") return macrosFrom(item.macros)
  return scalePortion(macrosFrom(item.per), toNumber(item.quantity), item.unit)
}

/**
 * Whether a line has to be weighed before the amount panel can scale it.
 *
 * True for a `direct` line (absolute macros, no portion: the old app's history,
 * Quick Add) and for a line in the `serving` unit. A serving was the first
 * answer to these (2026-10-20, "1 serving" of itself), and Sriman rejected it
 * the same day: "we don't know what one serving entails and how many grams are
 * in one serving". Every amount the panel scales is now a real weight, or a
 * unit the user chose themselves (slices of a food they created).
 */
export function needsWeight(item: DraftItem): boolean {
  return item.mode === "direct" || item.unit === "serving"
}

/**
 * The line in grams (or ml), once its total weight is known: same macros, now
 * per 100 of `unit`, so the slider scales it like any weighed food. The per-100
 * figures are the engine's `perHundredFrom`.
 *
 * Null for a weight that is not positive.
 */
export function weighedDraftItem(item: DraftItem, amount: number, unit: "g" | "ml"): DraftItem | null {
  const per = perHundredFrom(draftItemMacros(item), amount)
  if (!per) return null
  // Counted in its natural unit when it has one: sourdough in slices (Sriman,
  // 2026-10-20: "show slices instead of grams"), with the grams beside it.
  return {
    ...item,
    mode: "portion",
    unit,
    per: textFrom(per),
    quantity: String(amount),
    measure: commonMeasure(item.name, unit),
  }
}

/**
 * The line in grams without asking, when its stored amount already is a real
 * weight: "200g" of yoghurt at 106 kcal (`weightFromQty`). Null when the
 * amount is not one ("0.75g" of whey at 99 kcal), and the user is asked.
 */
export function autoWeighedDraftItem(item: DraftItem): DraftItem | null {
  if (!needsWeight(item)) return null
  const text = item.mode === "direct" ? item.qty : draftItemQty(item)
  const weight = weightFromQty(text, draftItemMacros(item).kcal)
  return weight ? weighedDraftItem(item, weight.amount, weight.unit) : null
}

/**
 * The `qty` string that will be stored. Built by the engine in portion mode:
 * "1.5 bananas (177 g)" with a measure, "150 g" or "2 slices" without.
 */
export function draftItemQty(item: DraftItem): string {
  if (item.mode === "direct") return item.qty
  if (item.measure) return measureLabel(toNumber(item.quantity), item.measure, item.unit)
  return portionLabel(toNumber(item.quantity), item.unit)
}

/**
 * The amount as a person should read it. A line whose stored amount claims a
 * weight it cannot be ("2g" of sourdough at 180 kcal) or is only "servings"
 * says **weight not recorded** instead of repeating the old app's mistake.
 * Everything else reads as stored.
 */
export function honestQty(qty: string, kcal: number, scalable: boolean): string {
  if (scalable) return qty
  if (weightFromQty(qty, kcal)) return qty
  return /\d\s*(g|gr|grams?|ml|servings?)\b/i.test(qty) ? "Weight not recorded" : qty
}

/** `honestQty` for a stored line. */
export function storedItemQty(item: DayMealItem): string {
  const scalable = item.portion !== null && item.portion.unit !== "serving"
  return honestQty(item.qty, item.macros.kcal, scalable)
}

/** `honestQty` for a line being edited. */
export function draftQtyLabel(item: DraftItem): string {
  const qty = draftItemQty(item)
  return honestQty(qty, draftItemMacros(item).kcal, !needsWeight(item))
}

/** The meal's running total. */
export function draftTotals(items: readonly DraftItem[]): Macros {
  return sumMacros(items.map(draftItemMacros))
}

/**
 * A line is worth saving when it has a name.
 *
 * Not "when it has macros": a zero-calorie line is a real thing — black coffee,
 * a diet drink — and refusing it would make the app argue with the user about
 * what counts as food. An unnamed line, on the other hand, is a row somebody
 * added and did not fill in, and saving it would put a blank entry in the day
 * view forever.
 */
export function isDraftItemComplete(item: DraftItem): boolean {
  return item.name.trim().length > 0
}

/** One line, in the shape `POST`/`PATCH /meal-logs` takes. */
export function toWriteItem(item: DraftItem): WriteMeal["items"][number] {
  return {
    name: item.name.trim(),
    qty: draftItemQty(item),
    macros: draftItemMacros(item),
    /**
     * Recorded only in portion mode. A `direct` line has no portion behind it
     * by definition, and writing a fabricated "1 piece" would turn a row that
     * honestly says "we do not know how this was measured" into one that
     * claims something false — and it would claim it permanently, because the
     * next edit would read it back as fact.
     */
    portion:
      item.mode === "portion"
        ? {
            quantity: toNumber(item.quantity),
            unit: item.unit,
            per: macrosFrom(item.per),
            ...(item.measure ? { measure: item.measure } : {}),
          }
        : null,
  }
}

/**
 * A stored line — from a saved meal — in the shape a write takes, unchanged.
 *
 * For logging a saved meal as it is, without opening it in an editor. The
 * stored macros are carried over verbatim rather than recomputed through
 * `toWriteItem`, because they are what the user agreed to when the meal was
 * saved — and on the 4 migrated saved meals there is no portion to recompute
 * from at all.
 *
 * A portion in a unit this build does not know is dropped, not invented: the
 * write schema only accepts known units, and the line's absolute macros are
 * still correct without it.
 */
export function writeItemFromLogged(item: DayMealItem): WriteMeal["items"][number] {
  const portion = item.portion
  return {
    name: item.name.trim(),
    qty: item.qty,
    macros: item.macros,
    portion:
      portion && isPortionUnit(portion.unit)
        ? {
            quantity: portion.quantity,
            unit: portion.unit,
            per: portion.per,
            ...(portion.measure ? { measure: portion.measure } : {}),
          }
        : null,
  }
}

/**
 * Re-exported so the entry form takes its whole vocabulary from this module.
 *
 * It used to be *defined* here, on a bare `new Date()`, argued away as display
 * only. A review on 2026-08-20 pointed out that it is persisted as
 * `meal_logs.logged_time` on every meal, so it is not display only in the sense
 * the rule means — and it read the device's clock rather than SAST, so a phone
 * abroad would stamp a time disagreeing with the day the server filed it under.
 * It now lives in `packages/engine/src/time.ts`, beside the day authority.
 */
export { currentClockTime }

/** `HH:MM`, or nothing. The same shape the write schemas accept. */
export function normaliseLoggedTime(value: string): string | null {
  const trimmed = value.trim()
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null
}
