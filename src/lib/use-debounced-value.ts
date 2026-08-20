import { useEffect, useState } from "react"

/**
 * A copy of `value` that stops changing while the user is still typing.
 *
 * plan.md, Phase 4: "**Gram inputs debounced at 300ms**". The field itself is
 * never debounced — a text input that lags behind the keyboard is unusable, and
 * that is not what the rule is about. What is debounced is everything
 * *computed* from it: the line's macros and the meal's running total.
 *
 * ## Why the numbers wait and the text does not
 *
 * Typing "150" passes through 1 and 15. Undebounced, the running total flashes
 * 3 kcal, then 52, then 525 — three wrong numbers under the thumb for every
 * right one, on the surface that has to be readable at a glance. 300ms is long
 * enough to sit out a digit and short enough that the total has settled before
 * anyone looks up from the keyboard.
 *
 * ## Why not debounce the request instead
 *
 * There is no request. The arithmetic is the engine's `scalePortion`, running
 * locally in microseconds, so this is a display decision and nothing else. If a
 * food lookup lands on this screen later, that call needs its own debounce for
 * a completely different reason — network cost — and the two should not be
 * folded together.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}
