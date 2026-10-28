import { z } from "zod"

import { AI_BUDGET_RUNGS, MEAL_SLOTS } from "@engine"

import { logDaySchema } from "./common"
import { clientIdSchema, writeMealSchema } from "./writes"

/**
 * The assistant's contract (plan.md, Phase 9, `ai-chat`).
 *
 * The client sends one message; the server answers with a stream of events
 * while the model looks things up and writes, then stores both messages. A
 * conversation is read back as plain messages, each with at most one meal card.
 *
 * ## The assistant cannot write
 *
 * A meal card carries a complete `POST /meal-logs` body, built by the server
 * from stored food rows with the engine's numbers. Confirming it is the
 * client posting that body to the ordinary route. There is no assistant write
 * route, and nothing here names one.
 */

/**
 * What a declined reply reads as (Q8), stored as the assistant's message and
 * shown by the app. One string, so the two cannot drift.
 */
export const CHAT_REFUSAL_TEXT = "I can't help with that one."

/** The longest message a user may send (Q11). Message length is money. */
export const CHAT_MESSAGE_MAX_CHARS = 2000

/**
 * `POST /api/chat/turns`.
 *
 * Both ids are minted by the client, like every other write's. A retried send
 * reuses them, so a turn whose response was lost is not asked twice. A new
 * `conversationId` starts a conversation; its title is this message.
 */
export const chatTurnRequestSchema = z.object({
  conversationId: clientIdSchema,
  messageId: clientIdSchema,
  text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS),
})

export type ChatTurnRequest = z.infer<typeof chatTurnRequestSchema>

/**
 * A meal the assistant proposed. `meal` is the exact `POST /meal-logs` body:
 * its `id` was minted when the card was made, so confirming twice logs once,
 * and its `date` is the logging day the card was made on.
 *
 * Only Dismiss is stored. Whether the card was confirmed is read from
 * `meal_logs` at read time (`confirmed` below), so it cannot disagree with it.
 */
export const chatProposalSchema = z.object({
  day: logDaySchema,
  slot: z.enum(MEAL_SLOTS),
  meal: writeMealSchema,
  dismissed: z.boolean(),
})

export type ChatProposal = z.infer<typeof chatProposalSchema>

/**
 * - `complete`: the reply finished
 * - `cut_off`: the user pressed Stop or the connection dropped; the text that
 *   arrived is kept
 * - `failed`: no usable reply; the user's message is kept for a retry
 */
export const CHAT_MESSAGE_STATUSES = ["complete", "cut_off", "failed"] as const

export type ChatMessageStatus = (typeof CHAT_MESSAGE_STATUSES)[number]

export const chatMessageSchema = z.object({
  id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status: z.enum(CHAT_MESSAGE_STATUSES),
  proposal: chatProposalSchema
    .extend({
      /** A meal log with the card's id exists for this user. */
      confirmed: z.boolean(),
    })
    .nullable(),
  /** The reply holds a number no lookup returned (Q30). */
  unsourcedNumbers: z.boolean(),
  createdAt: z.string(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatConversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  updatedAt: z.string(),
})

export type ChatConversation = z.infer<typeof chatConversationSchema>

/** `GET /api/chat/conversations`, newest first. */
export const chatConversationListSchema = z.object({
  conversations: z.array(chatConversationSchema),
})

/** `GET /api/chat/conversations/:id`, oldest message first. */
export const chatConversationDetailSchema = z.object({
  conversation: chatConversationSchema,
  messages: z.array(chatMessageSchema),
})

/** The lookups the assistant may make, named as the model sees them. */
export const CHAT_TOOL_NAMES = [
  "get_day_summary",
  "get_remaining_macros",
  "get_weight_trend",
  "get_targets",
  "get_saved_meals",
  "search_foods",
  "propose_meal_log",
] as const

export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number]

export function isChatToolName(name: string): name is ChatToolName {
  return (CHAT_TOOL_NAMES as readonly string[]).includes(name)
}

const rungSchema = z.enum(AI_BUDGET_RUNGS)

/**
 * - `full`: the chat model
 * - `cheaper`: past $4, the cheaper model for the rest of the month
 * - `exhausted`: past $5, no AI until `resetsOn`
 */
export const aiAllowanceSchema = z.object({
  spentUsd: z.number(),
  budgetUsd: z.number(),
  rung: rungSchema,
  resetsOn: logDaySchema,
})

export type AiAllowance = z.infer<typeof aiAllowanceSchema>

/**
 * One server-sent event of a turn, sent as `data: <json>`.
 *
 * - `status`: a lookup started, for the "Checking today's log" line (Q7)
 * - `text`: the next piece of the reply
 * - `proposal`: a meal card, once the reply is done
 * - `done`: the reply is stored; `rung` says which model answered
 * - `error`: the turn ended without a reply. `code` is the shared error code
 */
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), tool: z.enum(CHAT_TOOL_NAMES) }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("proposal"),
    proposal: chatProposalSchema.extend({ confirmed: z.boolean() }),
  }),
  z.object({
    type: z.literal("done"),
    messageId: z.uuid(),
    unsourcedNumbers: z.boolean(),
    rung: rungSchema.exclude(["exhausted"]),
  }),
  z.object({
    type: z.literal("error"),
    code: z.enum(["upstream-failed", "refused", "ai-allowance-used", "server-error"]),
  }),
])

export type ChatEvent = z.infer<typeof chatEventSchema>

/** `GET /api/ai/consent` and the answer to granting or withdrawing it. */
export const aiConsentSchema = z.object({
  consentedAt: z.string().nullable(),
})

export type AiConsent = z.infer<typeof aiConsentSchema>
