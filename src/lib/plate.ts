import { useSyncExternalStore } from "react"

import type { DraftItem } from "@/lib/meal-draft"

/**
 * The plate: the meal being assembled in the food logger, before it is logged.
 *
 * MacroFactor's model, and the one `src/design/nutrition_ui.png` draws — the
 * "0 / 2476" pill and the row of food icons at the top of that screen are the
 * plate in its minified form. Foods go onto it from search, recents, a scan or
 * Quick Add; Log Foods writes the whole plate as one meal.
 *
 * ## Why a module store and not component state
 *
 * The plate outlives the screen it is built on. Creating a food pushes a
 * second screen, and the food it creates has to land on the plate the first
 * screen is holding. Passing it back through route params would mean
 * serialising a draft into a URL; lifting state into the root layout would
 * re-render the whole app on every `+`. A store the size of an array, read with
 * `useSyncExternalStore`, is the smallest thing that does the job.
 *
 * ## What it holds is health data
 *
 * Lines of food somebody is about to eat. `clearPlate()` is called from
 * `clearQueryCache()` on sign-out for the same reason the query cache is
 * cleared there: the next person to sign in on this phone must not open the
 * logger to someone else's lunch.
 *
 * The lines are `DraftItem`s — the meal form's own line shape — so everything
 * the form already does (engine totals, `toWriteItem`, the debounce) applies
 * to the plate without a second vocabulary.
 */

let items: readonly DraftItem[] = []
const listeners = new Set<() => void>()

/**
 * The meal-log id this plate is to be logged under, when it came from an
 * assistant meal card's Edit (Phase 9, A2). The card's id was minted by the
 * server when the card was made, and logging under it is what turns the card
 * to Logged and makes a later Confirm log nothing twice. Null for an ordinary
 * plate, which mints its own id when it is logged.
 */
let mealId: string | null = null

function set(next: readonly DraftItem[]) {
  items = next
  if (next.length === 0) mealId = null
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The plate's lines, in the order they were added. */
export function usePlate(): readonly DraftItem[] {
  return useSyncExternalStore(subscribe, () => items, () => items)
}

export function addToPlate(item: DraftItem) {
  set([...items, item])
}

/** Replaces the line with the same `key`. A key not on the plate is a no-op. */
export function updatePlateItem(item: DraftItem) {
  set(items.map((current) => (current.key === item.key ? item : current)))
}

export function removeFromPlate(key: string) {
  set(items.filter((item) => item.key !== key))
}

export function clearPlate() {
  set([])
}

/** A meal card's lines onto the plate, replacing what was there, under the card's id. */
export function loadPlateFromCard(lines: readonly DraftItem[], cardMealId: string) {
  set(lines)
  mealId = lines.length > 0 ? cardMealId : null
}

/** The id `loadPlateFromCard` set, read once when the logger opens. */
export function plateMealId(): string | null {
  return mealId
}
