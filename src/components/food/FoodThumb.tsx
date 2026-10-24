import { Text, View } from "react-native"
import { Image } from "expo-image"

import { dominantMacro, type Macros } from "@engine"

import { colors } from "@/design/tokens"

/**
 * A food's picture: the packet's front photo when Open Food Facts has one, a
 * lettered tile when it does not — `src/design/nutrition_tabs.jpeg`'s
 * thumbnails.
 *
 * The placeholder's letter takes the colour of the food's dominant macro, the
 * same signal as the accent bars elsewhere. Most foods in this app have no
 * photo (own foods, recents, cached rows), so the placeholder is the common
 * case, not the fallback — it has to carry meaning on its own.
 *
 * `expo-image` rather than React Native's `Image`: it caches to disk, so a
 * product scrolled past twice is fetched once. Registered for `className` in
 * `nativewind-interop.ts`.
 */

const LETTER_COLOUR = {
  protein: colors.protein,
  fat: colors.fats,
  carbs: colors.carbs,
} as const

export function FoodThumb({
  name,
  imageUrl,
  macros,
  size,
}: {
  name: string
  imageUrl: string | null
  macros: Macros
  size: 40 | 120
}) {
  const box = size === 40 ? "h-[40px] w-[40px] rounded-[10px]" : "h-[120px] w-[120px] rounded-[16px]"

  if (imageUrl) {
    return (
      // Packets are photographed on every background imaginable; white behind
      // them is how the reference frames them, and what makes a transparent PNG
      // legible on a dark app.
      <View className={`${box} items-center justify-center overflow-hidden bg-pureWhite`}>
        <Image
          source={{ uri: imageUrl }}
          contentFit="contain"
          className="h-full w-full"
          accessibilityIgnoresInvertColors
          accessible={false}
          transition={150}
        />
      </View>
    )
  }

  const dominant = dominantMacro(macros)
  return (
    <View className={`${box} items-center justify-center bg-secondary`} accessible={false}>
      <Text
        className={size === 40 ? "font-barlow-bold text-[17px]" : "font-barlow-bold text-[44px]"}
        style={{ color: dominant ? LETTER_COLOUR[dominant] : colors.textSecondary }}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  )
}
