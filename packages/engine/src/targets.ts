import type { Macros } from "./macros"
import type { LogDay } from "./time"

/**
 * Effective-dated macro targets.
 *
 * A target row records what the targets became on `validFrom` and stays in
 * force until a later row supersedes it. There is deliberately **no `valid_to`**
 * column: two columns describing one boundary can disagree, and the day they do,
 * a stretch of history either resolves to two targets or to none. One column
 * cannot contradict itself.
 *
 * This is why editing targets never rewrites the past. A day in March keeps
 * resolving to March's targets after a change in May, so an old day's
 * "remaining" is still the number the user was actually working to.
 */

export type TargetRow = Macros & {
  /** The SAST day these targets took effect. */
  validFrom: LogDay
}

/**
 * The targets in force on `day` — the row with the greatest `validFrom` that is
 * not after it.
 *
 * Returns null when the user has no target row at or before that day, which is
 * a real state rather than an error: it is every day before they first set
 * targets. Callers show the empty state instead of dividing by a zero target.
 */
export function resolveTargetForDate(
  targets: readonly TargetRow[],
  day: LogDay,
): TargetRow | null {
  let resolved: TargetRow | null = null

  for (const row of targets) {
    if (row.validFrom > day) continue
    // `>=` rather than `>`: if two rows share a validFrom the later one in the
    // array wins, which matches Postgres returning the most recently inserted
    // of a tie. The UNIQUE (user_id, valid_from) constraint should make this
    // unreachable — this is what happens if it ever is not.
    if (!resolved || row.validFrom >= resolved.validFrom) resolved = row
  }

  return resolved
}
