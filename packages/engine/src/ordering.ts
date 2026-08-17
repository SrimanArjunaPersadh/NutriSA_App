/**
 * Where a newly logged meal sits in its day.
 *
 * ## Why this is here rather than in the route that writes the row
 *
 * `sort_order` is what the day view orders by — never `created_at`, so that a
 * back-dated meal lands where it belongs in the day rather than at the bottom
 * of it. That makes the position a **computed number the user sees**, and
 * plan.md's first standing rule puts every one of those in this package. The
 * alternative was `Math.max(...existing) + 1` inlined in a data module, which
 * is arithmetic in exactly the place the rule forbids it.
 *
 * ## Why the server computes it and not the client
 *
 * The client knows the day it just fetched. Two devices, or one device with a
 * stale query cache, both know a day that no longer exists — and both would
 * mint the same position for two different meals, leaving the day view to break
 * the tie arbitrarily. The server is the only party that can see the day as it
 * is at the moment of the write.
 */

/**
 * The position a new entry takes at the end of `existing`.
 *
 * Gaps and duplicates in the input are fine and are left alone: this answers
 * "what goes last", not "renumber the day". A day whose positions are 0, 0, 5
 * is not tidy, but it is what a reorder or a partially-migrated row can leave
 * behind, and renumbering it here would silently move meals the user did not
 * touch.
 *
 * An empty day starts at 0 rather than 1 — the same base the column defaults
 * to, so a row written before this existed still sorts first.
 */
export function nextSortOrder(existing: readonly number[]): number {
  let highest = -1
  for (const position of existing) {
    // NaN and Infinity cannot come out of an `integer` column, but they can
    // come out of a bad cast, and either would poison every later comparison.
    if (!Number.isFinite(position)) continue
    if (position > highest) highest = position
  }
  return highest + 1
}
