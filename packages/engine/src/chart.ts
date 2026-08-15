import { roundTo } from "./round"

/**
 * Axis scaling for the weight chart.
 *
 * ## Why this is engine code and not chart code
 *
 * The y-axis labels are numbers the user reads off the screen — "92, 91, 90" —
 * and plan.md's first standing rule puts every one of those behind a tested
 * pure function. It was easy to miss while the chart was fixture-backed,
 * because `yTicks: [92, 91, 90, 89, 88]` was typed by hand from a design and
 * looked like layout. The moment the data is real, choosing those five numbers
 * is a calculation, and a wrong one silently mislabels every point above it.
 *
 * ## What "nice" means here
 *
 * A scale a person would have picked. Steps land on 1, 2, 2.5 or 5 times a
 * power of ten, so the labels are round numbers; the domain is widened outward
 * to the nearest step so no point sits on the frame; and a series that barely
 * moves still gets a readable spread instead of a flat line pinned to one edge.
 *
 * The last of those is the case that matters most for bodyweight. A week of
 * trend values can span 0.3 kg, and a scale fitted tightly to that would draw
 * ordinary daily noise as a dramatic cliff.
 */

/** Step sizes that read as round numbers, scaled by a power of ten. */
const NICE_STEPS = [1, 2, 2.5, 5, 10]

/** Below this the domain is padded out instead of fitted. See `MIN_SPAN`. */
const MIN_SPAN_DEFAULT = 2

export type Scale = {
  /** Bottom of the axis. At or below every value. */
  min: number
  /** Top of the axis. At or above every value. */
  max: number
  /** Label positions, **highest first** — the order they are drawn top-down. */
  ticks: number[]
}

export type ScaleOptions = {
  /** How many labels to aim for. The result may differ by one either way. */
  targetTicks?: number
  /**
   * The smallest range the axis will ever show, in the values' own units.
   *
   * Defaults to 2 kg. A trend that moved 0.3 kg across the window is a flat
   * week, and it should look like one; fitted tightly it would look like a
   * collapse. This is the number to change if the chart ever shows something
   * other than bodyweight.
   */
  minSpan?: number
}

/**
 * A rounded axis covering every value.
 *
 * Returns null for an empty series — an axis with nothing to measure is the
 * chart's empty state, not a scale from 0 to 1.
 */
export function niceScale(
  values: readonly number[],
  options: ScaleOptions = {},
): Scale | null {
  if (values.length === 0) return null

  const { targetTicks = 5, minSpan = MIN_SPAN_DEFAULT } = options

  let low = Math.min(...values)
  let high = Math.max(...values)

  // Widen a too-tight range around its own centre, so the data stays where the
  // eye expects it rather than sliding to one end of a padded axis.
  if (high - low < minSpan) {
    const centre = (low + high) / 2
    low = centre - minSpan / 2
    high = centre + minSpan / 2
  }

  const step = niceStep((high - low) / Math.max(1, targetTicks - 1))

  // Snapped outward, never inward: a point exactly on `min` or `max` is drawn
  // on the frame, which reads as clipped.
  const min = Math.floor(low / step) * step
  const max = Math.ceil(high / step) * step

  const ticks: number[] = []
  // Rebuilt by multiplication from `min` rather than by repeated addition —
  // adding 2.5 eleven times accumulates float error into the labels, and a tick
  // reading "89.99999999999999" is a bug the user can see.
  const count = Math.round((max - min) / step)
  for (let i = count; i >= 0; i--) {
    ticks.push(roundTo(min + i * step, decimalsFor(step)))
  }

  return { min: roundTo(min, decimalsFor(step)), max: roundTo(max, decimalsFor(step)), ticks }
}

/** The nearest nice step at or above `raw`. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1

  const magnitude = 10 ** Math.floor(Math.log10(raw))
  for (const candidate of NICE_STEPS) {
    if (candidate * magnitude >= raw) return candidate * magnitude
  }
  // Only reachable if `raw` sits above 10× its own magnitude, which the log
  // above rules out. Kept as the honest fallback rather than a non-null cast.
  return 10 * magnitude
}

/** How many decimals a step needs so its labels are not truncated. */
function decimalsFor(step: number): number {
  if (step >= 1) return 0
  // 0.5 → 1, 0.25 → 2, and so on. Capped because the chart is not a lab
  // instrument and a five-decimal axis label is unreadable at 13px.
  return Math.min(3, Math.ceil(-Math.log10(step)))
}

/**
 * `count` items spread evenly across `items`, always including both ends.
 *
 * The x-axis dates come from here. Picking every nth entry directly would drop
 * the last one whenever the length is not a clean multiple, leaving a chart
 * whose right edge is unlabelled — which is the end most people read first.
 *
 * Fewer items than requested returns them all. Duplicates cannot occur: indices
 * are de-duplicated, so a 3-point series asked for 5 ticks gets 3.
 */
export function evenlySpaced<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return []
  if (count === 1) return [items[0]!]
  if (items.length <= count) return [...items]

  const seen = new Set<number>()
  const picked: T[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.round((i / (count - 1)) * (items.length - 1))
    if (seen.has(index)) continue
    seen.add(index)
    picked.push(items[index]!)
  }
  return picked
}
