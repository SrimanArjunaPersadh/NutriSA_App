import { useEffect, useMemo, useRef, useState } from "react"
import { Alert, Keyboard, Pressable, ScrollView, Text, View, type ScrollViewInstance, type TextInputInstance } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { AiAllowance } from "@shared"

import { ChatRowView, Starters } from "@/components/chat/ChatRows"
import { Composer } from "@/components/chat/Composer"
import { ComposeIcon, TrashIcon } from "@/components/icons/UiIcons"
import { usePinnedBarOffset } from "@/components/ui/PinnedBar"
import { ErrorState, Loading } from "@/components/state"
import { colors } from "@/design/tokens"
import { ApiError } from "@/lib/api"
import { chatRows } from "@/lib/chat"
import { selectChat, useChatSelection } from "@/lib/chat-selection"
import { formatDayMonth } from "@/lib/format"
import { useAiAllowance, useChat, useChatList, useDeleteChat } from "@/lib/queries"
import { useChatTurn } from "@/lib/use-chat-turn"
import { useKeyboardHeight } from "@/lib/use-keyboard-height"
import { uuidv7 } from "@/lib/uuid"

/**
 * The AI Assistant tab once AI is agreed to (plan.md, Phase 9, `ai-chat-app`).
 *
 * ## Which chat
 *
 * The latest, unless the chat list or New chat chose one (Q3,
 * `@/lib/chat-selection`). With no chats at all it is a new one, which shows
 * the starters. A new chat's id is minted here and is unknown to the server
 * until its first turn, so it is not read until the chat list has it.
 *
 * ## Four states
 *
 * Loading and error are the shared `<Loading>` / `<ErrorState>` (Q25); empty is
 * the starters; happy is the thread. A turn in flight is drawn over whichever
 * of them is showing, so sending from a new chat never flashes a spinner.
 *
 * ## The box sits on the tab bar, then on the keyboard
 *
 * The tab's view runs under the native tab bar, so the box is lifted by the
 * same offset as every pinned bar (`usePinnedBarOffset`), and by the
 * keyboard's height while it is up.
 *
 * The keyboard covers the native tab bar, so whatever shows above the box must
 * be able to hide it: a tap on empty space or any drag down (Q36). Without
 * that, the only way out of the tab was Chats.
 */
export function AssistantChat() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const barOffset = usePinnedBarOffset()

  const selection = useChatSelection()
  const list = useChatList()
  const [draftId] = useState(uuidv7)

  const latest = list.data?.conversations[0]?.id ?? null
  const known = (id: string) => list.data?.conversations.some((chat) => chat.id === id) ?? false

  // With no chat chosen, the tab waits for the list to know which is latest:
  // until then there is no chat to show or send into (Spec review, 2026-10-28).
  const listUnknown = selection === null && !list.isSuccess
  const shownId = selection?.id ?? latest ?? draftId
  const fresh = selection ? selection.fresh && !known(selection.id) : list.isSuccess && latest === null
  const detail = useChat(fresh ? null : shownId)
  const messages = useMemo(() => detail.data?.messages ?? [], [detail.data])

  // A new chat the server now has becomes an ordinary one.
  useEffect(() => {
    if (selection?.fresh && known(selection.id)) selectChat({ id: selection.id, fresh: false })
  })

  // A chat deleted elsewhere: back to the latest.
  useEffect(() => {
    if (detail.error instanceof ApiError && detail.error.code === "not-found") selectChat(null)
  }, [detail.error])

  const turn = useChatTurn(messages)
  const live = turn.live?.conversationId === shownId ? turn.live : null
  const rows = useMemo(() => chatRows(messages, live), [messages, live])

  const allowance = useAiAllowance()
  const rung = allowance.data?.rung ?? "full"
  // At $5 nothing sends: not the box, which is replaced, and not a starter (A11).
  const canSend = !listUnknown && rung !== "exhausted"

  const [text, setText] = useState("")
  const input = useRef<TextInputInstance>(null)

  function send(message: string) {
    const trimmed = message.trim()
    if (trimmed.length === 0 || turn.streaming || !canSend) return
    turn.send(shownId, trimmed)
    setText("")
  }

  function newChat() {
    if (fresh && rows.length === 0) return
    selectChat({ id: uuidv7(), fresh: true })
    setText("")
  }

  const deleteChat = useDeleteChat()
  function confirmDelete() {
    Alert.alert("Delete this chat?", "It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteChat.mutate(shownId, {
            onSuccess: () => selectChat(null),
            onError: () => Alert.alert("Not deleted", "Couldn't delete this chat. Try again."),
          }),
      },
    ])
  }

  // Follow the reply while it arrives, unless the user has scrolled up to read.
  const scroll = useRef<ScrollViewInstance>(null)
  const atBottom = useRef(true)

  const bottom = keyboardHeight > 0 ? keyboardHeight + 8 : barOffset
  const showThread = rows.length > 0

  const fill = (starter: string) => {
    setText(starter)
    input.current?.focus()
  }

  let body: React.ReactNode
  if (showThread) {
    body = (
      <ScrollView
        ref={scroll}
        className="flex-1"
        contentContainerClassName="px-[16px] pb-[16px]"
        keyboardShouldPersistTaps="handled"
        // "on-drag", not "interactive": interactive only starts once the finger
        // reaches the keyboard's top edge, and the box sits between the two, so
        // an ordinary flick down did nothing (Q36, iPhone 2026-10-29).
        keyboardDismissMode="on-drag"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
          atBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 48
        }}
        scrollEventThrottle={64}
        onContentSizeChange={() => {
          if (atBottom.current) scroll.current?.scrollToEnd({ animated: false })
        }}
      >
        {rows.map((row) => (
          <ChatRowView key={row.id} row={row} onRetry={(target) => turn.retry(shownId, target)} />
        ))}
      </ScrollView>
    )
  } else if (listUnknown && list.isError) {
    body = <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  } else if (listUnknown) {
    body = <Loading label="Loading your chat" />
  } else if (!fresh && detail.isPending) {
    body = <Loading label="Loading your chat" />
  } else if (!fresh && detail.isError) {
    body = <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
  } else {
    // A new chat, or a stored one with no messages: the starters. A scroll view
    // only so that a tap or a drag on the empty space hides the keyboard, as in
    // the thread; as a plain View it had nothing to hide it with (Q36).
    body = (
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow px-[16px]"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Starters onSend={send} onFill={fill} paused={rung === "exhausted"} />
      </ScrollView>
    )
  }

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="h-[52px] flex-row items-center px-[8px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all chats"
          onPress={() => {
            Keyboard.dismiss()
            router.push("/chats")
          }}
          className="h-[44px] justify-center px-[8px] active:opacity-70"
        >
          <Text className="font-barlow-medium text-[15px] text-link">Chats</Text>
        </Pressable>

        <Text className="flex-1 text-center font-barlow-semibold text-[17px] text-white" numberOfLines={1}>
          {fresh ? "New chat" : (detail.data?.conversation.title ?? "AI Assistant")}
        </Text>

        {!fresh && !listUnknown ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete this chat"
            onPress={confirmDelete}
            disabled={turn.streaming || deleteChat.isPending}
            className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
          >
            <TrashIcon size={18} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View className="w-[44px]" />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          onPress={newChat}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ComposeIcon size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {body}

      <View className="px-[16px] pt-[8px]" style={{ paddingBottom: bottom }}>
        {rung === "exhausted" && allowance.data ? (
          <AllowanceUsed resetsOn={allowance.data.resetsOn} />
        ) : (
          <>
            {rung === "cheaper" && allowance.data ? (
              <Text className="mb-[6px] text-center font-barlow text-[13px] text-textSecondary">
                {`Using the lighter model until ${formatDayMonth(allowance.data.resetsOn)}`}
              </Text>
            ) : null}
            <Composer
              ref={input}
              value={text}
              onChange={setText}
              onSend={() => send(text)}
              onStop={turn.stop}
              streaming={turn.streaming}
            />
          </>
        )}
      </View>
    </View>
  )
}

/** The designed $5 state (Q8, A11): in place of the box, old chats still readable. */
function AllowanceUsed({ resetsOn }: { resetsOn: AiAllowance["resetsOn"] }) {
  return (
    <View className="rounded-[16px] border border-cardBorder bg-card px-[16px] py-[14px]">
      <Text className="font-barlow-semibold text-[15px] text-white">This month&apos;s AI allowance is used up.</Text>
      <Text className="mt-[4px] font-barlow text-[14px] text-textSecondary">
        {`It resets on ${formatDayMonth(resetsOn)}. Logging still works.`}
      </Text>
    </View>
  )
}
