import { QueryClient } from "@tanstack/react-query"

/**
 * The one React Query client, and the defaults every query inherits.
 *
 * Module-level rather than created inside a component. A client rebuilt on a
 * render would take the whole cache with it, and this one is mounted at the
 * root where a re-render is exactly what happens when auth state settles.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * No automatic refetch on window focus.
       *
       * React Native fires the equivalent on every return from the background,
       * and this app's data only changes when the user logs something in it.
       * The dashboard already refetches when its own stale time lapses.
       */
      refetchOnWindowFocus: false,
      /**
       * Failed queries are not retried by default — each query opts in with its
       * own policy, because "retry three times" is wrong for a 401 and right
       * for a dropped connection, and the difference is the point.
       */
      retry: false,
    },
  },
})

/**
 * Wipes every cached response. Called on sign-out.
 *
 * `clear()` and not `invalidateQueries()`: invalidation marks entries stale but
 * **leaves the data in memory**, so a component that mounts before the refetch
 * resolves is handed the previous user's numbers to render. That is the leak
 * plan.md's Phase 3 item names — "a signed-out state that doesn't leak cached
 * health data" — and until this branch there was no cache for it to describe,
 * which is why it sat unverifiable for months.
 *
 * `removeQueries()` would also do it. `clear()` is preferred because it needs
 * no filter argument, and a filter is the thing that quietly stops matching
 * when a key shape changes.
 */
export function clearQueryCache(): void {
  queryClient.clear()
}
