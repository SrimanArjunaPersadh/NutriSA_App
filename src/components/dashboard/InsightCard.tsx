import { useState } from "react"
import { Text, View } from "react-native"

import { Sparkline } from "@/components/dashboard/Sparkline"
import { ChevronRight } from "@/components/icons/UiIcons"

/**
 * One tile in the Insights & Analytics row: a metric, the shape of its last
 * week, and the current figure.
 *
 * Unwired on this branch — there is no insight detail screen to push to. The
 * tile is a plain View rather than a Pressable with `disabled` on it: a
 * Pressable renders press feedback for a destination that does not exist, and
 * a card that visibly responds to a tap and then does nothing is worse than one
 * that does not respond. The chevron stays because the row *will* be tappable,
 * and it is the affordance that says so.
 *
 * When the detail screen lands, this becomes a Pressable and the chevron
 * finally means something.
 */

/**
 * Chart box height. Kept as a constant rather than a class because the
 * Sparkline needs the number too — a `h-[54px]` here and a `54` there is two
 * places to change one dimension.
 */
const CHART_HEIGHT = 54

/** Fixed so the two tiles line up whatever state each of them is in. */
export const INSIGHT_CARD_WIDTH = 172

export type InsightProps = {
  title: string
  /** The window the figure covers, shown under the title. */
  period: string
  /** Pre-formatted by the caller. No component rounds for display. */
  value: string
  unit: string
  /** Oldest first. `null` is a day with no log — see `Sparkline`. */
  series: readonly (number | null)[]
  color: string
}

export function InsightCard({ title, period, value, unit, series, color }: InsightProps) {
  const [chartWidth, setChartWidth] = useState(0)

  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${period}: ${value} ${unit}`}
      className="rounded-[16px] border border-cardBorder bg-card p-[14px]"
      style={{ width: INSIGHT_CARD_WIDTH }}
    >
      <Text className="font-barlow-semibold text-[17px] leading-[21px] text-white">
        {title}
      </Text>
      <Text numberOfLines={1} className="mt-[2px] font-barlow text-[13px] text-textSecondary">
        {period}
      </Text>

      <View
        className="mt-[14px]"
        style={{ height: CHART_HEIGHT }}
        onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
      >
        <Sparkline
          values={series}
          color={color}
          width={chartWidth}
          height={CHART_HEIGHT}
        />
      </View>

      <View className="mt-[12px] h-[1px] bg-cardBorder" />

      <View className="mt-[10px] flex-row items-center justify-between">
        <View className="flex-row items-baseline">
          <Text className="font-display text-[24px] leading-[26px] text-white">
            {value}
          </Text>
          <Text className="ml-[4px] font-barlow text-[13px] text-textSecondary">
            {unit}
          </Text>
        </View>
        <ChevronRight size={16} />
      </View>
    </View>
  )
}

/**
 * A tile that has no figure to show — no logs in the window, or the query
 * failed. Same footprint as a real one, so the row does not reflow between
 * states and the two tiles stay on one baseline.
 */
export function InsightPlaceholder({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${message}`}
      className="rounded-[16px] border border-cardBorder bg-card p-[14px]"
      style={{ width: INSIGHT_CARD_WIDTH }}
    >
      <Text className="font-barlow-semibold text-[17px] leading-[21px] text-white">
        {title}
      </Text>
      <View className="flex-1 justify-center">
        <Text className="my-[24px] font-barlow text-[14px] text-textSecondary">
          {message}
        </Text>
      </View>
    </View>
  )
}
