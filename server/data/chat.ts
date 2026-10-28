import { asc, desc, eq, inArray } from "drizzle-orm"

import type { ChatConversation, ChatMessage, ChatMessageStatus, ChatProposal } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { chatConversations, chatMessages, mealLogs } from "../db/schema"
import { uuidv7 } from "../db/uuidv7"
import { deleteOwned, insertOwned, selectOwned, updateOwned, type WriteOutcome } from "./scoped"

/**
 * The assistant's conversations (plan.md, Phase 9).
 *
 * Chat is health data. Both tables are in the deletion cascade and the Phase 11
 * export, and every function here goes through the scoped layer, so a
 * conversation id from another account reads as not found.
 */

/** A conversation's title is its first message, cut to fit a list row (Q3). */
const TITLE_CHARS = 60

/** The messages the model is shown each turn (Q9). */
export const HISTORY_MESSAGES = 20

/** `GET /api/chat/conversations`: newest first. */
export async function listConversations(scope: UserScope): Promise<ChatConversation[]> {
  const rows = await selectOwned(scope, chatConversations, {
    orderBy: desc(chatConversations.updatedAt),
  })
  return rows.map(toConversation)
}

/**
 * One conversation with its messages, oldest first, or null if this user has
 * no conversation by that id.
 *
 * A card counts as confirmed while a meal log with its minted id exists for
 * this user. That is looked up here, through the scoped layer, rather than
 * stored, so the card and the day view cannot disagree (Q10).
 */
export async function readConversation(
  scope: UserScope,
  id: string,
): Promise<{ conversation: ChatConversation; messages: ChatMessage[] } | null> {
  const [conversation] = await selectOwned(scope, chatConversations, {
    where: eq(chatConversations.id, id),
    limit: 1,
  })
  if (!conversation) return null

  const rows = await selectOwned(scope, chatMessages, {
    where: eq(chatMessages.conversationId, id),
    orderBy: [asc(chatMessages.createdAt), asc(chatMessages.id)],
  })

  const confirmed = await confirmedMealIds(scope, rows)
  return {
    conversation: toConversation(conversation),
    messages: rows.map((row) => toMessage(row, confirmed)),
  }
}

/**
 * The ids, among these messages' cards, that this user has logged. One query
 * however many cards there are.
 */
export async function confirmedMealIds(
  scope: UserScope,
  rows: Pick<typeof chatMessages.$inferSelect, "proposal">[],
): Promise<Set<string>> {
  const ids = rows.flatMap((row) => (row.proposal ? [row.proposal.meal.id] : []))
  if (ids.length === 0) return new Set()

  const logged = await selectOwned(scope, mealLogs, { where: inArray(mealLogs.id, ids) })
  return new Set(logged.map((row) => row.id))
}

/**
 * Starts the conversation if the id is new, or confirms it is this user's.
 *
 * `id-taken` means the id belongs to someone else: the insert met a conflict
 * and the scoped read cannot see the row. The route answers it as a conflict,
 * and no message is written into a conversation this user cannot read.
 */
export async function openConversation(
  scope: UserScope,
  id: string,
  firstMessage: string,
): Promise<WriteOutcome<{ created: boolean }>> {
  const inserted = await insertOwned(scope, chatConversations, {
    id,
    title: firstMessage.slice(0, TITLE_CHARS),
  })
  if (inserted.length > 0) return { ok: true, value: { created: true } }

  const [existing] = await selectOwned(scope, chatConversations, {
    where: eq(chatConversations.id, id),
    limit: 1,
  })
  if (!existing) return { ok: false, reason: "id-taken" }

  // An instant that orders the list, not a calendar day, so it is outside the
  // logging-day rule; `server/inngest/functions.ts` stamps `updated_at` the same way.
  await updateOwned(scope, chatConversations, { updatedAt: new Date() }, eq(chatConversations.id, id))
  return { ok: true, value: { created: false } }
}

/**
 * Stores the user's message before any model call, so a failed turn never
 * loses it (Q13).
 *
 * A retry sends the same id. If this user already has that message in this
 * conversation, it is answered again; an id held anywhere else is `id-taken`.
 */
export async function saveUserMessage(
  scope: UserScope,
  input: { id: string; conversationId: string; text: string },
): Promise<WriteOutcome<{ created: boolean }>> {
  const inserted = await insertOwned(scope, chatMessages, {
    id: input.id,
    conversationId: input.conversationId,
    role: "user",
    content: input.text,
  })
  if (inserted.length > 0) return { ok: true, value: { created: true } }

  const [existing] = await selectOwned(scope, chatMessages, {
    where: eq(chatMessages.id, input.id),
    limit: 1,
  })
  if (!existing || existing.conversationId !== input.conversationId || existing.role !== "user") {
    return { ok: false, reason: "id-taken" }
  }
  return { ok: true, value: { created: false } }
}

/**
 * What the model is shown of the conversation (Q9): the last
 * `HISTORY_MESSAGES` messages up to and including the one being answered, as
 * plain text.
 *
 * Replies that failed or were cut off are left out: a half sentence teaches
 * the model nothing and a retry re-answers the question anyway. The history
 * must open on a user message, so a leading reply is dropped.
 */
export async function readHistory(
  scope: UserScope,
  conversationId: string,
  upToMessageId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await selectOwned(scope, chatMessages, {
    where: eq(chatMessages.conversationId, conversationId),
    orderBy: [asc(chatMessages.createdAt), asc(chatMessages.id)],
  })

  const end = rows.findIndex((row) => row.id === upToMessageId)
  const upTo = end === -1 ? rows : rows.slice(0, end + 1)
  const usable = upTo.filter((row) => row.role === "user" || row.status === "complete")
  const recent = usable.slice(-HISTORY_MESSAGES)
  while (recent.length > 0 && recent[0]!.role !== "user") recent.shift()

  return recent.map((row) => ({ role: row.role, content: row.content }))
}

/** Stores the assistant's reply, however the turn ended. */
export async function saveAssistantMessage(
  scope: UserScope,
  input: {
    conversationId: string
    content: string
    status: ChatMessageStatus
    proposal: ChatProposal | null
    unsourcedNumbers: boolean
  },
): Promise<{ id: string }> {
  const id = uuidv7()
  await insertOwned(scope, chatMessages, {
    id,
    conversationId: input.conversationId,
    role: "assistant",
    content: input.content,
    status: input.status,
    proposal: input.proposal,
    unsourcedNumbers: input.unsourcedNumbers,
  })
  return { id }
}

/** "Delete this chat". Its messages go with it through the foreign key. */
export async function deleteConversation(scope: UserScope, id: string): Promise<boolean> {
  const rows = await deleteOwned(scope, chatConversations, eq(chatConversations.id, id))
  return rows.length > 0
}

/** "Delete all chats" (Q17). The `ai_usage` ledger stays: it holds no text. */
export async function deleteAllConversations(scope: UserScope): Promise<number> {
  const rows = await deleteOwned(scope, chatConversations)
  return rows.length
}

/**
 * Dismiss a meal card. False when this user has no card on that message.
 * Only Dismiss is stored; Confirm is the meal log itself (Q10).
 */
export async function dismissProposal(scope: UserScope, messageId: string): Promise<boolean> {
  const [row] = await selectOwned(scope, chatMessages, {
    where: eq(chatMessages.id, messageId),
    limit: 1,
  })
  if (!row?.proposal) return false

  const updated = await updateOwned(
    scope,
    chatMessages,
    { proposal: { ...row.proposal, dismissed: true } },
    eq(chatMessages.id, messageId),
  )
  return updated.length > 0
}

function toConversation(row: typeof chatConversations.$inferSelect): ChatConversation {
  return { id: row.id, title: row.title ?? "", updatedAt: row.updatedAt.toISOString() }
}

function toMessage(row: typeof chatMessages.$inferSelect, confirmed: Set<string>): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status,
    proposal: row.proposal
      ? { ...row.proposal, confirmed: confirmed.has(row.proposal.meal.id) }
      : null,
    unsourcedNumbers: row.unsourcedNumbers,
    createdAt: row.createdAt.toISOString(),
  }
}
