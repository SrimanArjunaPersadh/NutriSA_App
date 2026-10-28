import { Pressable, ScrollView, Text, View } from "react-native"

import { SparkleIcon } from "@/components/icons/UiIcons"
import { saveErrorMessage, type SaveWording } from "@/lib/save-message"

/**
 * The one-time AI consent (plan.md, Phase 9, Q15, A1).
 *
 * Health data, sent abroad: POPIA wants the person to know what goes where
 * before it goes. The tab shows this and nothing else until they agree, and
 * "Read the label" opens it before the camera. Every line is a fact from the
 * Phase 9 grill: what is sent (Q16, and B1's today's log with every message,
 * named after the Privacy review of 2026-10-28), Anthropic's retention, the
 * 12-month chat cleanup (Q17), no writes without a tap (Q5), and the way back
 * out (Q15).
 */

const POINTS = [
  "Each message goes to Anthropic in the US with today's food log and your targets, so the coach can answer. When it looks up other days, your weight or your foods, those go too. Label photos go there as well.",
  "Your name and email are never sent.",
  "Anthropic doesn't train on it and deletes it within 30 days. A message its safety checks flag can be kept for up to 2 years.",
  "Your chats stay in NutriSA until you delete them, or 12 months after you last used one.",
  "Nothing is logged until you tap to log it. The coach doesn't give medical advice.",
  "You can turn AI features off at any time in Goals.",
]

const CONSENT_WORDING: SaveWording = { thing: "choice", check: "Try again." }

export function ConsentPanel({
  onAgree,
  agreeing,
  error,
  onNotNow,
  bottomPadding,
}: {
  onAgree: () => void
  agreeing: boolean
  error: unknown
  /** Only where there is somewhere to go back to: the label reader's way in. */
  onNotNow?: () => void
  bottomPadding: number
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-[20px] pt-[24px]"
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
    >
      <SparkleIcon size={32} />
      <Text className="mt-[14px] font-display text-[32px] leading-[36px] text-white">
        Before you use AI
      </Text>
      <Text className="mt-[8px] font-barlow text-[16px] text-textSecondary">
        The coach and the label reader use Anthropic&apos;s Claude. Here is what that means for your
        data.
      </Text>

      <View className="mt-[20px] gap-[14px]">
        {POINTS.map((point) => (
          <View key={point} className="flex-row">
            <View className="mr-[10px] mt-[8px] h-[6px] w-[6px] rounded-full bg-primary" />
            <Text className="flex-1 font-barlow text-[15px] leading-[21px] text-white">{point}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <Text className="mt-[18px] font-barlow text-[14px] text-danger">
          {saveErrorMessage(error, CONSENT_WORDING)}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agree and turn on AI features"
        accessibilityState={{ busy: agreeing, disabled: agreeing }}
        disabled={agreeing}
        onPress={onAgree}
        className="mt-[24px] h-[52px] items-center justify-center rounded-full bg-primary active:opacity-80"
      >
        <Text className="font-barlow-semibold text-[17px] text-ground">
          {agreeing ? "Turning on…" : "Agree"}
        </Text>
      </Pressable>

      {onNotNow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now, type it in instead"
          onPress={onNotNow}
          className="mt-[10px] h-[44px] items-center justify-center active:opacity-70"
        >
          <Text className="font-barlow-semibold text-[15px] text-textSecondary">Not now</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}
