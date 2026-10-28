import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { AssistantChat } from "@/components/chat/AssistantChat"
import { ConsentPanel } from "@/components/chat/ConsentPanel"
import { usePinnedBarOffset } from "@/components/ui/PinnedBar"
import { ErrorState, Loading } from "@/components/state"
import { useAiConsent, useSetAiConsent } from "@/lib/queries"

/**
 * The AI Assistant tab (plan.md, Phase 9, `ai-chat-app`).
 *
 * Until the user agrees to AI features it shows the consent and nothing else
 * (Q15, A1); the server refuses every AI route without it anyway. After that,
 * the chat (`AssistantChat`).
 */
export default function Assistant() {
  const insets = useSafeAreaInsets()
  const barOffset = usePinnedBarOffset()
  const consent = useAiConsent()
  const setConsent = useSetAiConsent()

  if (consent.isPending) {
    return (
      <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
        <Loading />
      </View>
    )
  }

  if (consent.isError) {
    return (
      <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
        <ErrorState error={consent.error} onRetry={() => void consent.refetch()} />
      </View>
    )
  }

  if (consent.data.consentedAt === null) {
    return (
      <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
        <ConsentPanel
          onAgree={() => setConsent.mutate({ granted: true })}
          agreeing={setConsent.isPending}
          error={setConsent.error}
          bottomPadding={barOffset + 16}
        />
      </View>
    )
  }

  return <AssistantChat />
}
