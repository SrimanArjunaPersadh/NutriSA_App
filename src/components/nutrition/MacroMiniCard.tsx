import { Text, View } from "react-native"

import { amountOver } from "@engine"

import { ProgressRing } from "@/components/dashboard/ProgressRing"
import { formatGrams } from "@/lib/format"

/**
 * One of the three small macro cards under the calorie ring —
 * `src/design/nutrition_ui2.png`.
 *
 * A ring with the grams eaten in the middle, the macro's name under it, and
 * what is left under that. Three of these sit in a row, each in its own card,
 * which is what separates them from the dashboard's `MacrosCard` — there the
 * three rings share one card and read as a single group, here each is its own
 * object with its own surface.
 *
 * ## Both numbers come from the server
 *
 * `consumed` is the engine's `dayTotals`, `remaining` is `remainingMacros`.
 * Nothing here subtracts one from the other; if the two ever disagree that is a
 * bug worth seeing rather than one worth papering over with a local sum.
 *
 * ## Remaining goes negative, and says so in words
 *
 * `remainingMacros` deliberately goes below zero past a target, and the
 * standing rule is that over-target is a designed state rather than a minus
 * sign. So the line reads "12g over" rather than "-12g left", and takes the
 * `danger` colour — the same treatment the dashboard's calories hero gives the
 * same condition.
 */
export function MacroMiniCard({
  label,
  consumed,
  remaining,
  progress,
  color,
}: {
  label: string
  consumed: number
  /** Null when the user has no targets yet — the card then shows grams only. */
  remaining: number | null
  progress: number | null
  color: string
}) {
  const over = remaining !== null && remaining < 0

  return (
    <View className="flex-1 items-center rounded-[16px] border border-cardBorder bg-card py-[14px]">
      <ProgressRing size={54} strokeWidth={5} progress={progress ?? 0} color={color}>
        <Text
          className="font-barlow-bold text-[15px] text-white"
          accessibilityLabel={`${formatGrams(consumed)} grams of ${label}`}
        >
          {formatGrams(consumed)}
        </Text>
      </ProgressRing>

      <Text className="mt-[9px] font-barlow-semibold text-[14px] text-white">
        {label}
      </Text>

      {remaining === null ? (
        // No targets set. "0g left" would be a lie and "—" says nothing, so the
        // slot carries the unit instead and the card still lines up with its
        // neighbours.
        <Text className="mt-[2px] font-barlow text-[12px] text-textSecondary">
          grams
        </Text>
      ) : (
        <Text
          className={`mt-[2px] font-barlow text-[12px] ${
            over ? "text-danger" : "text-textSecondary"
          }`}
        >
          {formatGrams(over ? amountOver(remaining) : remaining)}g {over ? "over" : "left"}
        </Text>
      )}
    </View>
  )
}
