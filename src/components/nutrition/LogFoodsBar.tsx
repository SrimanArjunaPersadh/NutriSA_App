import { Pressable, Text, View } from "react-native"

import { SearchIcon } from "@/components/icons/UiIcons"

/**
 * The bottom bar — `src/design/nutrition_ui.png`: a search pill that fills the
 * width, and a white "Log Foods" button beside it.
 *
 * ## The white button
 *
 * It is the only white surface in the app, and in the reference it is doing
 * exactly what plan.md's "colour is semantic" rule wants: this is *the* action
 * on the screen, and nothing else competes with it. `primary` blue is used for
 * the dashboard's actions, so white here reads as a step up rather than as a
 * second blue thing.
 *
 * Text on it is `ground`, not black — the app has no pure black, and a genuinely
 * black label against a pure white pill is harsher than anything else in the
 * palette.
 *
 * ## The search field is a Text, not a TextInput
 *
 * Same call as `QuickActionBar` and for the same reason: tapping it will push a
 * search screen rather than raise the keyboard in place, and an input that
 * accepts characters and does nothing with them is a worse lie than a button
 * that looks like a field. Food search is Phase 6.
 */

export function LogFoodsBar({
  onSearch,
  onLog,
  logLabel = "Log Foods",
}: {
  /** Undefined until food search exists — the field then reads as disabled. */
  onSearch?: (() => void) | undefined
  onLog: () => void
  logLabel?: string
}) {
  return (
    <View className="flex-row items-center gap-[10px]">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search for a food"
        accessibilityState={{ disabled: !onSearch }}
        disabled={!onSearch}
        onPress={onSearch}
        className="h-[48px] flex-1 flex-row items-center rounded-full border border-cardBorder bg-secondary px-[16px] active:opacity-70"
      >
        <SearchIcon size={18} />
        <Text className="ml-[10px] flex-1 font-barlow text-[15px] text-textSecondary">
          Search for a food
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={logLabel}
        onPress={onLog}
        className="h-[48px] items-center justify-center rounded-full bg-white px-[22px] active:opacity-80"
      >
        <Text className="font-barlow-semibold text-[15px] text-ground">{logLabel}</Text>
      </Pressable>
    </View>
  )
}
