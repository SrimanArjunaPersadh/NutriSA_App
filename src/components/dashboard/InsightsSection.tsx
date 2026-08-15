import { ScrollView, Text, View } from "react-native"

import { goalDirection, type GoalDirection } from "@engine"

import { InsightCard, InsightPlaceholder } from "@/components/dashboard/InsightCard"
import { formatKcal, formatKg } from "@/lib/format"
import { useDaySummary, useWeightSeries } from "@/lib/queries"
import { colors } from "@/design/tokens"

/**
 * The Insights & Analytics row, traced from `src/design/home_screen_ui2.png`.
 *
 * Horizontally scrollable rather than a fixed pair. The reference shows two
 * tiles with the second one running to the screen edge, which is the standard
 * cue that the row continues — and the metrics that belong here (adherence,
 * weekly rate, best streak) will outgrow two long before the screen gets wider.
 *
 * The row breaks the page's 16px gutter on purpose: the ScrollView itself runs
 * edge to edge and the padding lives on its content, so a card can scroll under
 * the screen edge instead of stopping short of it in a way that reads like a
 * layout bug.
 *
 * ## Two queries, not one
 *
 * The tiles describe different things, so they come from different routes and
 * settle independently. React Query dedupes both against the cards above —
 * neither of these is a second request.
 *
 * ## "Expenditure" is gone
 *
 * The first tile used to read "Expenditure — 1,587 kcal", which is TDEE.
 * Adaptive TDEE is a deferred cut with a "3+ weeks logging in the new app"
 * trigger, so that tile had **no data source at all** once the fixture went;
 * it was a number traced from a competitor screenshot. Sriman's call on
 * 2026-08-14 was to swap it for average intake, which keeps the two-tile layout
 * and is computable from data that already exists.
 */
/** Matches the trend card's mapping — see the note there. */
const DIRECTION_COLOR: Record<GoalDirection, string> = {
  toward: colors.ok,
  away: colors.danger,
  unchanged: colors.textSecondary,
}

export function InsightsSection() {
  return (
    <View>
      <View className="px-[16px]">
        <Text className="font-display text-[24px] leading-[28px] text-white">
          Insights & Analytics
        </Text>
      </View>

      {/*
        "See All" is gone rather than disabled. There is no insights screen to
        see all of, and a link that announces itself and then refuses is worse
        than one that is not there — it comes back with the screen it points at.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-[12px]"
        contentContainerClassName="gap-[12px] px-[16px]"
      >
        <AverageIntakeTile />
        <WeightTrendTile />
      </ScrollView>
    </View>
  )
}

/**
 * Average intake over the trailing week.
 *
 * The period line says how many of the seven days actually carry a log, because
 * the average is over **days logged, not days elapsed** — see
 * `packages/engine/src/intake.ts`. Without that count the figure would silently
 * mean something different in a week with two gaps in it, and the tile would
 * have no way to say so.
 */
function AverageIntakeTile() {
  const { data, isPending, isError } = useDaySummary()

  if (isPending) {
    return <InsightPlaceholder title="Avg Intake" message="Loading…" />
  }
  if (isError) {
    return <InsightPlaceholder title="Avg Intake" message="Couldn't load this." />
  }
  if (!data.averageIntake) {
    return (
      <InsightPlaceholder
        title="Avg Intake"
        message="Log a meal to start averaging your week."
      />
    )
  }

  const { average, loggedDays, windowDays, series } = data.averageIntake

  return (
    <InsightCard
      title="Avg Intake"
      period={`${loggedDays} of last ${windowDays} days`}
      value={formatKcal(average.kcal)}
      unit="kcal"
      series={series.map((point) => point.kcal)}
      // The same blue the calories ring uses. Energy is one colour across the
      // dashboard; tinting this tile differently would be decoration.
      color={colors.primary}
    />
  )
}

/**
 * Trend weight, and the shape of the last week of it.
 *
 * ## The colour is decided by the goal, not by the sign of the change
 *
 * Green-for-down is wrong for anyone gaining toward a target. So the sparkline
 * is `ok` when the week closed the gap to the goal and `danger` when it opened
 * it — and with no goal set it is plain `primary`, because there is no way to
 * know which direction is good and guessing would put a reassuring green on a
 * week that went the wrong way.
 */
function WeightTrendTile() {
  const { data, isPending, isError } = useWeightSeries(30)

  if (isPending) {
    return <InsightPlaceholder title="Weight Trend" message="Loading…" />
  }
  if (isError) {
    return <InsightPlaceholder title="Weight Trend" message="Couldn't load this." />
  }
  if (!data.latest) {
    return (
      <InsightPlaceholder
        title="Weight Trend"
        message="Log a weigh-in to see your trend."
      />
    )
  }

  const goalKg = data.goal?.goalKg
  const change = data.change7d

  /**
   * Same engine call as the trend card above, deliberately. These two used to
   * carry a copy each of the same comparison — one card apart on one screen,
   * with nothing keeping them in step.
   *
   * The neutral colour differs on purpose: this card has no arrow or sign
   * beside it, only a line, so with no goal to judge against it falls back to
   * `primary` rather than a grey that would read as disabled.
   */
  const color =
    change && goalKg !== undefined
      ? DIRECTION_COLOR[goalDirection(change.from.trend, change.to.trend, goalKg)]
      : colors.primary

  // The last seven days of the drawn window. `points` is one entry per calendar
  // day, so this is a week by construction rather than "the last seven rows".
  const week = data.points.slice(-7).map((point) => point.trend)

  return (
    <InsightCard
      title="Weight Trend"
      period="Last 7 days"
      value={formatKg(data.latest.trend)}
      unit="kg"
      series={week}
      color={color}
    />
  )
}
