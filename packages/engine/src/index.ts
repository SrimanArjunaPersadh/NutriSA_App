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
  currentClockTime,
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
  amountOver,
  macroProgress,
  ZERO_MACROS,
  type Macros,
  type LoggedItem,
} from "./macros"

export {
  macroEnergyShares,
  kcalFromMacros,
  labelKcal,
  dominantMacro,
  ATWATER,
  NO_SHARES,
  type MacroShares,
} from "./energy"

export {
  fractionOfQuantity,
  isPortionUnit,
  portionLabel,
  portionRange,
  quantityAtFraction,
  scalePortion,
  servingPresets,
  stepQuantity,
  amountForMeasure,
  gramsPerMeasure,
  isSayableCount,
  measureCount,
  measureLabel,
  pluralNoun,
  perHundredFrom,
  isPlausibleWeight,
  PORTION_BASIS,
  PORTION_UNITS,
  type PortionRange,
  type PortionUnit,
  type ServingPreset,
  type Measure,
} from "./portions"

export { kcalFromKj, KJ_PER_KCAL, MEAL_SLOTS, mealNameFor, slotOfMeal, type MealSlot } from "./foods"

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
  rateDirection,
  type GoalDirection,
  type GoalProgress,
  type Projection,
  type ProjectionOptions,
  type ProjectionPoint,
} from "./goal"

export {
  labelFoodDraft,
  type LabelFoodDraft,
  type LabelNumbers,
  type LabelPer,
} from "./label"

export {
  aiBudgetMonth,
  aiBudgetRung,
  aiSpendShown,
  belowSafeFloor,
  servingsQuantity,
  AI_BUDGET_RUNGS,
  AI_CHEAPER_RUNG_USD,
  AI_MONTHLY_BUDGET_USD,
  COACH_KCAL_FLOOR,
  type AiAnsweringRung,
  type AiBudgetMonth,
  type AiBudgetRung,
} from "./assistant"

export {
  computeUsageCost,
  sumUsageCosts,
  CURRENT_RATE_VERSION,
  type ModelId,
  type RateVersion,
  type TokenUsage,
  type UsageCost,
} from "./cost"
