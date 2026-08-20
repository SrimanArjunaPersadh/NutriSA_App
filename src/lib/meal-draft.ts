import {
  isPortionUnit,
  normaliseMacros,
  portionLabel,
  scalePortion,
  sumMacros,
  type Macros,
  type PortionUnit,
} from "@engine"
import type { DayMeal, DayMealItem, WriteMeal } from "@shared"

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
 */
export function toNumber(text: string): number {
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : 0
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
  }
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

/** The `qty` string that will be stored. Built by the engine in portion mode. */
export function draftItemQty(item: DraftItem): string {
  if (item.mode === "direct") return item.qty
  return portionLabel(toNumber(item.quantity), item.unit)
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
          }
        : null,
  }
}

/**
 * A whole meal, reopened for editing.
 *
 * `loggedTime` becomes "" rather than staying null, because the field it fills
 * is a text input and a null there would render the string "null".
 */
export function draftFromMeal(meal: DayMeal): {
  name: string
  loggedTime: string
  items: DraftItem[]
} {
  return {
    name: meal.name,
    loggedTime: meal.loggedTime ?? "",
    items: meal.items.map(draftItemFromLogged),
  }
}

/**
 * The wall-clock time to stamp on a new meal, `HH:MM`.
 *
 * The **phone's** clock, and that is correct: this field is display-only, it is
 * what the user's day felt like, and nothing sorts or computes by it. The
 * calendar day is a different question entirely and is answered server-side by
 * `currentLoggingDay()` — the single time authority — never here.
 */
export function currentClockTime(now: Date = new Date()): string {
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

/** `HH:MM`, or nothing. The same shape the write schemas accept. */
export function normaliseLoggedTime(value: string): string | null {
  const trimmed = value.trim()
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null
}
