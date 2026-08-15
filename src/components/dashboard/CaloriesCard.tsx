import { Text, View } from "react-native"

import { Card } from "@/components/dashboard/Card"
import { ProgressRing } from "@/components/dashboard/ProgressRing"
import { Empty, ErrorState, Loading } from "@/components/state"
import { FlameIcon } from "@/components/icons/UiIcons"
import { formatKcal } from "@/lib/format"
import { useDaySummary } from "@/lib/queries"
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
 * from `streak.lit` and never from the calorie progress. Same mark as the pill
 * in the header and the overlay behind it, so the three are visibly one thing.
 *
 * ## Going over target is a state, not an error
 *
 * Past the target the headline reads "over" with the excess beside it rather
 * than a minus sign on "left", because "-120 Calories left" is a sentence that
 * has to be decoded. The ring keeps filling past 1 — `ProgressRing` clamps its
 * arc, and the copy carries the overshoot.
 */

/** Height held across all four states so the page does not jump. */
const CARD_BODY_HEIGHT = 96

export function CaloriesCard() {
  const { data, isPending, isError, error, refetch } = useDaySummary()

  if (isPending) {
    return (
      <Card>
        <View style={{ height: CARD_BODY_HEIGHT }}>
          <Loading />
        </View>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <View style={{ height: CARD_BODY_HEIGHT }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </View>
      </Card>
    )
  }

  // No targets means no budget, so "calories left" has no answer. This is a
  // real state — every day before the user set targets — and not an error.
  if (!data.targets || !data.remaining || !data.progress) {
    return (
      <Card>
        <View style={{ height: CARD_BODY_HEIGHT }}>
          <Empty
            title="No calorie target yet"
            detail="Set your targets to see what you have left today."
          />
        </View>
      </Card>
    )
  }

  const remaining = data.remaining.kcal
  const over = remaining < 0

  return (
    <Card>
      <View className="flex-row items-center" style={{ height: CARD_BODY_HEIGHT }}>
        <View className="flex-1 pr-[8px]">
          <Text className="font-display text-[64px] leading-[68px] text-white">
            {formatKcal(Math.abs(remaining))}
          </Text>
          <Text
            className="mt-[2px] font-barlow text-[17px]"
            style={{ color: over ? colors.danger : colors.textSecondary }}
          >
            {over ? "Calories over" : "Calories left"}
          </Text>
        </View>

        {/* Inset from the card's padding so the ring does not fight the
            rounded corner — the same offset the card in this slot used. */}
        <View className="mr-[6px]">
          <ProgressRing
            size={RING_SIZE}
            strokeWidth={RING_STROKE}
            progress={data.progress.kcal}
            color={over ? colors.danger : colors.primary}
          >
            <FlameIcon
              size={34}
              color={data.streak.lit ? colors.amber : colors.textSecondary}
            />
          </ProgressRing>
        </View>
      </View>
    </Card>
  )
}
