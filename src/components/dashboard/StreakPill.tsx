import { Pressable, Text } from "react-native"
import { useRouter } from "expo-router"

import { FlameIcon } from "@/components/icons/UiIcons"
import { streak } from "@/components/dashboard/design-fixture"
import { colors } from "@/design/tokens"

/**
 * The streak counter in the top-right of the dashboard header, and the way in
 * to the streak overlay.
 *
 * Unlike every other control on this screen it is **wired**, because its
 * destination is a screen this branch builds rather than one that does not
 * exist yet. It is therefore also the only one without
 * `accessibilityState: disabled`.
 *
 * The pill is 30pt tall so it sits level with the wordmark instead of towering
 * over it, which is under the 44pt minimum — `hitSlop` makes up the difference
 * rather than padding, since padding here would push the header taller and open
 * a gap under the status bar.
 *
 * The flame is unlit until the day is logged. A grey flame next to a live
 * number looks broken for about a second and then reads exactly right: the
 * streak is real, today is not on it yet.
 */
export function StreakPill() {
  const router = useRouter()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        streak.lit
          ? `${streak.days} day streak, logged today. Open streak details.`
          : `${streak.days} day streak, not logged today. Open streak details.`
      }
      onPress={() => router.push("/streak")}
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      className="h-[30px] flex-row items-center rounded-full border border-cardBorder bg-secondary px-[10px] active:opacity-70"
    >
      {/* 18, not 16. The flame's hooked tip is what stops it reading as a
          water drop, and at 16px that hook is about one pixel of ink — see the
          note in UiIcons. Two points buys the whole silhouette back. */}
      <FlameIcon size={18} color={streak.lit ? colors.amber : colors.textSecondary} />
      <Text className="ml-[5px] font-barlow-semibold text-[15px] text-white">
        {streak.days}
      </Text>
    </Pressable>
  )
}
