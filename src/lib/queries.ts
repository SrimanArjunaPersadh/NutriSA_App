import { keepPreviousData, useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/expo"

import { currentLoggingDay, type LogDay, type MealSlot } from "@engine"
import {
  barcodeLookupSchema,
  daySummarySchema,
  deleteResultSchema,
  foodSearchSchema,
  foodWriteResultSchema,
  recentFoodsSchema,
  savedMealSchema,
  savedMealsSchema,
  savedMealWriteResultSchema,
  mealPatchResultSchema,
  mealWriteResultSchema,
  profileSchema,
  targetsResponseSchema,
  targetsWriteResultSchema,
  weightSeriesSchema,
  weightWriteResultSchema,
  type BarcodeLookup,
  type DaySummary,
  type DeleteResult,
  type FoodSearch,
  type FoodWriteResult,
  type MealPatchResult,
  type MealWriteResult,
  type PatchMeal,
  type PatchSavedMeal,
  type Profile,
  type RecentFoods,
  type SavedMeal,
  type SavedMeals,
  type SavedMealWriteResult,
  type TargetsResponse,
  type TargetsWriteResult,
  type WeightSeries,
  type WeightWriteResult,
  type WriteFood,
  type WriteMeal,
  type WriteProfile,
  type WriteSavedMeal,
  type WriteTargets,
  type WriteWeight,
} from "@shared"

import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from "@/lib/api"

/**
 * Every query and mutation the app makes.
 *
 * The reads came first, for the dashboard; the three meal mutations at the
 * bottom arrived with the logging surface. They live in one module because they
 * share the cache keys — a write's only job after it succeeds is to invalidate
 * the reads, and a mutation in another file would be reaching across for the
 * key builder anyway.
 *
 * ## Keys
 *
 * Every key starts with the Clerk user id. Two accounts on one phone would
 * otherwise share cache entries — sign out, sign in as someone else, and the
 * previous user's day summary is served from cache before the refetch lands.
 * That is health data on a stranger's screen, and it is the exact failure the
 * Phase 3 checklist calls "a signed-out state that doesn't leak cached health
 * data". The cache is also cleared on sign-out (see `_layout.tsx`); this is the
 * second lock on the same door, because one of them is bound to be forgotten
 * during a refactor and they fail in different ways.
 */

export const queryKeys = {
  day: (userId: string | null | undefined, date: string) =>
    ["day", userId ?? "anonymous", date] as const,
  /**
   * Every day this user has cached.
   *
   * The prefix the mutations invalidate. See `useInvalidateDays` for why it is
   * every day and not the one that changed.
   */
  allDays: (userId: string | null | undefined) => ["day", userId ?? "anonymous"] as const,
  weightSeries: (userId: string | null | undefined, days: number | "all") =>
    ["weight-logs", userId ?? "anonymous", days] as const,
  /**
   * Every window of the series this user has cached.
   *
   * The prefix a weigh-in invalidates. One weigh-in moves 30-day, 90-day and
   * all-time alike — they are three slices of one computation, not three
   * datasets — so there is no version of this that invalidates only the range
   * currently on screen and stays correct.
   */
  allWeightSeries: (userId: string | null | undefined) =>
    ["weight-logs", userId ?? "anonymous"] as const,
  foodSearch: (userId: string | null | undefined, query: string) =>
    ["foods", userId ?? "anonymous", "search", query] as const,
  /** Under "search" too, so invalidating searches reaches both halves. */
  localFoodSearch: (userId: string | null | undefined, query: string) =>
    ["foods", userId ?? "anonymous", "search", "local", query] as const,
  /** Every slot's list sits under the bare key, so one invalidation reaches all four. */
  recentFoods: (userId: string | null | undefined, slot?: MealSlot) =>
    slot
      ? (["foods", userId ?? "anonymous", "recent", slot] as const)
      : (["foods", userId ?? "anonymous", "recent"] as const),
  barcode: (userId: string | null | undefined, code: string) =>
    ["foods", userId ?? "anonymous", "barcode", code] as const,
  savedMeals: (userId: string | null | undefined) => ["saved-meals", userId ?? "anonymous"] as const,
  targets: (userId: string | null | undefined) => ["targets", userId ?? "anonymous"] as const,
  profile: (userId: string | null | undefined) => ["profile", userId ?? "anonymous"] as const,
  /** Everything food-shaped this user has cached. What creating a food invalidates. */
  allFoods: (userId: string | null | undefined) => ["foods", userId ?? "anonymous"] as const,
}

/**
 * Retry policy shared by both queries.
 *
 * A 401 or a 400 is never retried: neither will succeed on a second attempt,
 * and retrying a 401 three times just delays the sign-in prompt by a few
 * seconds. Transport failures are retried twice — Neon's free tier suspends
 * when idle and the first request after a quiet spell can fail outright while
 * the compute wakes.
 */
function retry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.code === "unauthenticated" || error.code === "bad-request") return false
    if (error.code === "malformed-response") return false
  }
  return failureCount < 2
}

/**
 * One day, fully computed by the server.
 *
 * Defaults to today from `currentLoggingDay()` — the single time authority.
 * The date is still resolved here and sent explicitly rather than letting the
 * route's `today` alias decide, so the key the cache is stored under names the
 * day it actually holds. With `/day/today` as the key, an app left open across
 * midnight would keep serving yesterday under a key that claims to mean now.
 */
export function useDaySummary(date: LogDay = currentLoggingDay()) {
  const { userId, getToken, isSignedIn } = useAuth()

  return useQuery<DaySummary, ApiError>({
    queryKey: queryKeys.day(userId, date),
    queryFn: () => apiGet(`/api/day/${date}`, daySummarySchema, getToken),
    enabled: Boolean(isSignedIn),
    // A day's totals change only when the user logs something, and this app is
    // the only thing that can. Refetching on every screen focus would spend a
    // request to be told the same numbers.
    staleTime: 60_000,
    retry,
  })
}

/**
 * The weight series, windowed for display.
 *
 * `days` narrows what is drawn; the trend behind it is always computed over the
 * full history server-side. See `server/data/weight.ts`.
 */
export function useWeightSeries(days: number | "all" = 30) {
  const { userId, getToken, isSignedIn } = useAuth()

  return useQuery<WeightSeries, ApiError>({
    queryKey: queryKeys.weightSeries(userId, days),
    queryFn: () =>
      apiGet(`/api/weight-logs?days=${days}`, weightSeriesSchema, getToken),
    enabled: Boolean(isSignedIn),
    // Weight moves once a day at most, and only when the user steps on a scale.
    staleTime: 5 * 60_000,
    retry,
  })
}

/**
 * Throw away every cached day after a write.
 *
 * ## Why invalidate rather than patch the cache
 *
 * A logged meal moves the day's totals, the three rings, the remaining macros,
 * the seven-day average, the week strip's dots and possibly the streak — and
 * **every one of those is the engine's answer**, computed server-side from
 * rows this client does not hold. Patching them in by hand would be arithmetic
 * in a component, which is the first standing rule, and it would be arithmetic
 * that silently disagrees with the server until the next refetch.
 *
 * ## Why every day and not just the one that changed
 *
 * `GET /day/:date` carries three things measured against **today** regardless
 * of which date was asked for: the streak, the trailing seven-day average, and
 * `loggedDays`. Log a meal on Tuesday and Friday's cached response is stale
 * too. The cache holds a handful of days at most, so refetching them is
 * cheaper than reasoning about which ones escaped.
 *
 * Only the *active* queries actually refetch — React Query marks the rest
 * stale and refetches when something mounts them.
 */
function useInvalidateDays() {
  const { userId } = useAuth()
  const client = useQueryClient()

  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.allDays(userId) }),
      // Recent foods are read out of the logged meals, so every meal write
      // moves them too — a food logged a minute ago should be at the top of
      // the list the next time the logger opens. So does search, which leads
      // with "your foods" from the same meals.
      client.invalidateQueries({ queryKey: queryKeys.recentFoods(userId) }),
      client.invalidateQueries({ queryKey: ["foods", userId ?? "anonymous", "search"] }),
    ])
}

/**
 * Log a meal.
 *
 * ## The id comes from the caller
 *
 * `input` carries the client-minted UUIDv7, and this hook does not mint one.
 * That is the whole idempotency contract: a save whose response was lost has to
 * be retried with the **same** id to be answered "already logged" rather than
 * logging the meal twice, and only the surface holding the form knows whether
 * the user is retrying a failed save or starting a new one. `src/lib/uuid.ts`
 * says the same thing from the other end.
 *
 * ## No optimistic update
 *
 * The screen shows a saving state and waits. An optimistic meal would have to
 * carry totals, a position in the day and a streak — every one of them a number
 * the engine owns and the client would be guessing at, for the two hundred
 * milliseconds before the real answer arrives.
 */
export function useLogMeal() {
  const { getToken } = useAuth()
  const invalidateDays = useInvalidateDays()

  return useMutation<MealWriteResult, ApiError, WriteMeal>({
    mutationFn: (input) =>
      apiPost("/api/meal-logs", input, mealWriteResultSchema, getToken),
    onSuccess: () => void invalidateDays(),
  })
}

/**
 * Correct a meal that is already logged.
 *
 * `patch` carries only what changed — see `patchMealSchema`, which refuses an
 * empty one. A patch that moves the meal to another day answers with both the
 * new date and the one it left, and both are invalidated by the blanket
 * invalidation above.
 */
export function useUpdateMeal() {
  const { getToken } = useAuth()
  const invalidateDays = useInvalidateDays()

  return useMutation<MealPatchResult, ApiError, { id: string; patch: PatchMeal }>({
    mutationFn: ({ id, patch }) =>
      apiPatch(`/api/meal-logs/${id}`, patch, mealPatchResultSchema, getToken),
    onSuccess: () => void invalidateDays(),
  })
}

/**
 * Remove a logged meal.
 *
 * Answers 200 with `deleted: false` when there was nothing to remove, which is
 * a success and not an error — the route refuses to say whether an id it cannot
 * see exists. The day is invalidated either way: if the meal was already gone,
 * the refetch is what tells this client so.
 */
export function useDeleteMeal() {
  const { getToken } = useAuth()
  const invalidateDays = useInvalidateDays()

  return useMutation<DeleteResult, ApiError, string>({
    mutationFn: (id) => apiDelete(`/api/meal-logs/${id}`, deleteResultSchema, getToken),
    onSuccess: () => void invalidateDays(),
  })
}

/**
 * Throw away every cached weight window after a weigh-in is written or removed.
 *
 * The mirror of `useInvalidateDays`, and separate from it on purpose: the day
 * summary carries no weight and the weight series carries no macros, so a meal
 * write has nothing to say to this cache and a weigh-in has nothing to say to
 * the other. Invalidating both from both would double the refetches after every
 * save to keep one line of code shorter.
 */
function useInvalidateWeight() {
  const { userId } = useAuth()
  const client = useQueryClient()

  return () => client.invalidateQueries({ queryKey: queryKeys.allWeightSeries(userId) })
}

/**
 * Record a weigh-in.
 *
 * ## The id comes from the caller, same as a meal
 *
 * And for the same reason — a retried save must carry the id its first attempt
 * carried, or a lost response becomes a second row. Here the stakes are a
 * little different: a fresh id retried onto the same day does not duplicate the
 * weigh-in, because `(user_id, date)` is unique and the server upserts. It
 * comes back `replaced: true` instead, which would tell the user their reading
 * overwrote an earlier one when it overwrote its own first attempt.
 *
 * ## Nothing here computes a trend
 *
 * The raw scale reading goes up; the trend comes back down from the server,
 * where the engine has the whole history to run over. A client that adjusted
 * the trend line optimistically would be doing the one arithmetic this project
 * does not allow, on the one number the whole screen exists to show.
 */
export function useLogWeight() {
  const { getToken } = useAuth()
  const invalidateWeight = useInvalidateWeight()

  return useMutation<WeightWriteResult, ApiError, WriteWeight>({
    mutationFn: (input) =>
      apiPost("/api/weight-logs", input, weightWriteResultSchema, getToken),
    onSuccess: () => void invalidateWeight(),
  })
}

/**
 * Remove a weigh-in.
 *
 * Answers `deleted: false` when there was nothing to remove, which is a success
 * — the route refuses to say whether an id it cannot see exists. The series is
 * refetched either way, because removing a point re-runs the trend over every
 * day after it and the client holds none of the arithmetic that would produce.
 */
export function useDeleteWeight() {
  const { getToken } = useAuth()
  const invalidateWeight = useInvalidateWeight()

  return useMutation<DeleteResult, ApiError, string>({
    mutationFn: (id) => apiDelete(`/api/weight-logs/${id}`, deleteResultSchema, getToken),
    onSuccess: () => void invalidateWeight(),
  })
}

/**
 * Food search — the user's own foods, the shared ones, then Open Food Facts.
 *
 * `query` must already be debounced by the caller. This hook fires on every
 * value it is given, and an undebounced search box would spend the server's
 * per-minute OFF budget on "c", "ch" and "chi".
 *
 * `keepPreviousData`, so the list under the thumb holds still while the next
 * query is in flight instead of blanking to a spinner on every keystroke.
 */
export function useFoodSearch(query: string) {
  const { userId, getToken, isSignedIn } = useAuth()
  const trimmed = query.trim()

  return useQuery<FoodSearch, ApiError>({
    queryKey: queryKeys.foodSearch(userId, trimmed.toLowerCase()),
    queryFn: () =>
      apiGet(`/api/foods/search?q=${encodeURIComponent(trimmed)}`, foodSearchSchema, getToken),
    enabled: Boolean(isSignedIn) && trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry,
  })
}

/**
 * The fast half of a search: your foods and the saved ones, no Open Food Facts.
 * The logger shows this the moment it lands and fills in `useFoodSearch`'s
 * fuller answer when that arrives (2026-10-20, "searching is quite slow").
 */
export function useLocalFoodSearch(query: string) {
  const { userId, getToken, isSignedIn } = useAuth()
  const trimmed = query.trim()

  return useQuery<FoodSearch, ApiError>({
    queryKey: queryKeys.localFoodSearch(userId, trimmed.toLowerCase()),
    queryFn: () =>
      apiGet(`/api/foods/search/local?q=${encodeURIComponent(trimmed)}`, foodSearchSchema, getToken),
    enabled: Boolean(isSignedIn) && trimmed.length > 0,
    staleTime: 60_000,
    retry,
  })
}

/**
 * What the logger shows before anything is typed: "Usually at breakfast" when
 * `slot` is Breakfast — the foods eaten at that meal first.
 */
export function useRecentFoods(slot?: MealSlot) {
  const { userId, getToken, isSignedIn } = useAuth()

  return useQuery<RecentFoods, ApiError>({
    queryKey: queryKeys.recentFoods(userId, slot),
    queryFn: () =>
      apiGet(`/api/foods/recent${slot ? `?slot=${slot}` : ""}`, recentFoodsSchema, getToken),
    // Switching meals keeps the old list up until the new one lands, rather
    // than flashing a spinner between two lists that mostly overlap.
    placeholderData: keepPreviousData,
    enabled: Boolean(isSignedIn),
    staleTime: 60_000,
    retry,
  })
}

/**
 * One barcode, local first, then Open Food Facts. `null` while nothing has
 * been scanned yet.
 *
 * Cached for the session: a barcode's product does not change between two
 * scans of the same packet, and the server never re-fetches a resolved one
 * either.
 */
export function useBarcodeLookup(code: string | null) {
  const { userId, getToken, isSignedIn } = useAuth()

  return useQuery<BarcodeLookup, ApiError>({
    queryKey: queryKeys.barcode(userId, code ?? ""),
    queryFn: () =>
      apiGet(`/api/foods/barcode/${encodeURIComponent(code ?? "")}`, barcodeLookupSchema, getToken),
    enabled: Boolean(isSignedIn) && code !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry,
  })
}

/**
 * Create a food of the user's own. The id comes from the caller, for the same
 * idempotency reason as every other create — see `useLogMeal`.
 */
export function useCreateFood() {
  const { userId, getToken } = useAuth()
  const client = useQueryClient()

  return useMutation<FoodWriteResult, ApiError, WriteFood>({
    mutationFn: (input) => apiPost("/api/foods", input, foodWriteResultSchema, getToken),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.allFoods(userId) }),
  })
}

/**
 * Every saved meal, by name. One list, read whole: the library, the logger's
 * strip and the detail screen all draw from it, so an edit in one shows in all
 * three after a single invalidation.
 */
export function useSavedMeals() {
  const { userId, getToken, isSignedIn } = useAuth()

  return useQuery<SavedMeals, ApiError>({
    queryKey: queryKeys.savedMeals(userId),
    queryFn: () => apiGet("/api/saved-meals", savedMealsSchema, getToken),
    enabled: Boolean(isSignedIn),
    staleTime: 5 * 60_000,
    retry,
  })
}

function useInvalidateSavedMeals() {
  const { userId } = useAuth()
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: queryKeys.savedMeals(userId) })
}

/** Save a meal to the library. Client-minted id, as every create. */
export function useCreateSavedMeal() {
  const { getToken } = useAuth()
  const invalidate = useInvalidateSavedMeals()

  return useMutation<SavedMealWriteResult, ApiError, WriteSavedMeal>({
    mutationFn: (input) =>
      apiPost("/api/saved-meals", input, savedMealWriteResultSchema, getToken),
    onSuccess: () => void invalidate(),
  })
}

export function useUpdateSavedMeal() {
  const { getToken } = useAuth()
  const invalidate = useInvalidateSavedMeals()

  return useMutation<SavedMeal, ApiError, { id: string; patch: PatchSavedMeal }>({
    mutationFn: ({ id, patch }) =>
      apiPatch(`/api/saved-meals/${id}`, patch, savedMealSchema, getToken),
    onSuccess: () => void invalidate(),
  })
}

export function useDeleteSavedMeal() {
  const { getToken } = useAuth()
  const invalidate = useInvalidateSavedMeals()

  return useMutation<DeleteResult, ApiError, string>({
    mutationFn: (id) => apiDelete(`/api/saved-meals/${id}`, deleteResultSchema, getToken),
    onSuccess: () => void invalidate(),
  })
}

/**
 * The targets in force today, and every set on record. The Goals screen's
 * read; the Dashboard does not use it, because `GET /day/:date` already
 * resolves the targets for the day it is showing.
 */
export function useTargets() {
  const { userId, getToken, isSignedIn } = useAuth()

  return useQuery<TargetsResponse, ApiError>({
    queryKey: queryKeys.targets(userId),
    queryFn: () => apiGet("/api/targets", targetsResponseSchema, getToken),
    enabled: Boolean(isSignedIn),
    staleTime: 5 * 60_000,
    retry,
  })
}

/**
 * Set the targets, from today.
 *
 * ## What it invalidates, and why both
 *
 * Every cached day, because the day summary is where the Dashboard's calorie
 * and macro cards read their targets: `GET /day/:date` resolves the target for
 * that day server-side, and "remaining" and the rings are the engine's answer
 * against it. Patching them in here would be arithmetic in the client. And the
 * targets read itself, so the Goals screen reopens on what was saved.
 *
 * The id comes from the caller, as with every create: a retry must carry the
 * id its first attempt carried. See `useLogWeight` for why that matters even
 * on a route that upserts.
 */
export function useSetTargets() {
  const { userId, getToken } = useAuth()
  const client = useQueryClient()

  return useMutation<TargetsWriteResult, ApiError, WriteTargets>({
    mutationFn: (input) => apiPost("/api/targets", input, targetsWriteResultSchema, getToken),
    onSuccess: () =>
      void Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.allDays(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.targets(userId) }),
      ]),
  })
}

/** The goal weight, or null. The Goals screen's other read. */
export function useProfile() {
  const { userId, getToken, isSignedIn } = useAuth()

  return useQuery<Profile, ApiError>({
    queryKey: queryKeys.profile(userId),
    queryFn: () => apiGet("/api/profile", profileSchema, getToken),
    enabled: Boolean(isSignedIn),
    staleTime: 5 * 60_000,
    retry,
  })
}

/**
 * Set or clear the goal weight.
 *
 * Invalidates every cached weight window as well as the profile, because the
 * goal reaches the rest of the app only through the weight series: the
 * Dashboard's weight card, the Weight tab's goal card and the chart's goal line
 * all read `goalWeightKg` and `goal` off `GET /weight-logs`. `goal.progress` and
 * `remainingKg` are the engine's, so the series is refetched rather than
 * patched.
 */
export function useSetProfile() {
  const { userId, getToken } = useAuth()
  const client = useQueryClient()

  return useMutation<Profile, ApiError, WriteProfile>({
    mutationFn: (input) => apiPut("/api/profile", input, profileSchema, getToken),
    onSuccess: () =>
      void Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.allWeightSeries(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.profile(userId) }),
      ]),
  })
}
