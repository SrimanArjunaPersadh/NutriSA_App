import { Alert, Pressable, ScrollView, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ChevronLeft, ComposeIcon } from "@/components/icons/UiIcons"
import { Empty, ErrorState, Loading } from "@/components/state"
import { SwipeActions } from "@/components/ui/SwipeActions"
import { colors } from "@/design/tokens"
import { chatDayLabel } from "@/lib/chat"
import { selectChat } from "@/lib/chat-selection"
import { useChatList, useDeleteAllChats, useDeleteChat } from "@/lib/queries"
import { uuidv7 } from "@/lib/uuid"

/**
 * Every chat, newest first (plan.md, Phase 9, Q3, Q17, A8). A plain list:
 * the title is the chat's first message, so naming one costs no model call.
 * Tap to open it in the tab, swipe left to delete it, or delete them all at the
 * foot. Every delete asks first, because none can be undone.
 */
export default function Chats() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const list = useChatList()
  const deleteChat = useDeleteChat()
  const deleteAll = useDeleteAllChats()

  function open(id: string, fresh: boolean) {
    selectChat({ id, fresh })
    router.back()
  }

  function confirmDelete(id: string, title: string) {
    Alert.alert(`Delete "${title}"?`, "It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteChat.mutate(id, {
            onError: () => Alert.alert("Not deleted", "Couldn't delete this chat. Try again."),
          }),
      },
    ])
  }

  function confirmDeleteAll() {
    Alert.alert("Delete all chats?", "Every chat goes, and it can't be undone. Your food log stays.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all",
        style: "destructive",
        onPress: () =>
          deleteAll.mutate(undefined, {
            onSuccess: () => selectChat(null),
            onError: () => Alert.alert("Not deleted", "Couldn't delete your chats. Try again."),
          }),
      },
    ])
  }

  let body: React.ReactNode
  if (list.isPending) {
    body = <Loading label="Loading your chats" />
  } else if (list.isError) {
    body = <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  } else if (list.data.conversations.length === 0) {
    body = (
      <Empty
        title="No chats yet"
        detail="Tell the coach what you ate and it makes a meal card to log."
        action={{ label: "New chat", onPress: () => open(uuidv7(), true) }}
      />
    )
  } else {
    body = (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-[16px] overflow-hidden rounded-[16px] border border-cardBorder bg-card">
          {list.data.conversations.map((chat, index) => (
            <SwipeActions
              key={chat.id}
              background={colors.card}
              onPress={() => open(chat.id, false)}
              pressLabel={`${chat.title}, ${chatDayLabel(chat.updatedAt)}. Open it.`}
              onDelete={() => confirmDelete(chat.id, chat.title)}
              deleteLabel={`Delete ${chat.title}`}
            >
              <View
                className={`min-h-[60px] justify-center px-[16px] py-[10px] ${index > 0 ? "border-t border-hairline" : ""}`}
              >
                <Text className="font-barlow-medium text-[16px] text-white" numberOfLines={1}>
                  {chat.title}
                </Text>
                <Text className="mt-[2px] font-barlow text-[13px] text-textSecondary">
                  {chatDayLabel(chat.updatedAt)}
                </Text>
              </View>
            </SwipeActions>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete all chats"
          onPress={confirmDeleteAll}
          disabled={deleteAll.isPending}
          className="mx-[16px] mt-[32px] h-[44px] items-center justify-center rounded-[10px] border border-buttonBorder bg-secondary active:opacity-80"
        >
          <Text className="font-barlow-semibold text-[15px] text-danger">
            {deleteAll.isPending ? "Deleting…" : "Delete all chats"}
          </Text>
        </Pressable>
      </ScrollView>
    )
  }

  return (
    <View className="flex-1 bg-ground" style={{ paddingTop: insets.top }}>
      <View className="h-[56px] flex-row items-center px-[6px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the chat"
          onPress={() => router.back()}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text className="ml-[2px] flex-1 font-barlow-semibold text-[18px] text-white">Chats</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          onPress={() => open(uuidv7(), true)}
          className="h-[44px] w-[44px] items-center justify-center active:opacity-70"
        >
          <ComposeIcon size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {body}
    </View>
  )
}
