import { COACH_KCAL_FLOOR } from "@engine"

/**
 * Finds the numbers in a reply that no source supplied (plan.md, Phase 9,
 * Q21 and Q30).
 *
 * The standing rule is that the model never computes a number. It cannot be
 * stopped mid-sentence from doing so, but it can be caught: every number in a
 * reply must appear in that turn's tool results, in the user's own message, or
 * in the date line the server gave it. A miss marks the message ("One number
 * here isn't from your log") and tags the Sentry outcome. It does not block
 * the reply, which the user has already read by the time this runs.
 *
 * ## What counts as the same number
 *
 * Numeric equality, so `48` matches `48.0` and `1,870` matches `1870`. Not
 * closeness: "about 49 g" against a source of 48.5 is a rounding the model did,
 * and rounding is arithmetic. The tools hand over figures at the precision the
 * app prints them, so a faithful reply has no reason to round.
 *
 * A comma followed by exactly three digits is a thousands separator ("1,870");
 * any other comma between digits is a decimal comma ("1,5"), as an SA keyboard
 * types it. Signs are ignored: "down 0.4 kg" quotes a delta of -0.4.
 *
 * ## Always allowed
 *
 * Whole numbers up to `SMALL_COUNT`, which carry no data: "2 things", "step 1",
 * "1 or 2 servings". And the coach's kcal floor, which the system prompt states.
 * Both loosen the plan's "every number" on purpose (Sriman, 2026-10-28): a
 * strict check would flag "2 eggs" whenever no lookup happened to say 2.
 *
 * ## Fixed text is blanked, not trusted
 *
 * The helpline numbers in the system prompt are passed as `fixed` and removed
 * from the reply before it is read. The prompt itself is **not** a source:
 * its digits (0800 456 789) would otherwise make an invented "456 kcal" pass.
 */

/** Counts and list numbers small enough to carry no measurement. */
const SMALL_COUNT = 12

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g
const THOUSANDS = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/

/** Every number written in `text`, as values. */
export function numbersIn(text: string): number[] {
  const values: number[] = []
  for (const match of text.matchAll(NUMBER)) {
    const raw = match[0]
    const value = Number(THOUSANDS.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", "."))
    if (Number.isFinite(value)) values.push(value)
  }
  return values
}

/**
 * The reply's numbers that appear in none of `sources`, each listed once,
 * after every `fixed` phrase is blanked out of the reply. Empty when every
 * number is accounted for.
 */
export function unsourcedNumbers(
  reply: string,
  sources: readonly string[],
  fixed: readonly string[] = [],
): number[] {
  const known = new Set<number>([COACH_KCAL_FLOOR])
  for (const source of sources) for (const value of numbersIn(source)) known.add(value)

  let text = reply
  for (const phrase of fixed) text = text.split(phrase).join(" ")

  const missing = new Set<number>()
  for (const value of numbersIn(text)) {
    if (Number.isInteger(value) && value <= SMALL_COUNT) continue
    if (!known.has(value)) missing.add(value)
  }
  return [...missing]
}
