/**
 * Half-up rounding to a fixed number of decimals — scale, round, unscale, which
 * is the approach plan.md specifies.
 *
 * `Math.round` rounds halves toward +∞, so for the non-negative values this
 * engine deals with (weights, macro grams, USD) that is half-up.
 *
 * ## The tie case, and why it is written this way
 *
 * Scaling through a float cannot represent every decimal exactly. 1.005 is
 * stored as 1.00499999999999989, so `Math.round(1.005 * 100) / 100` yields 1,
 * not 1.01. Routing through `value.toFixed(decimals)` instead would round the
 * true decimal expansion of the stored double and is arguably "more correct".
 *
 * This deliberately does **not** do that. The trend series is checked
 * byte-for-byte against 38 rows produced by the previous implementation, and
 * that implementation was almost certainly plain `Math.round(x * 100) / 100`.
 * Matching the oracle beats matching the mathematics: an engine that is right in
 * the abstract but disagrees with the recorded history is the failure mode this
 * whole branch exists to rule out.
 *
 * **If the oracle test fails, this function is the first thing to try changing**
 * — swap the body for `Number(value.toFixed(decimals))` and re-run. The
 * difference only ever shows on an exact half, but the trend feeds each rounded
 * value into the next step, so a single disagreement does not stay one row wide.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundTo received a non-finite value: ${value}`)
  }
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}
