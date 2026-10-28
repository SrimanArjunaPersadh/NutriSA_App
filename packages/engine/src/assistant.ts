import { roundTo } from "./round"
import { addDays, logMonth, startOfLogDayUtc, type LogDay } from "./time"

/**
 * The assistant's money and safety lines (plan.md, Phase 9, Q2, Q8 and Q31).
 *
 * They live here because each one decides something a user sees: whether a
 * turn is answered, by which model, and whether the coach treats a target as
 * too low. The model is told the outcome; it never makes the comparison.
 */

/**
 * The most AI spend one user may run up in a SAST calendar month, in USD,
 * counting every `ai_usage` row: chat and label reads alike (Q2, 2026-10-28).
 *
 * Half the $10 Console cap. The other half absorbs what the ledger can miss: a
 * call that timed out before its usage arrived, or a ledger write that failed
 * after its retries.
 */
export const AI_MONTHLY_BUDGET_USD = 5

/** From here to the budget, the month continues on the cheaper model (Q8). */
export const AI_CHEAPER_RUNG_USD = 4

/**
 * - `full`: the chat model
 * - `cheaper`: the fallback model for the rest of the month, with a notice
 * - `exhausted`: no model call at all, chat or label read, until the month turns
 *
 * The one list: the shared schemas and the turn runner take theirs from here.
 */
export const AI_BUDGET_RUNGS = ["full", "cheaper", "exhausted"] as const

export type AiBudgetRung = (typeof AI_BUDGET_RUNGS)[number]

/** The rungs a reply can be answered on. */
export type AiAnsweringRung = Exclude<AiBudgetRung, "exhausted">

/**
 * Which rung a month's spend puts the user on. Both lines are inclusive: at
 * exactly $4 the cheaper model takes over, and at exactly $5 the month is spent.
 */
export function aiBudgetRung(spentUsd: number): AiBudgetRung {
  if (spentUsd >= AI_MONTHLY_BUDGET_USD) return "exhausted"
  if (spentUsd >= AI_CHEAPER_RUNG_USD) return "cheaper"
  return "full"
}

export type AiBudgetMonth = {
  /** The first SAST day of the month `today` falls in. */
  firstDay: LogDay
  /** The first SAST day of the next month: when the allowance resets. */
  resetsOn: LogDay
  /** The ledger window as UTC instants, `from` inclusive and `to` exclusive. */
  fromUtc: Date
  toUtc: Date
}

/**
 * The SAST month the budget gate sums, as both days and the UTC range for the
 * `ai_usage.ts` query. A month starts at SAST midnight on the 1st, which is
 * 22:00 UTC on the last day of the month before.
 */
export function aiBudgetMonth(today: LogDay): AiBudgetMonth {
  const firstDay = `${logMonth(today)}-01`
  // The 1st plus 31 days always lands early in the next month, never past it.
  const resetsOn = `${logMonth(addDays(firstDay, 31))}-01`
  return {
    firstDay,
    resetsOn,
    fromUtc: startOfLogDayUtc(firstDay),
    toUtc: startOfLogDayUtc(resetsOn),
  }
}

/**
 * The coach's floor, in kcal a day (Q31, 2026-10-28). The coach never suggests
 * eating below it, and suggests a doctor when a target already is.
 *
 * A common general guideline for unsupervised dieting, not personal medical
 * advice, which is why the coach's words point to a doctor rather than calling
 * any figure safe. It is not `TARGET_BOUNDS.kcal.min` (500): that one catches a
 * typo on the Goals screen and stays separate.
 */
export const COACH_KCAL_FLOOR = 1200

/** Whether a daily kcal figure is under the coach's floor. */
export function belowSafeFloor(kcal: number): boolean {
  return kcal < COACH_KCAL_FLOOR
}

/**
 * The quantity of `count` servings of a food, in the serving's own unit: two
 * 50 g eggs is 100 g. For the assistant's meal card, where the user says "two
 * eggs" and the model copies the 2; the multiplication happens here.
 *
 * To one decimal, the precision the logger stores. Zero for a count or serving
 * that is not a positive number, so a bad input becomes an empty line rather
 * than a NaN on the card.
 */
export function servingsQuantity(count: number, serving: number): number {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(serving) || serving <= 0) return 0
  return roundTo(count * serving, 1)
}

