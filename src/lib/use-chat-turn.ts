import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/expo"
import { useQueryClient } from "@tanstack/react-query"

import { CHAT_REFUSAL_TEXT, type ChatEvent, type ChatMessage } from "@shared"

import { ApiError, apiPostStream } from "@/lib/api"
import { repliesTo, turnFailure, type LiveTurn, type RetryTarget } from "@/lib/chat"
import { readChatEvents } from "@/lib/chat-stream"
import { queryKeys } from "@/lib/queries"
import { uuidv7 } from "@/lib/uuid"

/**
 * Sends one turn and follows its reply as it streams (plan.md, Phase 9, Q7,
 * Q13).
 *
 * The turn lives in component state while it runs and is drawn over the
 * server's copy of the chat by `chatRows` until that copy has the reply. When
 * it ends, however it ends, every chat read is refetched: the server stores
 * both messages, a cut-off reply included, so the stored copy is the record.
 *
 * ## Stop, and a lost connection
 *
 * Both abort the body's read and keep what arrived, marked "Cut off" with
 * Retry. Stop aborts on purpose; the server sees the phone hang up and stops
 * the model with it. The stored cut-off reply can land a moment after the
 * phone gives up, so the chat is read once more shortly after.
 *
 * ## Leaving the app does not stop a reply
 *
 * The request is native (`expo/fetch`), and iOS keeps it running while the
 * app is away; the reply is there on return (Sriman, iPhone, 2026-10-28).
 * Aborting on `AppState` "background" was tried after the review and undone:
 * pulling down the notification screen counts as background too, and it cut
 * off replies that had already arrived. Only a real lost connection is a
 * cut-off.
 *
 * Leaving the screen aborts the turn: signing out unmounts the tabs, so no
 * reply keeps arriving for someone who has gone.
 */
export function useChatTurn(messages: readonly ChatMessage[]) {
  const { userId, getToken } = useAuth()
  const client = useQueryClient()
  const [live, setLive] = useState<LiveTurn | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: queryKeys.allChats(userId) })
    void client.invalidateQueries({ queryKey: queryKeys.aiAllowance(userId) })
  }

  async function run(turn: Pick<LiveTurn, "conversationId" | "messageId" | "text" | "repliesBefore">) {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort

    setLive({
      ...turn,
      reply: "",
      tool: null,
      tools: [],
      proposal: null,
      phase: "streaming",
      unsourcedNumbers: false,
      failure: null,
      retryable: true,
    })
    const update = (change: (current: LiveTurn) => LiveTurn) =>
      setLive((current) => (current && current.messageId === turn.messageId ? change(current) : current))

    const onEvent = (event: ChatEvent) => {
      switch (event.type) {
        case "status":
          update((current) => ({ ...current, tool: event.tool, tools: [...current.tools, event.tool] }))
          return
        case "text":
          update((current) => ({ ...current, tool: null, reply: current.reply + event.text }))
          return
        case "proposal":
          update((current) => ({ ...current, proposal: event.proposal }))
          return
        case "done":
          update((current) => ({
            ...current,
            tool: null,
            phase: "done",
            unsourcedNumbers: event.unsourcedNumbers,
          }))
          return
        case "error": {
          // A refusal is an answer, stored as one (Q8).
          if (event.code === "refused") {
            update((current) => ({ ...current, tool: null, reply: CHAT_REFUSAL_TEXT, phase: "done" }))
            return
          }
          const failure = turnFailure(event.code)
          update((current) => ({
            ...current,
            tool: null,
            reply: "",
            phase: "failed",
            failure: failure.copy,
            retryable: failure.retryable,
          }))
          return
        }
      }
    }

    let cutOff = false
    try {
      const body = await apiPostStream(
        "/api/chat/turns",
        { conversationId: turn.conversationId, messageId: turn.messageId, text: turn.text },
        getToken,
        abort.signal,
      )
      const end = await readChatEvents(body, onEvent, abort.signal)
      if (end.kind === "cut_off") {
        cutOff = true
        update((current) => ({ ...current, tool: null, phase: "cut_off" }))
      }
    } catch (error) {
      if (abort.signal.aborted) {
        cutOff = true
        update((current) => ({ ...current, tool: null, phase: "cut_off" }))
      } else {
        const code = error instanceof ApiError ? error.code : "network"
        const failure = turnFailure(code)
        update((current) => ({ ...current, tool: null, phase: "failed", failure: failure.copy, retryable: failure.retryable }))
        if (code === "ai-consent-required") {
          void client.invalidateQueries({ queryKey: queryKeys.aiConsent(userId) })
        }
      }
    } finally {
      if (controller.current === abort) controller.current = null
      invalidate()
      if (cutOff) setTimeout(() => void client.invalidateQueries({ queryKey: queryKeys.allChats(userId) }), 2000)
    }
  }

  return {
    live,
    streaming: live?.phase === "streaming",
    /** A new message. Both ids are minted here; a retry reuses them. */
    send: (conversationId: string, text: string) =>
      void run({ conversationId, messageId: uuidv7(), text, repliesBefore: 0 }),
    /** The same message again, answered afresh (A4). */
    retry: (conversationId: string, target: RetryTarget) =>
      void run({
        conversationId,
        messageId: target.messageId,
        text: target.text,
        repliesBefore: repliesTo(messages, target.messageId),
      }),
    stop: () => controller.current?.abort(),
  }
}
