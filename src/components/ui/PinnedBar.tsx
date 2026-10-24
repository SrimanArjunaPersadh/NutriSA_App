import type { ReactNode } from "react"
import { View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { colors, withAlpha } from "@/design/tokens"

/**
 * The wrapper every pinned bottom control sits in — the dashboard's quick
 * actions, Nutrition's "Log Foods", Weight's "Log weight".
 *
 * ## Why it exists
 *
 * All three screens had grown the same absolutely-positioned wrapper by hand,
 * and all three had the same hole in it: nothing behind the control. The pill
 * itself is opaque, but the gutters beside it and the ~62pt band between it and
 * the native tab bar were transparent, so the scroll content ran visibly
 * underneath — on the dashboard you could watch the weight trend, then Insights
 * and Analytics, slide through the gap. Found on the iPhone, 2026-09-09.
 *
 * Fixing it in three places would have left a fourth screen free to repeat it,
 * so the wrapper is the component now and the backdrop comes with it.
 *
 * ## Why a gradient and not a solid fill
 *
 * A hard edge is worse than the bug: content would vanish at a horizontal line
 * partway up the screen, which reads as a clipping error rather than as a
 * surface. The scrim runs from fully transparent at the top to solid `ground`
 * by the time it reaches the control, so text fades out as it travels under the
 * bar and there is never a visible seam. Below the control it is flat `ground`,
 * because that strip only ever meets the tab bar.
 *
 * `as const` on the stops for the same reason as the sign-in scrim —
 * LinearGradient's `colors` wants a tuple of at least two and a mapped array
 * widens to `string[]`.
 */

/**
 * How far the pinned control floats above the bottom of the screen, on top of
 * the home-indicator inset.
 *
 * It lives here rather than with any one bar because all three screens position
 * against it and `PinnedBar` is what applies it. **Confirmed on the iPhone,
 * 2026-09-09** — it was a guess until then, and the answer it settles is that
 * `insets.bottom` does *not* already include the iOS 26 native tab bar.
 */
export const TAB_BAR_CLEARANCE = 62

/**
 * The tallest bottom inset that is only the home indicator. iPhones with a home
 * indicator report 34; anything taller has the tab bar in it as well.
 */
const HOME_INDICATOR_MAX = 34

/**
 * The gap between the pinned control and the top of the tab bar. 8 sat the bar
 * on the tabs (iPhone, 2026-10-20: "way too close"); 20 gives it room.
 */
const ABOVE_TAB_BAR = 20

/**
 * How far above the bottom of the screen the pinned control's bottom edge sits.
 *
 * ## Two answers to "what is in `insets.bottom`"
 *
 * On SDK 54 (iPhone, 2026-09-09) the inset was only the home indicator, 34, and
 * the control needed `TAB_BAR_CLEARANCE` on top of it to clear the tab bar. On
 * SDK 57 expo-router wraps every native tab's content in its own
 * `SafeAreaProvider` (`NativeTabsView.ios.js`), and UIKit's safe area for a
 * view inside a tab bar controller **includes the tab bar**. Adding the
 * clearance on top of that left a tab bar's worth of empty band between "Log
 * food" and the tabs (iPhone, 2026-10-20: "it's not directly above the four
 * tabs").
 *
 * So the inset decides: up to `HOME_INDICATOR_MAX` it is the home indicator and
 * the clearance is added; above it the tab bar is already counted and the
 * control sits `ABOVE_TAB_BAR` over it. Both land the control just above the
 * tabs, whichever way the platform reports.
 */
export function usePinnedBarOffset(): number {
  const insets = useSafeAreaInsets()
  return insets.bottom > HOME_INDICATOR_MAX ? insets.bottom + ABOVE_TAB_BAR : insets.bottom + TAB_BAR_CLEARANCE
}

/**
 * The bottom padding a scroll view under a `PinnedBar` needs, so its last item
 * can be scrolled fully clear of the bar instead of resting behind it.
 *
 * Built from the bar's real geometry: where the bar sits (`usePinnedBarOffset`),
 * the control's own height, and a gap. The Nutrition tab used a hand-tuned
 * `TAB_BAR_CLEARANCE + 64` that left out the inset and came up about 20pt short,
 * so the last meal sat behind "Search for a food" (iPhone, 2026-10-19). A number
 * that must track the bar is derived from the bar.
 */
export function usePinnedBarClearance(controlHeight: number): number {
  return usePinnedBarOffset() + controlHeight + 24
}

/** How far the fade extends above the control before it is fully opaque. */
const FADE_HEIGHT = 72

const SCRIM = [
  withAlpha(colors.ground, 0),
  withAlpha(colors.ground, 0.7),
  withAlpha(colors.ground, 0.95),
  colors.ground,
] as const

export function PinnedBar({ children }: { children: ReactNode }) {
  const offset = usePinnedBarOffset()

  return (
    <View
      className="absolute inset-x-0 bottom-0"
      style={{ paddingBottom: offset }}
      // The scrim is decoration; it must never intercept a tap meant for the
      // content scrolling beneath it. Only the children are interactive.
      pointerEvents="box-none"
    >
      <LinearGradient
        colors={SCRIM}
        locations={[0, 0.45, 0.8, 1]}
        // Explicit start/end — the default axis is horizontal.
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ height: FADE_HEIGHT }}
        className="absolute inset-x-0 bottom-full"
      />

      {/*
        The band the control sits on, and the strip below it down to the tab
        bar. Flat ground: there is nothing to fade into down here.
      */}
      <View pointerEvents="none" className="absolute inset-0 bg-ground" />

      <View pointerEvents="box-none" className="px-[16px]">
        {children}
      </View>
    </View>
  )
}
