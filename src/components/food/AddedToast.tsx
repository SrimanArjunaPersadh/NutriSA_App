import { useEffect } from "react"
import { Pressable, Text, View } from "react-native"

import { ChevronRight } from "@/components/icons/UiIcons"

/**
 * `AddedToast` — "1 item added to Breakfast: Fage 0% (90 kcal)", from the
 * fourth screen of `src/design/nutrition_tabs.jpeg`. The `+` button had no
 * feedback at all beyond a number changing in a pill at the top of the screen,
 * which is easy to miss with a thumb over the list.
 *
 * The file also held `PlateCard`, the plate drawn inline on the logger's empty
 * search. The bottom plate bar does that job, and the research rebuild
 * (2026-10-20) took the inline copy out so the list starts with food.
 */

/** How long the banner stays before it leaves on its own. */
const TOAST_MS = 2600

export type Toast = { key: number; title: string; detail: string }

/**
 * `onUndo` puts an Undo button on the right: a `+` lands on the plate with no
 * sheet in between, so a mistaken tap needs a way back that does not mean
 * opening the plate and finding the line.
 */
export function AddedToast({
  toast,
  onPress,
  onUndo,
  onDone,
}: {
  toast: Toast | null
  onPress: () => void
  onUndo?: (() => void) | undefined
  onDone: () => void
}) {
  // Keyed on the toast, so a second `+` restarts the clock instead of the first
  // one's timer cutting the second banner short.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDone, TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast?.key])

  if (!toast) return null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${toast.title} ${toast.detail}. Open the plate.`}
      onPress={onPress}
      className="absolute inset-x-[12px] top-[4px] z-20 flex-row items-center rounded-[14px] border border-buttonBorder bg-card px-[14px] py-[10px] active:opacity-90"
    >
      <View className="flex-1">
        <Text numberOfLines={1} className="font-barlow-semibold text-[14px] text-white">
          {toast.title}
        </Text>
        <Text numberOfLines={1} className="font-barlow text-[13px] text-textSecondary">
          {toast.detail}
        </Text>
      </View>
      {onUndo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo, take it off the plate"
          onPress={onUndo}
          hitSlop={{ top: 8, bottom: 8 }}
          className="-mr-[6px] h-[36px] justify-center px-[10px] active:opacity-70"
        >
          <Text className="font-barlow-semibold text-[15px] text-link">Undo</Text>
        </Pressable>
      ) : (
        <ChevronRight size={16} />
      )}
    </Pressable>
  )
}
