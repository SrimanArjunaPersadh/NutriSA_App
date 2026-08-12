import { useState } from "react"
import { Pressable, Text, View } from "react-native"

import { Sparkline } from "@/components/dashboard/Sparkline"
import { ChevronRight } from "@/components/icons/UiIcons"
import type { Insight } from "@/components/dashboard/design-fixture"

/**
 * One tile in the Insights & Analytics row: a metric, the shape of its last
 * week, and the current figure.
 *
 * The whole tile is the touch target rather than the chevron. A 16pt caret is
 * well under the 44×44 minimum and would need padding out to reach it, at
 * which point the padding is the target and the caret is just the label for it
 * — so the caret is marked decorative and the card takes the press.
 *
 * Unwired on this branch. `onPress` is deliberately absent rather than a no-op
 * handler, and `accessibilityState.disabled` says so out loud: a Pressable with
 * nothing behind it still renders press feedback, and without the state flag
 * VoiceOver would announce a working button that goes nowhere. The visual
 * feedback is kept on purpose so the touch targets can still be felt on device.
 * Drop the flag in the branch that adds the handler.
 */

/**
 * Chart box height. Kept as a constant rather than a class because the
 * Sparkline needs the number too — a `h-[54px]` here and a `54` there is two
 * places to change one dimension.
 */
const CHART_HEIGHT = 54

export function InsightCard({ insight }: { insight: Insight }) {
  const [chartWidth, setChartWidth] = useState(0)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${insight.title}, ${insight.period}: ${insight.value} ${insight.unit}`}
      accessibilityState={{ disabled: true }}
      className="w-[172px] rounded-[16px] border border-cardBorder bg-card p-[14px] active:opacity-90"
    >
      <Text className="font-barlow-semibold text-[17px] leading-[21px] text-white">
        {insight.title}
      </Text>
      <Text className="mt-[2px] font-barlow text-[13px] text-textSecondary">
        {insight.period}
      </Text>

      <View
        className="mt-[14px]"
        style={{ height: CHART_HEIGHT }}
        onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
      >
        <Sparkline
          values={insight.series}
          color={insight.color}
          width={chartWidth}
          height={CHART_HEIGHT}
        />
      </View>

      <View className="mt-[12px] h-[1px] bg-cardBorder" />

      <View className="mt-[10px] flex-row items-center justify-between">
        <View className="flex-row items-baseline">
          <Text className="font-display text-[24px] leading-[26px] text-white">
            {insight.value}
          </Text>
          <Text className="ml-[4px] font-barlow text-[13px] text-textSecondary">
            {insight.unit}
          </Text>
        </View>
        <ChevronRight size={16} />
      </View>
    </Pressable>
  )
}
