/**
 * The API contracts, as zod schemas, imported by both the Hono server and the
 * Expo client.
 *
 * ## One source of truth per contract
 *
 * AGENTS.md: "There is one source of truth per contract; never redeclare a
 * shape on one side." A hand-written `type DaySummary` on the client is not a
 * contract — it is a guess that compiles, and it keeps compiling for as long as
 * it takes someone to notice the server stopped sending that field.
 *
 * Everything here is a schema first and a type second (`z.infer`), so the same
 * declaration validates the response at runtime and types it at build time.
 *
 * ## What does not live here
 *
 * Arithmetic. This package shapes and validates; `packages/engine/` computes.
 * The one thing that looks like an exception is `meal-items.ts`, which renames
 * `pro` → `protein` on the way through — a translation between two vocabularies
 * for the same number, not a calculation on it.
 *
 * Unlike the engine, this package **may** take runtime dependencies: it needs
 * zod, and zod is already in the app bundle. The purity rule guarded by
 * `tests/engine-purity.test.ts` covers `packages/engine/` alone, deliberately.
 */

export {
  apiErrorSchema,
  logDaySchema,
  macrosSchema,
  type ApiError,
  type ApiErrorCode,
  type Macros,
} from "./common"

export {
  fromMacros,
  mealItemSchema,
  mealPortionSchema,
  parseMealItems,
  toMacros,
  type MealItem,
  type MealPortion,
} from "./meal-items"

export {
  averageIntakeSchema,
  dayMealItemSchema,
  dayMealSchema,
  daySummarySchema,
  intakePointSchema,
  streakSchema,
  type AverageIntakeResponse,
  type DayMeal,
  type DayMealItem,
  type DaySummary,
  type StreakResponse,
} from "./day"

export {
  clientIdSchema,
  deleteResultSchema,
  MAX_GRAMS,
  MAX_ITEMS,
  MAX_NAME_CHARS,
  MAX_WEIGHT_KG,
  mealPatchResultSchema,
  mealWriteResultSchema,
  patchMealSchema,
  targetRowSchema,
  targetsResponseSchema,
  targetsWriteResultSchema,
  weightWriteResultSchema,
  writeMacrosSchema,
  writeMealItemSchema,
  writeMealSchema,
  writePortionSchema,
  writeTargetsSchema,
  writeWeightSchema,
  type DeleteResult,
  type MealPatchResult,
  type MealWriteResult,
  type PatchMeal,
  type TargetRowResponse,
  type TargetsResponse,
  type TargetsWriteResult,
  type WeightWriteResult,
  type WriteMeal,
  type WriteTargets,
  type WriteWeight,
} from "./writes"

export {
  barcodeLookupSchema,
  barcodeSchema,
  foodDisplayName,
  foodOriginSchema,
  foodQuerySchema,
  foodSchema,
  foodSearchSchema,
  foodWriteResultSchema,
  MAX_FOOD_QUERY_CHARS,
  mealSlotSchema,
  offStatusSchema,
  recentFoodsSchema,
  writeFoodSchema,
  type BarcodeLookup,
  type Food,
  type FoodOrigin,
  type FoodSearch,
  type FoodWriteResult,
  type OffStatus,
  type RecentFoods,
  type WriteFood,
} from "./foods"

export {
  MAX_CATEGORY_CHARS,
  MAX_NOTE_CHARS,
  patchSavedMealSchema,
  savedMealSchema,
  savedMealsSchema,
  savedMealWriteResultSchema,
  writeSavedMealSchema,
  type PatchSavedMeal,
  type SavedMeal,
  type SavedMeals,
  type SavedMealWriteResult,
  type WriteSavedMeal,
} from "./saved-meals"

export {
  commonMeasure,
  measureFromServingSize,
  measureSchema,
  naturalMeasure,
  suggestedWeight,
  weightFromQty,
} from "./measures"

export {
  goalProgressSchema,
  projectionSchema,
  trendChangeSchema,
  trendPointSchema,
  weightEntrySchema,
  weightRangeSchema,
  weightSeriesSchema,
  type GoalProgressResponse,
  type ProjectionResponse,
  type TrendChangeResponse,
  type TrendPointResponse,
  type WeightEntry,
  type WeightRange,
  type WeightSeries,
} from "./weight"
