import { useSyncExternalStore } from "react"

/**
 * Which chat the AI Assistant tab is showing (plan.md, Phase 9, Q3).
 *
 * Null means "the latest", which is what the tab opens on. The chat list sets
 * a chat and goes back; New chat sets a fresh id the server has not seen, so
 * the tab shows the starters instead of reading a chat that does not exist yet.
 * A module store for the same reason as the plate (`@/lib/plate`): the list is
 * a screen pushed over the tabs, and the choice has to reach the tab beneath.
 *
 * An id is not health data, but it names a chat that is, so it goes on
 * sign-out with the cache (`clearQueryCache`).
 */
export type ChatSelection = { id: string; fresh: boolean } | null

let selection: ChatSelection = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useChatSelection(): ChatSelection {
  return useSyncExternalStore(subscribe, () => selection, () => selection)
}

export function selectChat(next: ChatSelection) {
  selection = next
  for (const listener of listeners) listener()
}
