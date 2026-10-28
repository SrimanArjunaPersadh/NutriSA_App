import { Pressable, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ConsentPanel } from "@/components/chat/ConsentPanel"
import { ChevronLeft } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { useSetAiConsent } from "@/lib/queries"

/**
 * The AI consent as its own screen (plan.md, Phase 9, Q15, A1), for the ways
 * in that are not the tab: "Read the label" before its first photo
 * (`?next=camera`), and "Turn on AI features" in Goals. Agreeing goes on to the
 * camera, or back; "Not now" goes back to typing the food in.
 */
export default function AiConsent() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ next?: string }>()
  const toCamera = params.next === "camera"
  const setConsent = useSetAiConsent()

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="h-[56px] flex-row items-center px-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ConsentPanel
        onAgree={() =>
          setConsent.mutate(
            { granted: true },
            { onSuccess: () => (toCamera ? router.replace("/label-camera") : router.back()) },
          )
        }
        agreeing={setConsent.isPending}
        error={setConsent.error}
        onNotNow={toCamera ? () => router.back() : undefined}
        bottomPadding={insets.bottom + 24}
      />
    </View>
  )
}
