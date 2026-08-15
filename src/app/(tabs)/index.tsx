import { useState } from "react"
import { RefreshControl, ScrollView, Text, View } from "react-native"
import { Image } from "expo-image"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import logoMark from "@/design/logo-mark.png"
import { colors } from "@/design/tokens"
import { CaloriesCard } from "@/components/dashboard/CaloriesCard"
import { InsightsSection } from "@/components/dashboard/InsightsSection"
import { MacrosCard } from "@/components/dashboard/MacrosCard"
import {
  CONTROL_HEIGHT,
  QuickActionBar,
  TAB_BAR_CLEARANCE,
} from "@/components/dashboard/QuickActionBar"
import { StreakPill } from "@/components/dashboard/StreakPill"
import { currentMonthLabel, WeekStrip } from "@/components/dashboard/WeekStrip"
import { WeightTrendCard } from "@/components/dashboard/WeightTrendCard"
import { useDaySummary } from "@/lib/queries"

/**
 * Dashboard — the cards traced from src/design/home_screen_ui.png, the insights
 * row and the quick-action bar from src/design/home_screen_ui2.png, the week
 * strip, streak pill and calories hero from src/design/home_screen_ui3.png.
 *
 * The order answers the dashboard's three questions top to bottom: the strip
 * says which day you are looking at, the calories card says how you are
 * tracking, and the quick-action bar pinned at the bottom says what to log
 * next. The trend-weight card that used to open the screen was the answer to a
 * fourth question nobody asks mid-morning; weight keeps the chart below and its
 * own tab.
 *
 * ## Every number here is real
 *
 * `design-fixture.ts` is gone. Each card fetches through React Query and owns
 * its own four states — loading, error, empty, happy — rather than the screen
 * holding one state for all of them. That is deliberate: the cards answer
 * different questions from different routes, and a single screen-wide spinner
 * would hide a working calories card because the chart was slow.
 *
 * The four-state rule therefore lands on the card, which is the surface a user
 * actually reads. See `src/components/state/`.
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

  // The month belongs to the strip but is drawn in the header, so the value
  // lives here — the one place both can see. Seeded rather than left empty so
  // the header does not render a frame without it and shove the pill sideways.
  const [month, setMonth] = useState(currentMonthLabel)

  /**
   * The strip needs the logged days, and every card below needs the rest of
   * this response. React Query dedupes them all onto one request, so calling
   * the hook here as well costs nothing and keeps each card owning its own four
   * states instead of being handed props it cannot render without.
   *
   * Pull-to-refresh drives this query rather than both: it is the one the whole
   * screen is built around, and the weight query has its own longer stale time
   * because a weigh-in happens once a day at most.
   */
  const { data, refetch, isRefetching } = useDaySummary()

  return (
    <>
      <ScrollView
        className="flex-1 bg-ground"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: SCROLL_BOTTOM_PADDING,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            // The spinner has to be visible against the app ground, which is
            // near-black — the platform default is a dark grey that disappears
            // on it entirely.
            tintColor={colors.textSecondary}
          />
        }
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

          {/* Pushes the month and streak to the trailing edge without a fixed
              width, so neither can move the wordmark as its text grows. */}
          <View className="flex-1" />

          {/*
            The month the calendar is showing, parked against the streak pill.
            It sat above the strip as a heading first and looked like a section
            title the screen had not earned — the strip is one row of a card-led
            layout, not a section, and giving it a heading made the whole header
            top-heavy. As a quiet label on the header's own baseline it answers
            "which month am I looking at" without claiming to introduce anything.

            Muted and a size down from the pill's number on purpose: it is
            context for the row below, not a statistic. It updates as the strip
            is scrolled, so it is also the only text in this header that moves.
          */}
          <Text className="mr-[10px] font-barlow-medium text-[15px] text-textSecondary">
            {month}
          </Text>
          <StreakPill />
        </View>

        {/* No gutter here on purpose. The strip pages one screen-width at a
            time, so it has to span the full window and apply the 16pt gutter
            inside each page — wrapping it in a padded View would put its snap
            points 16pt out of step with its content. */}
        <View className="mt-[18px]">
          <WeekStrip loggedDays={data?.loggedDays} onVisibleMonthChange={setMonth} />
        </View>

        <View className="mt-[20px] gap-[14px] px-[16px]">
          <CaloriesCard />
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
