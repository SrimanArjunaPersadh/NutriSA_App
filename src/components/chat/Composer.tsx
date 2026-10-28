import { forwardRef } from "react"
import { Pressable, Text, TextInput, View, type TextInputInstance } from "react-native"

import { CHAT_MESSAGE_MAX_CHARS } from "@shared"

import { SendIcon, StopIcon } from "@/components/icons/UiIcons"
import { colors } from "@/design/tokens"
import { CHAT_COUNT_FROM } from "@/lib/chat"
import { withThousands } from "@/lib/format"

/**
 * The message box (plan.md, Phase 9, Q11, Q13, A6). Grows to a few lines, stops
 * at 2,000 characters with a count from 1,800, and turns its send button into
 * Stop while a reply is arriving. No mic of its own: the iOS keyboard's
 * dictation is the voice input (A6).
 */
export const Composer = forwardRef<
  TextInputInstance,
  {
    value: string
    onChange: (text: string) => void
    onSend: () => void
    onStop: () => void
    streaming: boolean
  }
>(function Composer({ value, onChange, onSend, onStop, streaming }, ref) {
  const canSend = !streaming && value.trim().length > 0

  return (
    <View>
      <View className="flex-row items-end gap-[8px] rounded-[24px] border border-buttonBorder bg-card py-[4px] pl-[16px] pr-[4px]">
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChange}
          placeholder="Message your coach"
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={CHAT_MESSAGE_MAX_CHARS}
          accessibilityLabel="Message your coach"
          className="max-h-[120px] min-h-[44px] flex-1 py-[11px] font-chat text-[15.5px] text-white"
          // The box is the screen's only field; Return adds a line, the button sends.
          submitBehavior="newline"
          selectionColor={colors.primary}
        />

        {streaming ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop the reply"
            onPress={onStop}
            className="h-[44px] w-[44px] items-center justify-center rounded-full bg-primary active:opacity-80"
          >
            <StopIcon size={14} color={colors.ground} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={onSend}
            className={`h-[44px] w-[44px] items-center justify-center rounded-full ${canSend ? "bg-primary active:opacity-80" : "bg-secondary"}`}
          >
            <SendIcon size={18} color={canSend ? colors.ground : colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {value.length >= CHAT_COUNT_FROM ? (
        <Text className="mt-[4px] self-end pr-[8px] font-barlow text-[12px] text-textSecondary">
          {`${withThousands(value.length)} / ${withThousands(CHAT_MESSAGE_MAX_CHARS)}`}
        </Text>
      ) : null}
    </View>
  )
})
