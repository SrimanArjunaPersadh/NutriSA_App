import type { GoalDirection } from "@engine"

import { colors } from "@/design/tokens"

/**
 * How a goal direction is painted.
 *
 * The mapping is a design decision and lives here; deciding *which* direction a
 * change is, is arithmetic and lives in `goalDirection()` in the engine.
 *
 * `unchanged` is muted rather than green: a week that ended where it started is
 * neither a win nor a loss, and green would congratulate it.
 *
 * Shared by the dashboard's trend card and the Weight tab's hero, so the two
 * surfaces cannot disagree about what colour the same week is.
 */
export const DIRECTION_COLOR: Record<GoalDirection, string> = {
  toward: colors.ok,
  away: colors.danger,
  unchanged: colors.textSecondary,
}
