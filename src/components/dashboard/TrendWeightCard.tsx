import { Text, View } from "react-native"

import { Card, CardLabel } from "@/components/dashboard/Card"
import { ProgressRing } from "@/components/dashboard/ProgressRing"
import { TrendArrow } from "@/components/icons/UiIcons"
import { trendWeight } from "@/components/dashboard/design-fixture"
import { colors } from "@/design/tokens"

const RING_SIZE = 92
const RING_STROKE = 7

/**
 * Top card: today's smoothed weight, how it moved against last week, and how
 * far through the goal that puts you.
 *
 * Down is green and up is red because the goal in the fixture is a loss. When
 * this takes real data the direction→colour mapping has to come from the goal,
 * not from the sign of the delta — a user gaining toward a target wants green
 * on the way up.
 */
export function TrendWeightCard() {
  const losing = trendWeight.direction === "down"
  const deltaColor = losing ? colors.ok : colors.danger

  return (
    <Card>
      <View className="flex-row items-center">
        <View className="flex-1 pr-[8px]">
          <CardLabel>TREND WEIGHT</CardLabel>

          <View className="mt-[4px] flex-row items-baseline">
            <Text className="font-display text-[54px] leading-[60px] text-white">
              {trendWeight.current}
            </Text>
            <Text className="ml-[6px] font-barlow-bold text-[20px] text-white">kg</Text>
          </View>

          <View className="mt-[4px] flex-row items-center">
            <TrendArrow size={16} color={deltaColor} direction={trendWeight.direction} />
            <Text
              className="ml-[4px] font-barlow-semibold text-[16px]"
              style={{ color: deltaColor }}
            >
              {trendWeight.weekChange}
            </Text>
            <Text className="ml-[5px] font-barlow text-[16px] text-white/70">vs last week</Text>
          </View>

          <Text className="mt-[6px] font-barlow text-[16px] text-textSecondary">
            {trendWeight.remaining} to goal ({trendWeight.goal})
          </Text>
        </View>

        {/* Inset from the card's padding — the reference sits the ring off the
            edge rather than flush, which stops it fighting the rounded corner. */}
        <View className="mr-[6px]">
          <ProgressRing
            size={RING_SIZE}
            strokeWidth={RING_STROKE}
            progress={trendWeight.progress}
            color={colors.primary}
          >
            <View className="flex-row items-baseline">
              <Text className="font-display text-[34px] leading-[38px] text-white">
                {trendWeight.progressLabel}
              </Text>
              <Text className="font-barlow-bold text-[15px] text-white">%</Text>
            </View>
            <Text className="font-barlow-medium text-[9px] tracking-[0.8px] text-textSecondary">
              OF THE WAY
            </Text>
          </ProgressRing>
        </View>
      </View>
    </Card>
  )
}
