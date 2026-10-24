import { Text, View } from "react-native"

import { macroEnergyShares, type Macros } from "@engine"

import { colors } from "@/design/tokens"
import { formatGrams, formatKcal, formatShare } from "@/lib/format"

import { MacroCompact } from "./FoodRow"

/**
 * What a meal is made of, read-only: the pieces the logged-meal screen
 * (`meal.tsx`) and the saved-meal screen (`saved-meal.tsx`) both open on.
 *
 * Both screens follow the same pattern since 2026-10-20 — open to **view**,
 * change only after **Edit** — the way MacroFactor and Foodnoms treat a logged
 * entry. Sharing the view keeps the two from drifting: a saved meal and the
 * meal logged from it read the same.
 */

/**
 * The totals: calories large, then where the energy comes from, as one stacked
 * bar and each macro's grams and share. The shares are the engine's
 * `macroEnergyShares`, the same figures the food panel shows.
 */
export function TotalsCard({ macros }: { macros: Macros }) {
  const shares = macroEnergyShares(macros)
  const parts = [
    { label: "Protein", grams: macros.protein, share: shares.protein, fill: colors.protein, text: "text-protein" },
    { label: "Carbs", grams: macros.carbs, share: shares.carbs, fill: colors.carbs, text: "text-carbs" },
    { label: "Fat", grams: macros.fat, share: shares.fat, fill: colors.fats, text: "text-fats" },
  ] as const

  return (
    <View className="mt-[16px] rounded-[18px] bg-card px-[16px] pb-[16px] pt-[14px]">
      <View className="flex-row items-baseline">
        <Text className="font-display text-[40px] leading-[44px] text-white">{formatKcal(macros.kcal)}</Text>
        <Text className="ml-[6px] font-barlow text-[15px] text-textSecondary">cal</Text>
      </View>

      <View className="mt-[10px] h-[8px] flex-row gap-[2px] overflow-hidden rounded-full bg-ringTrack">
        {parts.map((part) =>
          part.share > 0 ? (
            <View
              key={part.label}
              // Runtime width and colour — values, not classes.
              style={{ width: formatShare(part.share) as `${number}%`, backgroundColor: part.fill }}
            />
          ) : null,
        )}
      </View>

      <View className="mt-[12px] flex-row">
        {parts.map((part) => (
          <View
            key={part.label}
            accessible
            accessibilityLabel={`${part.label} ${formatGrams(part.grams)} grams, ${formatShare(part.share)} of the energy`}
            className="flex-1"
          >
            <Text className={`font-barlow-bold text-[13px] ${part.text}`}>{part.label}</Text>
            <Text className={`font-barlow-bold text-[18px] ${part.text}`}>{formatGrams(part.grams)} g</Text>
            <Text className="font-barlow text-[12px] text-textSecondary">{formatShare(part.share)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** One ingredient: name and amount on the left, calories and P / C / F on the right. */
export function IngredientLine({ name, qty, macros }: { name: string; qty: string; macros: Macros }) {
  return (
    <View className="flex-row items-center py-[12px]">
      <View className="flex-1 pr-[10px]">
        <Text numberOfLines={2} className="font-barlow-semibold text-[15px] text-white">
          {name}
        </Text>
        {qty ? (
          <Text numberOfLines={1} className="mt-[1px] font-barlow text-[13px] text-textSecondary">
            {qty}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text className="font-barlow-semibold text-[15px] text-white">{formatKcal(macros.kcal)} cal</Text>
        <MacroCompact macros={macros} />
      </View>
    </View>
  )
}
