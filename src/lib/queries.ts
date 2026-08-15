import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/expo"

import { currentLoggingDay, type LogDay } from "@engine"
import {
  daySummarySchema,
  weightSeriesSchema,
  type DaySummary,
  type WeightSeries,
} from "@shared"

import { apiGet, ApiError } from "@/lib/api"

/**
 * The dashboard's queries.
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
  weightSeries: (userId: string | null | undefined, days: number | "all") =>
    ["weight-logs", userId ?? "anonymous", days] as const,
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
