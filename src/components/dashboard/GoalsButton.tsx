import { Pressable } from "react-native"
import { useRouter } from "expo-router"

import { PersonIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"

/**
 * The way in to Goals, at the trailing edge of the Dashboard header.
 *
 * Placed after the streak pill so the wordmark and the month stay exactly where
 * they were (decided with Sriman, 2026-10-25, plan.md Phase 7b). The four Native
 * Tabs are fixed, so Goals is a pushed screen and needs a door; the trailing
 * edge of the header is where an iPhone user looks for "my account".
 *
 * Drawn at the pill's 30pt height for the same reason as the pill: a 44pt
 * circle would push the header taller and open a gap under the status bar. The
 * `hitSlop` of 7 on every side makes the touch target the full 44pt. The pill's
 * own trailing slop is trimmed to 6 so the two targets do not overlap across
 * the 12pt gap between them.
 */
export function GoalsButton() {
  const router = useRouter()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Goals and account"
      onPress={() => router.push("/goals")}
      hitSlop={7}
      className="ml-[12px] h-[30px] w-[30px] items-center justify-center rounded-full border border-cardBorder bg-secondary active:opacity-70"
    >
      <PersonIcon size={18} color={colors.textSecondary} />
    </Pressable>
  )
}
