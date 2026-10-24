import { Pressable, Text, View } from "react-native"

import { BarcodeIcon, SearchIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"

/**
 * The Nutrition tab's bottom bar: one "Log food" pill, with the scanner at its
 * right end.
 *
 * ## One way in
 *
 * It used to be two controls, a "Search for a food" pill and a white "Log
 * Foods" button, from `src/design/nutrition_ui.png`. Once the food logger
 * existed both opened the same screen, and on the iPhone (2026-10-19) the pair
 * read as a crowded bar fighting the Meals list for attention. One pill does
 * the job of both: it opens the logger with the keyboard up. The barcode at its
 * end goes straight to the scanner, the one other way in that skips typing.
 *
 * The meal cards above each have their own `+`, which opens the logger already
 * on that meal (`MealSlotCard`). This bar is for "I'm eating something now",
 * and the logger guesses the meal from the clock, visibly, in its title.
 *
 * ## The search field is a Text, not a TextInput
 *
 * Same call as `QuickActionBar` and for the same reason: tapping it pushes the
 * food logger (`src/app/add-food.tsx`), which owns the real search field, rather
 * than raising the keyboard in place over a day view that has nothing to show
 * the results in.
 */

/** The bar's height. Exported so a screen can clear it; see `usePinnedBarClearance`. */
export const LOG_FOODS_BAR_HEIGHT = 50

export function LogFoodsBar({ onSearch, onScan }: { onSearch: () => void; onScan: () => void }) {
  return (
    <View className="h-[50px] flex-row items-center rounded-full border border-buttonBorder bg-secondary">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log food: search for a food"
        onPress={onSearch}
        className="h-full flex-1 flex-row items-center pl-[18px] active:opacity-70"
      >
        <SearchIcon size={18} />
        <Text className="ml-[10px] flex-1 font-barlow text-[16px] text-textSecondary">Log food</Text>
      </Pressable>

      <View className="h-[24px] w-[1px] bg-buttonBorder" />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a barcode"
        onPress={onScan}
        className="h-full w-[56px] items-center justify-center rounded-r-full active:opacity-70"
      >
        <BarcodeIcon size={22} color={colors.white} />
      </Pressable>
    </View>
  )
}
