/**
 * Every number on the dashboard, traced from `src/design/home_screen_ui.png`.
 *
 * ⚠️ This file exists so the screen can be built and reviewed before the data
 * layer does. **Nothing here is real and nothing here is computed at runtime.**
 * When Phase 4/5 land, this module is deleted and each card takes its values
 * from `packages/engine/` via React Query — the standing rule is that no number
 * a user sees is worked out in a component.
 *
 * These are design values, not anyone's bodyweight, so the −9.0 kg fixture
 * offset does not apply.
 */

import { colors } from "@/design/tokens"

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

/**
 * Consecutive days with at least one meal logged, ending today.
 *
 * `lit` is what decides whether the flame burns, and it is **not** the same
 * question as `days > 0`: the streak survives until midnight on a day you have
 * not logged yet, so a user on a 12-day run who opens the app before breakfast
 * sees 12 with an unlit flame. That is the whole point of the overlay's "Log
 * one meal today" line — it names the thing standing between the two states.
 *
 * A streak is a computed number, so when the data layer lands this comes from a
 * `streak.ts` in `packages/engine/`, not from a `.filter().length` in a
 * component. That module is owed and does not exist yet.
 */
export const streak = {
  days: 12,
  lit: false,
}

/**
 * Why 12 and not the reference's 0.
 *
 * `home_screen_ui3.png` shows a streak of 0 with an unlit flame, which is that
 * user's real state and is also the one state where none of this is reviewable:
 * an empty pill, a grey flame, a "0 Day streak", and no way to see whether the
 * lit colour or the animation is right. 12-and-unlit is the state the overlay
 * was actually specified against — a run going, today not logged yet — so the
 * prompt line has something to ask for and the burning flame beside it has a
 * reason to be there.
 *
 * To review the other two states, edit the two fields above: `lit: true` lights
 * the pill and the hero ring and starts the big flame breathing, and `days: 0`
 * gives the true empty state. All three are the same code path.
 */

// ---------------------------------------------------------------------------
// Calories left — the hero card
// ---------------------------------------------------------------------------

/**
 * Traced from `src/design/home_screen_ui3.png`, with the figures rebased onto
 * this project's real targets.
 *
 * The reference shows 2,590 against an unstated target. Ours is 2300 kcal
 * (confirmed 2026-08-12), and the macros below still say 1,870 consumed, so
 * "left" is 430 — the same number the macro card used to carry in its calories
 * ring before that ring was dropped as a duplicate. The screen states it once.
 *
 * `progress` is the share of the target *consumed*, not the share left: the
 * ring fills as the day fills up, which is the direction every other ring on
 * the dashboard already turns.
 */
export const calories = {
  left: "430",
  label: "Calories left",
  progress: 1870 / 2300,
}

// ---------------------------------------------------------------------------
// Today's macros
// ---------------------------------------------------------------------------

export type MacroRing = {
  key: string
  label: string
  /** Consumed so far — the number inside the ring. */
  value: string
  /** Unit shown after the value. Calories carry theirs in the caption instead. */
  unit?: string
  /** Caption under the label. */
  remaining: string
  progress: number
  color: string
}

/**
 * Targets are 2300 kcal / 167P / 195C / 60F — confirmed 2026-08-12, no longer
 * the assumed mid-range. Each `remaining` is the target minus the value and
 * each `progress` is the value over the target.
 *
 * The targets are real now; the consumed figures are still traced from the
 * design mock. Both come from the engine once Phase 4 lands.
 *
 * **Three rings, not four.** Calories were the first ring here until the hero
 * card took them over; leaving them would have put "430 kcal left" on the
 * screen twice, in two different sizes, a card apart. The three that remain are
 * the ones the calorie budget is spent on, and each now gets a third of the
 * card's width instead of a quarter — which is what un-squeezes the captions
 * the note below used to have to fight.
 */
export const macros: MacroRing[] = [
  {
    key: "protein",
    label: "PROTEIN",
    value: "48",
    unit: "g",
    remaining: "119 g left",
    progress: 48 / 167,
    color: colors.protein,
  },
  {
    key: "carbs",
    label: "CARBS",
    value: "102",
    unit: "g",
    remaining: "93 g left",
    progress: 102 / 195,
    color: colors.carbs,
  },
  {
    key: "fat",
    label: "FAT",
    value: "22",
    unit: "g",
    remaining: "38 g left",
    progress: 22 / 60,
    color: colors.fats,
  },
]

// ---------------------------------------------------------------------------
// Weight trend chart
// ---------------------------------------------------------------------------

/**
 * A point on the chart. `day` is an offset in days from the left edge of the
 * window, which keeps the series independent of any calendar — the real one
 * will be keyed off `currentLoggingDay()` (Africa/Johannesburg), never a
 * `new Date()` in the component.
 */
export type ChartPoint = { day: number; kg: number }

export const weightTrend = {
  /**
   * Window width in days. The chart's x-domain is 0…span. Two days wider than
   * the last tick so "25 May" has room to centre itself without clipping.
   */
  span: 30,
  /** Tick day offsets and their labels — five weeks, Monday to Monday. */
  xTicks: [
    { day: 0, label: "27 Apr" },
    { day: 7, label: "4 May" },
    { day: 14, label: "11 May" },
    { day: 21, label: "18 May" },
    { day: 28, label: "25 May" },
  ],
  yTicks: [92, 91, 90, 89, 88],
  /** Padded a little past the ticks so nothing sits on the frame. */
  yDomain: { min: 87.4, max: 92.4 },
  goal: { kg: 88.0, label: "Goal 88.0 kg" },

  /** Raw morning scale readings — the grey scatter. */
  readings: [
    { day: 0, kg: 91.45 },
    { day: 1, kg: 90.82 },
    { day: 2, kg: 91.48 },
    { day: 3, kg: 90.78 },
    { day: 4, kg: 90.92 },
    { day: 5, kg: 91.25 },
    { day: 6, kg: 90.18 },
    { day: 7, kg: 90.66 },
    { day: 8, kg: 90.11 },
    { day: 9, kg: 90.66 },
    { day: 10, kg: 90.12 },
    { day: 11, kg: 90.34 },
    { day: 12, kg: 90.6 },
    { day: 13, kg: 89.8 },
    { day: 14, kg: 90.05 },
    { day: 15, kg: 89.45 },
    { day: 16, kg: 90.1 },
    { day: 17, kg: 89.5 },
    { day: 18, kg: 89.96 },
    { day: 19, kg: 89.23 },
    { day: 20, kg: 89.58 },
    { day: 21, kg: 89.22 },
  ] satisfies ChartPoint[],

  /**
   * The smoothed line through those readings. Ends at 89.40 — the same figure
   * the trend weight card shows — and drops 0.60 kg across its last seven days,
   * which is the "0.6 kg vs last week" above it.
   */
  trend: [
    { day: 0, kg: 91.2 },
    { day: 1, kg: 91.12 },
    { day: 2, kg: 91.03 },
    { day: 3, kg: 90.93 },
    { day: 4, kg: 90.82 },
    { day: 5, kg: 90.7 },
    { day: 6, kg: 90.58 },
    { day: 7, kg: 90.46 },
    { day: 8, kg: 90.36 },
    { day: 9, kg: 90.28 },
    { day: 10, kg: 90.22 },
    { day: 11, kg: 90.19 },
    { day: 12, kg: 90.18 },
    { day: 13, kg: 90.15 },
    { day: 14, kg: 90.0 },
    { day: 15, kg: 89.9 },
    { day: 16, kg: 89.8 },
    { day: 17, kg: 89.7 },
    { day: 18, kg: 89.61 },
    { day: 19, kg: 89.53 },
    { day: 20, kg: 89.46 },
    { day: 21, kg: 89.4 },
  ] satisfies ChartPoint[],

  /** Where that rate lands over the rest of the window — the dashed amber run. */
  projection: [
    { day: 21, kg: 89.4 },
    { day: 30, kg: 88.63 },
  ] satisfies ChartPoint[],

  ranges: ["30 days", "90 days", "1 year"],
  selectedRange: "30 days",
}

// ---------------------------------------------------------------------------
// Insights & analytics
// ---------------------------------------------------------------------------

export type Insight = {
  key: string
  title: string
  /** The window the figure covers, shown under the title. */
  period: string
  /** Pre-formatted. No component rounds for display. */
  value: string
  unit: string
  /** Oldest first. Normalised by the sparkline — the scale is not shown. */
  series: number[]
  color: string
}

/**
 * The two tiles in the Insights row.
 *
 * Two deliberate departures from `home_screen_ui2.png`, which is a competitor
 * screenshot rather than a NutriSA mock:
 *
 * - **The figures are ours, not its.** Weight trend reads 89.4 kg, the value
 *   `weightTrend.trend` ends on in the chart above it. The reference says 56.1,
 *   and a dashboard that disagrees with itself by 33 kg is worse than one that
 *   does not match a screenshot. (This used to anchor to `trendWeight.current`
 *   on the old hero card, which the calories card replaced — the chart is now
 *   the only other place the number appears, and the two still agree.)
 * - **The weight series falls.** The reference's climbs. Ours has to fall,
 *   because the card above it says 0.6 kg down against last week — and the
 *   colour follows from that, not from the reference's palette.
 *
 * On colour: the reference tints the two sparklines coral and purple, which is
 * decoration. Here expenditure is `primary` because that is already the
 * calories colour on the macro rings, and weight trend is `ok` because the
 * trend is falling and green means loss. A rising trend would have to be
 * `danger`, which is a mapping the real component has to make from the goal
 * rather than from the sign of the delta — a user gaining toward a target
 * wants green on the way up.
 */
export const insights: Insight[] = [
  {
    key: "expenditure",
    title: "Expenditure",
    period: "Last 7 Days",
    value: "1,587",
    unit: "kcal",
    series: [1602, 1588, 1596, 1579, 1591, 1583, 1587],
    color: colors.primary,
  },
  {
    key: "weight-trend",
    title: "Weight Trend",
    period: "Last 7 Days",
    value: "89.4",
    unit: "kg",
    series: [90.0, 89.9, 89.8, 89.7, 89.61, 89.53, 89.4],
    color: colors.ok,
  },
]
