import { Pressable, Text } from "react-native"
import { useRouter } from "expo-router"

import { FlameIcon } from "@/components/icons/UiIcons"
import { useDaySummary } from "@/lib/queries"
import { colors } from "@/design/tokens"

/**
 * The streak counter in the top-right of the dashboard header, and the way in
 * to the streak overlay.
 *
 * The pill is 30pt tall so it sits level with the wordmark instead of towering
 * over it, which is under the 44pt minimum — `hitSlop` makes up the difference
 * rather than padding, since padding here would push the header taller and open
 * a gap under the status bar.
 *
 * The flame is unlit until the day is logged. A grey flame next to a live
 * number looks broken for about a second and then reads exactly right: the
 * streak is real, today is not on it yet. That is a genuine state and not a
 * loading artefact — see `packages/engine/src/streak.ts`.
 *
 * ## While the streak is unknown, the pill is not there
 *
 * No skeleton and no placeholder zero. A "0" that turns into a "12" a moment
 * later tells the user their streak was lost and then found, and this sits in
 * the header where it would be the first thing read on every open. The header
 * is laid out so the wordmark does not move when the pill appears — the flexible
 * spacer before it absorbs the width.
 *
 * An error is treated the same way. The dashboard below already shows the
 * failure in its cards, and a broken flame in the header would be a second
 * report of one problem.
 */
export function StreakPill() {
  const router = useRouter()
  const { data } = useDaySummary()

  if (!data) return null

  const { days, lit } = data.streak

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        lit
          ? `${days} day streak, logged today. Open streak details.`
          : `${days} day streak, not logged today. Open streak details.`
      }
      onPress={() => router.push("/streak")}
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      className="h-[30px] flex-row items-center rounded-full border border-cardBorder bg-secondary px-[10px] active:opacity-70"
    >
      {/* 18, not 16. The flame's hooked tip is what stops it reading as a
          water drop, and at 16px that hook is about one pixel of ink — see the
          note in UiIcons. Two points buys the whole silhouette back. */}
      <FlameIcon size={18} color={lit ? colors.amber : colors.textSecondary} />
      <Text className="ml-[5px] font-barlow-semibold text-[15px] text-white">
        {days}
      </Text>
    </Pressable>
  )
}
