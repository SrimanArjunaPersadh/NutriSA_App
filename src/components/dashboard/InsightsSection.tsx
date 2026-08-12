import { Pressable, ScrollView, Text, View } from "react-native"

import { InsightCard } from "@/components/dashboard/InsightCard"
import { insights } from "@/components/dashboard/design-fixture"

/**
 * The Insights & Analytics row, traced from `src/design/home_screen_ui2.png`.
 *
 * Horizontally scrollable rather than a fixed pair. The reference shows two
 * tiles with the second one running to the screen edge, which is the standard
 * cue that the row continues — and the metrics that belong here (expenditure,
 * weight trend, adherence, average intake) will outgrow two long before the
 * screen gets wider.
 *
 * The row breaks the page's 16px gutter on purpose: the ScrollView itself runs
 * edge to edge and the padding lives on its content, so a card can scroll under
 * the screen edge instead of stopping short of it in a way that reads like a
 * layout bug.
 *
 * Happy state only, matching the rest of this screen — see the note in
 * `(tabs)/index.tsx` about the four states this screen still owes.
 */
export function InsightsSection() {
  return (
    <View>
      <View className="flex-row items-center justify-between px-[16px]">
        <Text className="font-display text-[24px] leading-[28px] text-white">
          Insights & Analytics
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all insights"
          // Unwired — see the note in InsightCard.tsx.
          accessibilityState={{ disabled: true }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="active:opacity-70"
        >
          <Text className="font-barlow-semibold text-[15px] text-link underline">
            See All
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-[12px]"
        contentContainerClassName="gap-[12px] px-[16px]"
      >
        {insights.map((insight) => (
          <InsightCard key={insight.key} insight={insight} />
        ))}
      </ScrollView>
    </View>
  )
}
