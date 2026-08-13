import { Text, View } from "react-native"

import { Card } from "@/components/dashboard/Card"
import { ProgressRing } from "@/components/dashboard/ProgressRing"
import { FlameIcon } from "@/components/icons/UiIcons"
import { calories, streak } from "@/components/dashboard/design-fixture"
import { colors } from "@/design/tokens"

const RING_SIZE = 92
const RING_STROKE = 7

/**
 * The hero card: how many calories are left today, and nothing else.
 *
 * It replaced the trend-weight card in this slot on purpose. Weight is the
 * outcome and it moves on its own schedule; calories left is the decision in
 * front of you right now, and the dashboard's job is to answer "what do I log
 * next" — so the number that changes with the next thing you eat gets the top
 * of the screen. Weight keeps the chart below and the whole Weight tab.
 *
 * The figure is the biggest type on the dashboard at 64px, well clear of the
 * 34px inside the ring beside it and the 23px on the macro rings. That gap is
 * the hierarchy: one number to read from arm's length, the rest on approach.
 *
 * The ring is the same `ProgressRing` the macros use — the dashboard has one
 * way of drawing progress and this is it — and it fills with what has been
 * *consumed*, not what is left. Every other ring on the screen fills as the day
 * fills up, and a single ring that emptied instead would read as a countdown
 * next to three that do not.
 *
 * The flame inside it is the streak, not the calories, which is why it is lit
 * from `streak.lit` and never from `calories.progress`. Same mark as the pill
 * in the header and the overlay behind it, so the three are visibly one thing.
 */
export function CaloriesCard() {
  return (
    <Card>
      <View className="flex-row items-center">
        <View className="flex-1 pr-[8px]">
          <Text className="font-display text-[64px] leading-[68px] text-white">
            {calories.left}
          </Text>
          <Text className="mt-[2px] font-barlow text-[17px] text-textSecondary">
            {calories.label}
          </Text>
        </View>

        {/* Inset from the card's padding so the ring does not fight the
            rounded corner — the same offset the card in this slot used. */}
        <View className="mr-[6px]">
          <ProgressRing
            size={RING_SIZE}
            strokeWidth={RING_STROKE}
            progress={calories.progress}
            color={colors.primary}
          >
            <FlameIcon
              size={34}
              color={streak.lit ? colors.amber : colors.textSecondary}
            />
          </ProgressRing>
        </View>
      </View>
    </Card>
  )
}
