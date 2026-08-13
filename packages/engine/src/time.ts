/**
 * The single time authority. Every date in the app comes from here.
 *
 * South Africa is UTC+2 year round and has never observed daylight saving, so
 * the offset is a constant rather than an Intl lookup. That is the only reason
 * this module can be pure and dependency-free — the moment the app goes
 * international (a named v2 trigger in plan.md) this becomes a real timezone
 * conversion and every caller has to pass a zone.
 */

/** A calendar day in Africa/Johannesburg, `YYYY-MM-DD`. */
export type LogDay = string

/** UTC+02:00, no DST, ever. */
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * The calendar day an instant belongs to in SAST.
 *
 * The instant is shifted by the offset and then read with the `getUTC*`
 * accessors, so the result never depends on the timezone of the machine
 * running it. A server in UTC, a phone in SAST and a laptop in CAT all agree.
 *
 * This is the "00:40 case": at 00:40 SAST the UTC instant is 22:40 the previous
 * day, so anything that reaches for the UTC date directly logs the meal against
 * yesterday. Anyone logging a late-night snack would have it silently land on
 * the wrong day, and the day's macro totals would be wrong for two days at once.
 */
export function currentLoggingDay(now: Date = new Date()): LogDay {
  return toLogDay(now)
}

/** The SAST calendar day for any instant. `currentLoggingDay` is this, for now. */
export function toLogDay(instant: Date): LogDay {
  const shifted = new Date(instant.getTime() + SAST_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * The SAST month a day falls in, `YYYY-MM`.
 *
 * The AI budget gate sums spend per calendar month in Africa/Johannesburg, not
 * UTC. Deriving it from the day rather than the instant means the month
 * boundary and the day boundary can never disagree — a turn at 00:30 SAST on
 * the 1st belongs to the new month, the same way it belongs to the new day.
 */
export function logMonth(day: LogDay): string {
  return day.slice(0, 7)
}

/** True if `value` is a well-formed `YYYY-MM-DD` that names a real date. */
export function isLogDay(value: string): value is LogDay {
  if (!DAY_PATTERN.test(value)) return false
  // Catches 2026-02-30 and 2026-13-01, which the pattern alone lets through.
  // Parsed as plain UTC midnight, deliberately — validating through
  // startOfLogDayUtc would shift the day back two hours and fail every date
  // against itself.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  )
}

/**
 * The UTC instant at which a SAST calendar day begins — 22:00 UTC the day
 * before. Used for range queries against `timestamptz` columns.
 */
export function startOfLogDayUtc(day: LogDay): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - SAST_OFFSET_MS)
}

/** Whole days from `from` to `to`, negative if `to` is earlier. */
export function daysBetween(from: LogDay, to: LogDay): number {
  const ms = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)
  return Math.round(ms / 86_400_000)
}

/** `day` shifted by `delta` calendar days. */
export function addDays(day: LogDay, delta: number): LogDay {
  const shifted = new Date(Date.parse(`${day}T00:00:00.000Z`) + delta * 86_400_000)
  return shifted.toISOString().slice(0, 10)
}

/**
 * Which day of the week a `LogDay` falls on. **0 is Sunday**, 6 is Saturday —
 * the same numbering `Date.getUTCDay()` uses, so it reads the way anyone
 * familiar with the platform expects.
 *
 * The day string is parsed as plain UTC midnight rather than through
 * `startOfLogDayUtc`, deliberately and for the same reason `isLogDay` does it:
 * shifting into real SAST would land on 22:00 the previous day and report the
 * wrong weekday for every date in the app.
 *
 * This lives here rather than in the component that draws the calendar strip
 * because a weekday is a date calculation, and `plan.md`'s standing rule puts
 * every one of those behind the single time authority.
 */
export function weekdayIndex(day: LogDay): number {
  return new Date(`${day}T00:00:00.000Z`).getUTCDay()
}

/**
 * The seven days of the calendar week containing `day`, oldest first.
 *
 * `weekStartsOn` is 0 (Sunday) by default because that is what the dashboard's
 * strip shows. South Africa conventionally starts a week on Monday, so this is
 * a display choice rather than a locale fact, which is exactly why it is a
 * parameter and not a constant — pass 1 and the same function returns
 * Monday-to-Sunday.
 *
 * The week is derived from the day rather than from the instant, so it inherits
 * the SAST boundary: at 00:40 SAST the strip already shows the new day, the
 * same way a meal logged at 00:40 belongs to it.
 */
export function weekOf(day: LogDay, weekStartsOn: number = 0): LogDay[] {
  const offset = (weekdayIndex(day) - weekStartsOn + 7) % 7
  const first = addDays(day, -offset)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

/** The day-of-month for a `LogDay`, unpadded — "27", not "27th" and not "05". */
export function dayOfMonth(day: LogDay): number {
  return Number(day.slice(8, 10))
}

export type LogDateBounds = {
  /** Today in SAST. Nothing may be logged after this. */
  today: LogDay
  /**
   * The user's earliest logged day, if they have one. Nothing may be logged
   * before it — a back-date into a period the user was not tracking would show
   * up as a trend point with no history behind it.
   */
  firstLogDay?: LogDay
}

export type LogDateRejection =
  | "malformed"
  | "in-the-future"
  | "before-first-log"

/**
 * Whether a user-supplied `date` may be written.
 *
 * Back-dating is a real feature, not a loophole, so this bounds it rather than
 * forbidding it. Returns the reason on failure because each one needs different
 * words on screen: a future date is a mistake, a pre-history date is a
 * limitation worth explaining.
 */
export function checkLogDate(
  date: string,
  bounds: LogDateBounds,
): { ok: true; day: LogDay } | { ok: false; reason: LogDateRejection } {
  if (!isLogDay(date)) return { ok: false, reason: "malformed" }
  if (daysBetween(bounds.today, date) > 0) {
    return { ok: false, reason: "in-the-future" }
  }
  if (bounds.firstLogDay && daysBetween(bounds.firstLogDay, date) < 0) {
    return { ok: false, reason: "before-first-log" }
  }
  return { ok: true, day: date }
}

/** Convenience wrapper for callers that only need a yes or no. */
export function isValidLogDate(date: string, bounds: LogDateBounds): boolean {
  return checkLogDate(date, bounds).ok
}
