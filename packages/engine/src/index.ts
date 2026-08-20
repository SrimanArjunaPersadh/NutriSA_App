/**
 * The deterministic engine. Pure TypeScript, zero runtime dependencies, no DB
 * access and no imports from `server/` or `src/` — that is what lets it be
 * tested in isolation and imported by both sides.
 *
 * Every number a user sees comes from here. Nothing downstream — least of all
 * the model — is allowed to do the arithmetic itself.
 */

export { roundTo } from "./round"

export {
  currentLoggingDay,
  toLogDay,
  logMonth,
  isLogDay,
  startOfLogDayUtc,
  daysBetween,
  addDays,
  weekdayIndex,
  weekOf,
  dayOfMonth,
  checkLogDate,
  isValidLogDate,
  type LogDay,
  type LogDateBounds,
  type LogDateRejection,
} from "./time"

export {
  trendWeightSeries,
  latestTrend,
  loggedPoints,
  trendChangeOverDays,
  type WeightEntry,
  type TrendPoint,
  type TrendChange,
} from "./trend"

export {
  dayTotals,
  sumMacros,
  normaliseMacros,
  remainingMacros,
  macroProgress,
  ZERO_MACROS,
  type Macros,
  type LoggedItem,
} from "./macros"

export {
  macroEnergyShares,
  dominantMacro,
  ATWATER,
  NO_SHARES,
  type MacroShares,
} from "./energy"

export {
  isPortionUnit,
  portionLabel,
  scalePortion,
  PORTION_BASIS,
  PORTION_UNITS,
  type PortionUnit,
} from "./portions"

export {
  averageDailyIntake,
  type AverageIntake,
  type DayIntake,
  type IntakePoint,
} from "./intake"

export { resolveTargetForDate, type TargetRow } from "./targets"

export { nextSortOrder } from "./ordering"

export {
  currentStreak,
  longestStreak,
  NO_STREAK,
  type Streak,
} from "./streak"

export {
  evenlySpaced,
  niceScale,
  type Scale,
  type ScaleOptions,
} from "./chart"

export {
  goalDirection,
  goalProgress,
  projectTrend,
  type GoalDirection,
  type GoalProgress,
  type Projection,
  type ProjectionOptions,
  type ProjectionPoint,
} from "./goal"

export {
  computeUsageCost,
  sumUsageCosts,
  CURRENT_RATE_VERSION,
  type ModelId,
  type RateVersion,
  type TokenUsage,
  type UsageCost,
} from "./cost"
