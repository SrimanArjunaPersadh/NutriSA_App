import { addDays, daysBetween, type LogDay } from "./time"

/**
 * The logging streak: consecutive days ending today with at least one meal on
 * them.
 *
 * ## The rule that makes this more than a counter
 *
 * **Today not being logged yet does not break the streak.** A user on a 12-day
 * run who opens the app before breakfast is still on 12 — they have all day to
 * keep it. The streak only breaks once a day passes with nothing on it, which
 * is at midnight, which is why `lit` exists as a separate field from `days`.
 *
 * So there are three states, not two:
 *
 * | days | lit | meaning |
 * |---|---|---|
 * | 12 | true | logged today, on a 12-day run |
 * | 12 | false | on a 12-day run, today still open |
 * | 0 | false | no run — yesterday and today are both empty |
 *
 * The middle one is the whole point, and it is the state the streak overlay was
 * designed against: a grey flame beside a live number, with "Log one meal today
 * to keep the streak going" naming the thing standing between the two. A design
 * that only knew `days > 0` would have to light the flame there and would be
 * telling the user they were finished when they were not.
 *
 * ## Why this is in the engine
 *
 * It was the literal `12` in `design-fixture.ts`, and the fixture's own note
 * called out the debt: "A streak is a computed number, so when the data layer
 * lands this comes from a `streak.ts` in `packages/engine/`, not from a
 * `.filter().length` in a component." Counting backwards over calendar days
 * with a grace period is exactly the sort of thing that looks obvious and has
 * three off-by-one errors in it.
 */

export type Streak = {
  /** Consecutive logged days. 0 when the run is broken. */
  days: number
  /**
   * Whether **today** carries a log.
   *
   * Not `days > 0` — see the table above. This is what lights the flame.
   */
  lit: boolean
}

export const NO_STREAK: Streak = { days: 0, lit: false }

/**
 * The current streak from the set of days that carry at least one log.
 *
 * `loggedDays` may arrive in any order, may contain duplicates, and may contain
 * days after `today` — callers hand over whatever the query returned. Future
 * days are ignored rather than rejected: `checkLogDate` already refuses to
 * write one, so a future day here would mean the data is wrong, and silently
 * not counting it is better than throwing inside a dashboard read.
 */
export function currentStreak(
  loggedDays: readonly LogDay[],
  today: LogDay,
): Streak {
  const logged = new Set(loggedDays)
  const lit = logged.has(today)

  /**
   * Where the count starts.
   *
   * Today when it is logged; otherwise yesterday, which is the grace period. If
   * yesterday is empty too then the run really is over — the loop below counts
   * zero and returns `NO_STREAK`, without needing that case written out.
   */
  let cursor = lit ? today : addDays(today, -1)

  let days = 0
  while (logged.has(cursor)) {
    days++
    cursor = addDays(cursor, -1)
  }

  return { days, lit }
}

/**
 * The longest run of consecutive logged days anywhere in the history.
 *
 * Not shown on the dashboard today. It is here because the streak overlay is
 * the natural home for "your best is 21" and because computing it alongside the
 * current streak costs one pass over data already in hand — writing it later
 * would mean a second module that re-derives the same day set.
 */
export function longestStreak(loggedDays: readonly LogDay[]): number {
  if (loggedDays.length === 0) return 0

  const ordered = [...new Set(loggedDays)].sort()

  let longest = 1
  let run = 1
  for (let i = 1; i < ordered.length; i++) {
    // Exactly one day apart continues the run; any larger gap starts a new one.
    // Duplicates cannot reach here — the Set removed them — so a gap of 0 is
    // not a case that needs handling.
    if (daysBetween(ordered[i - 1]!, ordered[i]!) === 1) run++
    else run = 1
    if (run > longest) longest = run
  }

  return longest
}
