import { Pressable, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { MEAL_SLOTS, type MealSlot } from "@engine"

import { colors, withAlpha } from "@/design/tokens"

/**
 * "Add to": which meal the logger is filling, opened from the "Breakfast ▾"
 * title.
 *
 * FatSecret and MyFitnessPal both put the meal in the logger's header as a
 * dropdown (`research designs/fatsecret/app-store/03.jpg`,
 * `research designs/myfitnesspal/app-store/04.jpg`). It replaced `MealPicker`,
 * a row of four chips under the search field that the iPhone showed was
 * crowding it (2026-10-19, twice). With a `+` on every meal card on the
 * Nutrition tab, the meal is usually right before the logger opens; this sheet
 * is for the times it is not.
 *
 * The slot the clock would pick is marked "Now", so the guess is visible
 * without being the only choice.
 */
export function SlotSheet({
  value,
  suggested,
  onChange,
  onClose,
}: {
  value: MealSlot
  /** `mealNameFor(currentClockTime())` — the meal it is now. */
  suggested: MealSlot
  onChange: (slot: MealSlot) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()

  return (
    <View className="absolute inset-0">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: withAlpha(colors.ground, 0.75) }}
      />
      <View className="flex-1 justify-end" pointerEvents="box-none">
        <View
          className="rounded-t-[22px] border border-cardBorder bg-card px-[16px] pt-[16px]"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Text className="mb-[4px] font-barlow-medium text-[12px] uppercase tracking-[0.6px] text-textSecondary">
            Add to
          </Text>
          {MEAL_SLOTS.map((slot, index) => {
            const selected = slot === value
            return (
              <Pressable
                key={slot}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${slot}${slot === suggested ? ", the meal it is now" : ""}`}
                onPress={() => onChange(slot)}
                className={`h-[56px] flex-row items-center active:opacity-70 ${
                  index > 0 ? "border-t border-hairline" : ""
                }`}
              >
                <Text className="font-barlow-semibold text-[17px] text-white">{slot}</Text>
                {slot === suggested ? (
                  <Text className="ml-[8px] font-barlow text-[13px] text-textSecondary">Now</Text>
                ) : null}
                <View className="flex-1" />
                <View
                  className={`h-[22px] w-[22px] rounded-full ${
                    selected ? "border-[7px] border-primary" : "border-2 border-buttonBorder"
                  }`}
                />
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}
