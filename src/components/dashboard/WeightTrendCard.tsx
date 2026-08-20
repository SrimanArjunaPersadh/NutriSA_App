import { useState } from "react"
import { Text, View } from "react-native"

import { goalDirection } from "@engine"
import type { WeightSeries } from "@shared"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { Empty, ErrorState, Loading } from "@/components/state"
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown"
import { DIRECTION_COLOR } from "@/components/weight/direction"
import { chartHeight, DEFAULT_PLOT_HEIGHT, TrendChart } from "@/components/weight/TrendChart"
import { formatKg } from "@/lib/format"
import { useWeightSeries } from "@/lib/queries"
import { colors } from "@/design/tokens"

/** The card's own chart height. The Weight tab draws a taller one. */
const CHART_HEIGHT = chartHeight(DEFAULT_PLOT_HEIGHT)

/**
 * The windows the range menu offers, shortest first.
 *
 * Ascending because that is the order every chart range control is read in —
 * you scan for the one you want by narrowing, not by hunting. "All time" sits
 * at the end as the escape hatch rather than the default.
 *
 * A **custom date range** is wanted and deliberately not here: Sriman's call on
 * 2026-08-15 was to add it later. It is a date-picker surface with its own
 * validation (no future dates, nothing before the first logged day — the bounds
 * `checkLogDate` already expresses), which is a branch, not an entry in this
 * array.
 */
const RANGES: readonly DropdownOption<number | "all">[] = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: "all", label: "All time" },
]

/**
 * The dashboard's weight card: the current trend, the week's change, and the
 * chart under them.
 *
 * Everything the chart itself decides — the axis, the goal line, the clipped
 * projection — lives in `@/components/weight/TrendChart`, which the Weight tab
 * draws at a larger size. This card owns the range menu, the four states, and
 * the summary line above the plot.
 *
 * The chart needs a pixel width before it can place anything, so it renders
 * nothing until `onLayout` reports one. React Native gives that on the first
 * commit, so there is no visible blank frame.
 */
export function WeightTrendCard() {
  const [range, setRange] = useState<number | "all">(30)

  const { data, isPending, isError, error, refetch } = useWeightSeries(range)
  const [width, setWidth] = useState(0)

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <CardLabel>WEIGHT TREND</CardLabel>
        <Dropdown
          value={range}
          options={RANGES}
          onChange={setRange}
          accessibilityLabel="Chart range"
        />
      </View>

      {data && data.latest ? <TrendSummary series={data} /> : null}

      <View
        className="mt-[14px]"
        style={{ height: CHART_HEIGHT }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {isPending ? (
          <Loading />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.points.length === 0 ? (
          /*
           * Two different nothings, and they need different words.
           *
           * `latest` is measured on the **full** history, so a non-null one
           * here means the user has weighed in before, just not inside this
           * window. Telling someone with 38 weigh-ins on record that they have
           * none would read as data loss. The other case is a genuinely new
           * user, and that one gets an invitation rather than an explanation.
           */
          data.latest ? (
            <Empty
              title="No weigh-ins in this range"
              detail="Pick a longer range, or log today's weight."
            />
          ) : (
            <Empty
              title="No weigh-ins yet"
              detail="Log your weight and the trend line starts here."
            />
          )
        ) : width > 0 ? (
          <TrendChart series={data} width={width} />
        ) : null}
      </View>
    </Card>
  )
}

/**
 * Current trend weight and the week's change, above the chart.
 *
 * The change is **trend to trend**, never raw to raw — that is done in the
 * engine and this only prints it. A raw daily weight swings on salt and water,
 * so "0.6 kg this week" computed from two scale readings is mostly noise
 * presented as progress.
 *
 * ## The colour comes from the goal, not from the sign
 *
 * Green for down and red for up is wrong for anyone gaining toward a target.
 * So the direction is judged against `goalWeightKg`: moving toward the goal is
 * `ok`, away from it is `danger`. With no goal set there is no way to know
 * which way is good, and the change is drawn in plain secondary text rather
 * than guessing — the arrow and the sign still say which way it went.
 */
function TrendSummary({ series }: { series: WeightSeries }) {
  const latest = series.latest!
  const change = series.change7d

  // Closing the gap is progress, whichever direction of travel that means —
  // decided by the engine, so this card and the insight tile below it cannot
  // reach different conclusions about the same week.
  const goalKg = series.goal?.goalKg
  const direction =
    change && goalKg !== undefined
      ? DIRECTION_COLOR[goalDirection(change.from.trend, change.to.trend, goalKg)]
      : colors.textSecondary

  return (
    <View className="mt-[10px] flex-row items-baseline">
      <Text className="font-display text-[34px] leading-[38px] text-white">
        {formatKg(latest.trend)}
      </Text>
      <Text className="ml-[4px] font-barlow text-[15px] text-textSecondary">kg</Text>

      {change ? (
        <Text className="ml-[10px] font-barlow-semibold text-[15px]" style={{ color: direction }}>
          {change.delta > 0 ? "▲" : change.delta < 0 ? "▼" : "–"}{" "}
          {formatKg(Math.abs(change.delta))} kg this week
        </Text>
      ) : (
        <Text className="ml-[10px] font-barlow text-[15px] text-textSecondary">
          Not enough history yet
        </Text>
      )}
    </View>
  )
}
