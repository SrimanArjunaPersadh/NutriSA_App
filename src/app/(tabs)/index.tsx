import { ScrollView, Text, View } from "react-native"
import { Image } from "expo-image"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import logoMark from "@/design/logo-mark.png"
import { InsightsSection } from "@/components/dashboard/InsightsSection"
import { MacrosCard } from "@/components/dashboard/MacrosCard"
import {
  CONTROL_HEIGHT,
  QuickActionBar,
  TAB_BAR_CLEARANCE,
} from "@/components/dashboard/QuickActionBar"
import { TrendWeightCard } from "@/components/dashboard/TrendWeightCard"
import { WeightTrendCard } from "@/components/dashboard/WeightTrendCard"

/**
 * Dashboard — the cards traced from src/design/home_screen_ui.png, the insights
 * row and the quick-action bar from src/design/home_screen_ui2.png.
 *
 * This is the happy state only. The empty, loading and error states are owed
 * before this screen can merge for real; they are not sketched here because
 * every one of them depends on the shape of the query that does not exist yet,
 * and guessing at it now would only have to be thrown away.
 *
 * The ScrollView is the first child on purpose — native tabs hang the automatic
 * content inset, and tap-the-tab-to-scroll-to-top, off the first scrollable they
 * find, and a wrapper View in between silently breaks each. That is why
 * `QuickActionBar` is a sibling inside a Fragment rather than the two of them
 * living in a wrapper View: a Fragment adds no node, so the ScrollView is still
 * the first real child, and the bar positions itself against the route's own
 * container. **Both behaviours need re-checking on device** — this is the exact
 * arrangement the comment above warns is easy to break without noticing.
 *
 * The top inset is applied by hand and is exactly `insets.top`, with nothing
 * added. Verified on device: react-native-screens' automatic content inset
 * adjustment does *not* reach this ScrollView, so without the manual inset the
 * header renders at y=0 and the logo sits on top of the status bar clock. Any
 * padding beyond `insets.top` reads as a visible gap under the clock, which is
 * why there is no design gap on top of it.
 *
 * The bottom padding clears the floating bar so the last card can be scrolled
 * out from under it. Derived from the bar's own exported dimensions rather than
 * hand-tuned to match them: two numbers that must move together, coupled by a
 * comment, drift the first time only one of them is edited.
 */
const SCROLL_BOTTOM_PADDING = TAB_BAR_CLEARANCE + CONTROL_HEIGHT + 18

export default function Dashboard() {
  const insets = useSafeAreaInsets()

  return (
    <>
      <ScrollView
        className="flex-1 bg-ground"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: SCROLL_BOTTOM_PADDING,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center px-[16px]">
          {/*
            Decorative: the wordmark beside it already says "NutriSA", so leaving
            this focusable would make VoiceOver announce the brand twice.

            Sized off src/design/logo-mark.png, which is the artwork cropped out of
            logo.png — the original is 1024² with the apple filling barely half of
            it and sitting high, so `contain` in a square box rendered it small and
            floating. The crop carries its own 234:256 aspect, hence the odd width.
          */}
          <Image
            source={logoMark}
            contentFit="contain"
            accessible={false}
            className="h-[32px] w-[29px]"
          />
          <Text className="ml-[8px] font-display text-[32px] leading-[36px] text-white">
            Nutri<Text className="text-primary">SA</Text>
          </Text>
        </View>

        <View className="mt-[18px] gap-[14px] px-[16px]">
          <TrendWeightCard />
          <MacrosCard />
          <WeightTrendCard />
        </View>

        {/* Breaks the gutter on purpose — the row scrolls edge to edge. */}
        <View className="mt-[22px]">
          <InsightsSection />
        </View>
      </ScrollView>

      <QuickActionBar />
    </>
  )
}
