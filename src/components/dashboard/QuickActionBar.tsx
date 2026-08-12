import { Pressable, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { BarcodeIcon, SearchIcon, SparkleIcon } from "@/components/icons/UiIcons"

/**
 * The three logging entry points, pinned above the tab bar: search a food, scan
 * a barcode, ask the assistant. Traced from `src/design/home_screen_ui2.png`.
 *
 * ## Why it floats instead of scrolling
 *
 * These are the actions the dashboard exists to lead to. Scrolled off with the
 * content they would be reachable only from the top of the screen, and the
 * whole point of the tiered logging flow — scan first, search second, type last
 * — is that the entry point is always one thumb away.
 *
 * ## Why it is not part of the tab bar
 *
 * The reference puts a centre "+" in its tab bar. NativeTabs cannot host an
 * arbitrary view, and a JS tab bar is off the table (AGENTS.md). This row is
 * ordinary screen content positioned over the scroll view, which gets the same
 * reachability without touching navigation.
 *
 * ## Why the pill is a View with two Pressables inside it
 *
 * The search area and the scan button are siblings, not nested. A Pressable
 * inside a Pressable resolves differently on the two platforms — iOS gives the
 * press to the inner one, Android can run both responders — so a tap on the
 * barcode icon could open search *and* the scanner. Two siblings in a row
 * container look identical and cannot do that.
 *
 * ## The one number to tune on device
 *
 * `TAB_BAR_CLEARANCE` is how far this sits above the bottom of the screen, on
 * top of the home-indicator inset. It is a guess: the iOS 26 tab bar's height
 * is not something the screen is told, and whether `insets.bottom` already
 * includes it under native tabs is exactly the kind of thing that differs
 * between the simulator and the phone. If the row tucks under the tab bar or
 * floats too high, change it here — `(tabs)/index.tsx` derives its scroll
 * padding from these exports, so nothing else needs touching.
 */

export const TAB_BAR_CLEARANCE = 62

/** Height of the pill and the assistant button — they sit on one baseline. */
export const CONTROL_HEIGHT = 52

export function QuickActionBar() {
  const insets = useSafeAreaInsets()

  return (
    <View
      className="absolute inset-x-0 bottom-0 flex-row items-center gap-[10px] px-[16px]"
      style={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
    >
      <View className="h-[52px] flex-1 flex-row items-center rounded-full border border-cardBorder bg-secondary px-[16px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search for a food"
          // All three controls here are unwired — see the note in InsightCard.tsx.
          accessibilityState={{ disabled: true }}
          className="h-full flex-1 flex-row items-center active:opacity-70"
        >
          <SearchIcon size={20} />

          {/*
            A Text placeholder, not a TextInput. Tapping this will push a search
            screen rather than raise the keyboard in place, and a real input that
            accepts characters and does nothing with them is a worse lie than a
            button that looks like a field.
          */}
          <Text className="ml-[10px] flex-1 font-barlow text-[16px] text-textSecondary">
            Search for a food
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan a barcode"
          accessibilityState={{ disabled: true }}
          // 22pt of ink, slopped out to the 44×44 minimum.
          hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
          className="active:opacity-70"
        >
          <BarcodeIcon size={22} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask the AI assistant"
        accessibilityState={{ disabled: true }}
        className="h-[52px] w-[52px] items-center justify-center rounded-full border border-cardBorder bg-secondary active:opacity-80"
      >
        <SparkleIcon size={22} />
      </Pressable>
    </View>
  )
}
