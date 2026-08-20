import { weekdayIndex, type LogDay } from "@engine"

/**
 * Display formatting. **Presentation only — nothing here computes a value.**
 *
 * The line this file sits on: the engine decides *what* the number is and how
 * many decimals it carries; this decides how it is punctuated. `roundTo` is
 * arithmetic and lives in the engine. Putting a comma in a thousand is not, and
 * a round-trip to the server for it would be absurd.
 *
 * Nothing here rounds. Every value arriving from the API has already been
 * rounded by the engine to the precision it is meant to be read at, and a
 * second rounding in a component is how two surfaces end up disagreeing about
 * the same figure by a tenth.
 *
 * `Intl` is deliberately avoided. Hermes ships a subset whose behaviour varies
 * with build flags, and these outputs feed a design where column widths were
 * chosen against specific strings — this way they are the same on every device
 * and testable without a device at all.
 */

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** `1870` → `"1,870"`. Handles negatives, which a calorie budget can go. */
export function withThousands(value: number): string {
  const negative = value < 0
  const digits = String(Math.abs(value))
  const [whole = "", fraction] = digits.split(".")

  let grouped = ""
  for (let i = 0; i < whole.length; i++) {
    // Count from the right: a separator goes before every third digit that is
    // not the first one.
    const fromRight = whole.length - i
    if (i > 0 && fromRight % 3 === 0) grouped += ","
    grouped += whole[i]
  }

  const body = fraction ? `${grouped}.${fraction}` : grouped
  return negative ? `-${body}` : body
}

/**
 * Energy, as the dashboard shows it: whole numbers with a thousands separator.
 *
 * The value is already whole — `dayTotals` rounds kcal to zero decimals — so
 * `Math.round` here is a guard against a future contract change, not a
 * calculation. Without it a float would print as "1,870.0000000001".
 */
export function formatKcal(value: number): string {
  return withThousands(Math.round(value))
}

/**
 * Macro grams: one decimal, but only when there is one.
 *
 * "48 g" reads better than "48.0 g" on a ring, and "48.5 g" still needs its
 * tenth. The engine already rounded to one decimal, so this only decides
 * whether to print a `.0`.
 */
export function formatGrams(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** Bodyweight: always one decimal, so a column of them lines up. */
export function formatKg(value: number): string {
  return value.toFixed(1)
}

/**
 * A signed change, with an explicit `+` on a gain.
 *
 * The sign is the information — "0.6" says nothing about which way — and a
 * leading `+` is the only way to make a gain read as a gain without colour,
 * which VoiceOver cannot convey.
 */
export function formatSignedKg(value: number): string {
  const body = Math.abs(value).toFixed(1)
  if (value > 0) return `+${body}`
  if (value < 0) return `-${body}`
  return body
}

/** `2026-04-27` → `"27 Apr"`. The chart's x-axis labels. */
export function formatDayShort(day: LogDay): string {
  const month = MONTH_ABBREVIATIONS[Number(day.slice(5, 7)) - 1] ?? ""
  // Unpadded: "7 May", not "07 May".
  return `${Number(day.slice(8, 10))} ${month}`
}

const WEEKDAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * `2026-08-18` → `"Mon 18 Aug"`. The heading over a day being logged to.
 *
 * The weekday is the half that makes a back-dated day recognisable: "17 Aug"
 * takes a moment to place, "Sun 17 Aug" does not. `weekdayIndex` comes from the
 * engine — working out which day of the week a date falls on is arithmetic, and
 * the one time authority owns it.
 */
export function formatDayWithWeekday(day: LogDay): string {
  return `${WEEKDAY_ABBREVIATIONS[weekdayIndex(day)] ?? ""} ${formatDayShort(day)}`
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/**
 * `2026-08-20` → `"August 20"`. The Nutrition tab's heading.
 *
 * Month-first, which is the American order and **not** how a date is written in
 * South Africa — but it is what `src/design/nutrition_ui2.png` prints, and this
 * is the one string on that screen traced directly from it. Flagged for Sriman:
 * "20 August" is the local form and is a one-line change here if he wants it.
 */
export function formatDayLong(day: LogDay): string {
  const month = MONTH_NAMES[Number(day.slice(5, 7)) - 1] ?? ""
  return `${month} ${Number(day.slice(8, 10))}`
}
