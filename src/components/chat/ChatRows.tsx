import { Pressable, Text, View } from "react-native"

import { MealCard } from "@/components/chat/MealCard"
import { WorkingLine, WorkingSteps } from "@/components/chat/Working"
import { SparkleIcon } from "@/components/icons/UiIcons"
import { CHAT_STARTERS, CHAT_STATUS_LINES, type ChatRow, type RetryTarget } from "@/lib/chat"

/**
 * One row of a chat: the user's message on the right, the coach's reply on the
 * left with whatever it carries (plan.md, Phase 9, Q7, Q13, Q30, A4).
 *
 * A reply's text is plain (`plainReply`), never markup, so nothing a model or
 * a food name writes can style the screen.
 *
 * ## Two voices, two faces (C1, Sriman's pick 2026-10-29)
 *
 * The coach reads in a serif (`font-reply`, Source Serif 4), the user's words
 * in Inter (`font-chat`), so the two never look alike, as in Claude. Barlow
 * stays on everything around the chat: the card, the labels, the buttons.
 */
export function ChatRowView({ row, onRetry }: { row: ChatRow; onRetry: (target: RetryTarget) => void }) {
  if (row.kind === "user") {
    return (
      <View className="mt-[14px] max-w-[85%] self-end rounded-[18px] rounded-br-[6px] bg-secondary px-[14px] py-[10px]">
        <Text className="font-chat text-[15px] leading-[22px] text-white" selectable>
          {row.text}
        </Text>
      </View>
    )
  }

  const streaming = row.status === "streaming"
  const waiting = streaming && row.text.length === 0

  return (
    <View className="mt-[14px] self-stretch">
      {waiting ? <WorkingSteps steps={row.steps} /> : null}

      {row.text.length > 0 ? (
        <Text className="font-reply text-[16.5px] leading-[25px] text-white" selectable>
          {row.text}
        </Text>
      ) : null}

      {streaming && !waiting && row.tool ? <WorkingLine text={CHAT_STATUS_LINES[row.tool]} /> : null}

      {row.unsourcedNumbers ? (
        <Text className="mt-[8px] font-barlow text-[13px] text-amber">
          One number here isn&apos;t from your log. Double-check it.
        </Text>
      ) : null}

      {row.proposal ? (
        <MealCard proposal={row.proposal} messageId={row.id.startsWith("live-") ? null : row.id} />
      ) : null}

      {row.status === "cut_off" ? (
        <Text className="mt-[6px] font-barlow-semibold text-[13px] text-textSecondary">Cut off</Text>
      ) : null}

      {row.failure ? (
        <Text className="mt-[2px] font-barlow text-[15px] text-danger">{row.failure}</Text>
      ) : null}

      {row.retry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry this message"
          onPress={() => row.retry && onRetry(row.retry)}
          className="mt-[8px] h-[44px] items-center justify-center self-start rounded-full border border-buttonBorder bg-secondary px-[18px] active:opacity-80"
        >
          <Text className="font-barlow-semibold text-[15px] text-white">Retry</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * A new chat's empty state (Q25, A5): what the coach is for, and three ways
 * in. "Log my breakfast" fills the box and leaves the rest to the user; the
 * other two are whole questions and send at once.
 */
export function Starters({
  onSend,
  onFill,
  paused,
}: {
  onSend: (text: string) => void
  onFill: (text: string) => void
  /** The month's allowance is used up: the chips would only be refused (A11). */
  paused: boolean
}) {
  return (
    <View className="flex-1 px-[4px] pt-[12px]">
      <SparkleIcon size={28} />
      <Text className="mt-[12px] font-display text-[30px] leading-[34px] text-white">Tell me what you ate</Text>
      <Text className="mt-[6px] font-barlow text-[15px] text-textSecondary">
        I&apos;ll make a meal card you can log with one tap. Or ask how your day is going.
      </Text>

      {paused ? null : (
        <View className="mt-[20px] gap-[10px]">
          {CHAT_STARTERS.map((starter) => (
            <Pressable
              key={starter.label}
              accessibilityRole="button"
              accessibilityLabel={starter.label}
              onPress={() => (starter.fill ? onFill(starter.fill) : onSend(starter.label))}
              className="h-[48px] justify-center self-start rounded-full border border-buttonBorder bg-secondary px-[18px] active:opacity-80"
            >
              <Text className="font-barlow-medium text-[15px] text-white">{starter.label}</Text>
            </Pressable>
          ))}
          {/*
            Voice at $0 (plan.md, A6, Sriman 2026-10-29): Expo Go refuses the
            phone's speech recogniser to a web view, so the free way to talk is
            the iOS keyboard's own mic. This line makes it findable.
          */}
          <Text className="mt-[6px] font-chat text-[13.5px] text-textSecondary">
            Prefer to talk? Tap the box, then the mic on your keyboard.
          </Text>
        </View>
      )}
    </View>
  )
}
