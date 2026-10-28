import { addDays, currentLoggingDay, type LogDay } from "@engine"
import type { ApiErrorCode, ChatMessage, ChatMessageStatus, ChatProposal, ChatToolName } from "@shared"

import { formatDayWithWeekday } from "@/lib/format"

/**
 * The assistant tab's logic, kept out of the screens so it is tested in Node
 * (plan.md, Phase 9, `ai-chat-app`, A1–A11). No React, no network, no
 * arithmetic on anyone's data: every number a reply or a card shows came from
 * the server's engine.
 */

/** One line per lookup while the reply is being worked out (Q7, A10). */
export const CHAT_STATUS_LINES: Record<ChatToolName, string> = {
  get_day_summary: "Checking today's log",
  get_remaining_macros: "Checking what's left",
  get_weight_trend: "Looking at your weight trend",
  get_targets: "Checking your targets",
  get_saved_meals: "Looking at your saved meals",
  search_foods: "Searching your foods",
  propose_meal_log: "Making your meal card",
}

/** The same steps once done, for the ticked rows of the checklist (C2). */
export const CHAT_STATUS_DONE: Record<ChatToolName, string> = {
  get_day_summary: "Checked today's log",
  get_remaining_macros: "Checked what's left",
  get_weight_trend: "Looked at your weight trend",
  get_targets: "Checked your targets",
  get_saved_meals: "Looked at your saved meals",
  search_foods: "Searched your foods",
  propose_meal_log: "Made your meal card",
}

/**
 * One row of the "while it works" checklist (plan.md, Phase 9, C2): ticked
 * when done, shimmering while it runs. Seeing the work and what it is for
 * makes a wait feel shorter (Buell and Norton's labour illusion, 2011;
 * Maister's explained waits).
 */
export type TurnStep = { tool: ChatToolName; done: boolean }

/**
 * The checklist from the lookups a turn has started, in order. A lookup run
 * twice (two foods searched) is one row; the one running now is last and not
 * done. With no lookup running, every row is done.
 */
export function turnSteps(tools: readonly ChatToolName[], current: ChatToolName | null): TurnStep[] {
  const seen: ChatToolName[] = []
  for (const tool of tools) if (!seen.includes(tool)) seen.push(tool)
  const done = seen.filter((tool) => tool !== current).map((tool) => ({ tool, done: true }))
  return current ? [...done, { tool: current, done: false }] : done
}

/** The three starters on a new chat (Q25), the first filling the box (A5). */
export const CHAT_STARTERS = [
  { label: "Log my breakfast", fill: "For breakfast I had " },
  { label: "What's left for today?", fill: null },
  { label: "How am I doing today?", fill: null },
] as const

/** A character count appears under the box from here (2,000 is the cap). */
export const CHAT_COUNT_FROM = 1800

/**
 * A reply as plain text (A9). The prompt asks for no headings or tables, but
 * the model still reaches for bold and bullets. Emphasis marks go, line breaks
 * and "- " bullets stay, and a "* " bullet becomes "- " so it is not read as a
 * stray star. Nothing is parsed as markup, so nothing in a reply can style the
 * screen.
 */
export function plainReply(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*+]\s+/gm, "$1- ")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)\*(?!\w)/g, "$1$2")
}

/**
 * Where a meal card stands (Q5, A3). Confirmed wins over everything: a meal
 * that exists is logged whatever day the card was made. A card from an earlier
 * day cannot be confirmed, because the card's meal is dated the day it was made
 * and Q5 logs today only.
 */
export type CardState = "logged" | "dismissed" | "expired" | "open"

export function cardState(
  proposal: Pick<ChatProposal, "day" | "dismissed"> & { confirmed: boolean },
  today: LogDay,
): CardState {
  if (proposal.confirmed) return "logged"
  if (proposal.dismissed) return "dismissed"
  if (proposal.day !== today) return "expired"
  return "open"
}

/** "From Mon 26 Oct. Ask again to log it today." (A3). */
export function expiredCardNote(day: LogDay): string {
  return `From ${formatDayWithWeekday(day)}. Ask again to log it today.`
}

/** The message a Retry sends again: the same ids, so it is not a new question. */
export type RetryTarget = { messageId: string; text: string }

/**
 * A turn being sent or streamed, held on the phone until the server's copy of
 * the conversation has its reply. Never persisted (Q19).
 *
 * `repliesBefore` is how many replies already answered this message when the
 * turn started: a Retry answers a message that already has a cut-off reply,
 * and the turn is only over once a newer one is stored (A4).
 */
export type LiveTurn = {
  conversationId: string
  messageId: string
  text: string
  repliesBefore: number
  reply: string
  tool: ChatToolName | null
  /** Every lookup started this turn, in order, for the checklist (C2). */
  tools: ChatToolName[]
  proposal: (ChatProposal & { confirmed: boolean }) | null
  phase: "streaming" | "done" | "cut_off" | "failed"
  /** From the `done` event: the reply holds a number no lookup returned (Q30). */
  unsourcedNumbers: boolean
  /** Why a failed turn failed, as the copy to show. */
  failure: string | null
  /** Whether a failed turn is worth retrying as it is. */
  retryable: boolean
}

export type ChatRow =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "reply"
      id: string
      text: string
      status: ChatMessageStatus | "streaming"
      tool: ChatToolName | null
      /** The checklist while the reply has no text yet; empty otherwise. */
      steps: TurnStep[]
      proposal: (ChatProposal & { confirmed: boolean }) | null
      unsourcedNumbers: boolean
      failure: string | null
      retry: RetryTarget | null
    }

/** How many replies follow a user message, up to the next one. */
export function repliesTo(messages: readonly ChatMessage[], messageId: string): number {
  const at = messages.findIndex((message) => message.id === messageId)
  if (at === -1) return 0
  let count = 0
  for (const message of messages.slice(at + 1)) {
    if (message.role === "user") break
    count += 1
  }
  return count
}

const COULD_NOT_ANSWER = "Couldn't answer. Try again."

/**
 * The conversation as the screen draws it: the server's messages, then the
 * turn in flight where the server has not caught up with it.
 *
 * ## Retry (Q13, A4)
 *
 * Offered on a cut-off or failed reply only when it is the newest reply to the
 * newest message. An older one keeps its "Cut off" label without the button:
 * its answer would be stored at the end of the chat, under a later question.
 * While a turn for that message is in flight, the stored reply loses the
 * button too.
 */
export function chatRows(messages: readonly ChatMessage[], turn: LiveTurn | null): ChatRow[] {
  const lastUser = [...messages].reverse().find((message) => message.role === "user") ?? null
  const lastMessage = messages.at(-1) ?? null

  // A turn the server has stored a reply for is over: the stored copy is drawn.
  const stored = turn !== null && messages.some((message) => message.id === turn.messageId)
  const live =
    turn !== null && !(stored && repliesTo(messages, turn.messageId) > turn.repliesBefore) ? turn : null

  const rows: ChatRow[] = []
  let answering: ChatMessage | null = null

  for (const message of messages) {
    if (message.role === "user") {
      answering = message
      rows.push({ kind: "user", id: message.id, text: message.content })
      continue
    }

    const retryable =
      message.status !== "complete" &&
      answering !== null &&
      answering.id === lastUser?.id &&
      message.id === lastMessage?.id &&
      !(live !== null && live.messageId === answering.id)

    rows.push({
      kind: "reply",
      id: message.id,
      text: plainReply(message.content),
      status: message.status,
      tool: null,
      steps: [],
      proposal: message.proposal,
      unsourcedNumbers: message.unsourcedNumbers,
      failure: message.status === "failed" ? COULD_NOT_ANSWER : null,
      retry: retryable && answering ? { messageId: answering.id, text: answering.content } : null,
    })
  }

  if (!live) return rows
  if (!stored) rows.push({ kind: "user", id: live.messageId, text: live.text })

  rows.push({
    kind: "reply",
    id: `live-${live.messageId}`,
    text: plainReply(live.reply),
    status: live.phase === "done" ? "complete" : live.phase,
    tool: live.phase === "streaming" ? live.tool : null,
    steps: live.phase === "streaming" ? turnSteps(live.tools, live.tool) : [],
    proposal: live.proposal,
    unsourcedNumbers: live.unsourcedNumbers,
    failure: live.failure,
    retry:
      (live.phase === "cut_off" || live.phase === "failed") && live.retryable
        ? { messageId: live.messageId, text: live.text }
        : null,
  })
  return rows
}

/**
 * Why a turn did not get an answer, in the app's words (Q13). `null` means the
 * code is not a failure of the turn: a refusal is an answer.
 */
export function turnFailure(code: ApiErrorCode | "network" | "malformed-response" | "no-api-url"): {
  copy: string
  retryable: boolean
} {
  switch (code) {
    case "network":
      return { copy: "Couldn't reach the server. Try again.", retryable: true }
    case "rate-limited":
      return { copy: "That's a lot of messages this hour. Try again later.", retryable: false }
    case "ai-allowance-used":
      return { copy: "This month's AI allowance is used up.", retryable: false }
    case "ai-consent-required":
      return { copy: "AI features are off.", retryable: false }
    case "bad-request":
      return { copy: "That message couldn't be sent.", retryable: false }
    default:
      return { copy: COULD_NOT_ANSWER, retryable: true }
  }
}

/**
 * A chat's place in the list: "Today", "Yesterday", or "Mon 26 Oct", as the
 * SAST logging day its last message landed on. The day comes from the engine's
 * one time authority; only the label is chosen here.
 */
export function chatDayLabel(updatedAt: string, today: LogDay = currentLoggingDay()): string {
  const day = currentLoggingDay(new Date(updatedAt))
  if (day === today) return "Today"
  if (day === addDays(today, -1)) return "Yesterday"
  return formatDayWithWeekday(day)
}
