import { useState } from "react"
import { Pressable, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { pluralNoun } from "@engine"
import { commonMeasure, suggestedWeight } from "@shared"

import { CloseIcon } from "@/components/icons/UiIcons"
import { colors, withAlpha } from "@/design/tokens"
import { formatKcal, parseDecimal } from "@/lib/format"
import { draftItemMacros, weighedDraftItem, type DraftItem } from "@/lib/meal-draft"
import { useKeyboardHeight } from "@/lib/use-keyboard-height"

/**
 * "How much did this weigh?" — asked once for an ingredient saved without a
 * real weight, before the amount panel opens.
 *
 * The old app stored amounts like "0.75g" for three quarters of a scoop of
 * whey and "2g" for two slices of sourdough, next to their true calories. Those
 * cannot be scaled honestly, and showing them as "1 serving" left the user not
 * knowing what a serving was (iPhone, 2026-10-20: "it needs to be one
 * consistent metric"). So the user says what the amount weighed, once; the
 * line becomes grams, keeps its calories, and opens on the gram slider like
 * every other ingredient.
 *
 * When the food is a common one, a guess is filled in ("2" of sourdough → 2
 * slices → 76 g) from `suggestedWeight`, to confirm or change.
 */
export function WeighSheet({
  item,
  onConfirm,
  onRemove,
  onClose,
}: {
  item: DraftItem
  /** The line, now in grams. The caller opens the amount panel on it. */
  onConfirm: (weighed: DraftItem) => void
  onRemove: () => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const kcal = draftItemMacros(item).kcal
  const storedAmount = item.mode === "direct" ? item.qty : ""
  const [guess] = useState(() => suggestedWeight(item.name, storedAmount))
  const measure = commonMeasure(item.name, "g")
  const [grams, setGrams] = useState(guess === null ? "" : String(guess))

  const amount = parseDecimal(grams)
  const weighed = amount !== null && amount > 0 ? weighedDraftItem(item, amount, "g") : null

  return (
    <View className="absolute inset-0">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: withAlpha(colors.ground, 0.75) }}
      />

      {/* Not a KeyboardAvoidingView, for the reason in `@/lib/use-keyboard-height`. */}
      <View
        className="flex-1 justify-end"
        pointerEvents="box-none"
        style={{ paddingTop: insets.top + 12, paddingBottom: keyboardHeight }}
      >
        <View
          className="rounded-t-[22px] border border-cardBorder bg-card px-[16px] pt-[16px]"
          style={{ paddingBottom: (keyboardHeight > 0 ? 0 : insets.bottom) + 12 }}
        >
          <View className="flex-row items-start">
            <View className="flex-1 pr-[8px]">
              <Text numberOfLines={2} className="font-display text-[24px] leading-[28px] text-white">
                {item.name}
              </Text>
              <Text className="mt-[2px] font-barlow text-[14px] text-textSecondary">
                {formatKcal(kcal)} cal · weight not recorded
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="-mr-[10px] -mt-[6px] h-[44px] w-[44px] items-center justify-center active:opacity-70"
            >
              <CloseIcon size={18} />
            </Pressable>
          </View>

          <Text className="mt-[14px] font-barlow text-[15px] leading-[21px] text-white">
            This was saved without its weight, so it can't be adjusted yet. How much did it weigh?
          </Text>

          <View className="mt-[12px] h-[56px] flex-row items-center rounded-[12px] border border-buttonBorder bg-secondary px-[14px]">
            <TextInput
              value={grams}
              onChangeText={setGrams}
              autoFocus
              selectTextOnFocus
              keyboardType="decimal-pad"
              keyboardAppearance="dark"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={`Weight of ${item.name} in grams`}
              className="h-full flex-1 font-barlow-semibold text-[24px] text-white"
            />
            <Text className="ml-[6px] font-barlow text-[16px] text-textSecondary">g</Text>
          </View>
          <Text className="mt-[8px] font-barlow text-[13px] text-textSecondary">
            {guess !== null && measure
              ? `Filled in at ${measure.grams} g a ${measure.noun}. Change it if yours was different. It will be counted in ${pluralNoun(measure.noun, 2)} from now on.`
              : "Weigh it, or check the packet. You only need to do this once."}
          </Text>

          <View className="mt-[16px] flex-row gap-[10px]">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
              onPress={onRemove}
              className="h-[52px] items-center justify-center rounded-full border border-buttonBorder px-[20px] active:opacity-80"
            >
              <Text className="font-barlow-semibold text-[15px] text-danger">Remove</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue to the amount"
              accessibilityState={{ disabled: weighed === null }}
              disabled={weighed === null}
              onPress={() => weighed && onConfirm(weighed)}
              className={`h-[52px] flex-1 items-center justify-center rounded-full ${
                weighed ? "bg-primary active:opacity-80" : "bg-secondary"
              }`}
            >
              <Text className={`font-barlow-semibold text-[16px] ${weighed ? "text-ground" : "text-textSecondary"}`}>
                Continue
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}
