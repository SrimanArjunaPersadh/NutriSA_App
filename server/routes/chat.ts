import { Hono, type Context } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"

import { currentLoggingDay } from "@engine"
import { chatTurnRequestSchema, type ChatEvent } from "@shared"

import { runChatTurn, type ChatTurnResult } from "../ai/chat-turn"
import { checkAiGate } from "../ai/gate"
import { getScope, requireUser, type AppEnv } from "../auth/user-scope"
import { readAiAllowance, recordAiUsage } from "../data/ai-usage"
import {
  deleteAllConversations,
  deleteConversation,
  dismissProposal,
  listConversations,
  openConversation,
  readConversation,
  readHistory,
  saveAssistantMessage,
  saveUserMessage,
} from "../data/chat"
import { readAiConsent, writeAiConsent } from "../data/profile"
import { chatTurnRateLimit, writeRateLimit } from "../http/limits"
import { captureChatFallback, captureRouteError, traceChatTurn } from "../observability/sentry"

/**
 * The assistant (plan.md, Phase 9, `ai-chat`).
 *
 * Its own router, mounted before `writes` like `foods` and `label`, because
 * reading a chat is not a write and the wildcard write limit must not meter
 * it. The routes that change something carry `writeRateLimit` explicitly.
 *
 * | Route                                | What it does                                |
 * |--------------------------------------|---------------------------------------------|
 * | `GET /chat/conversations`            | the chat list, newest first                 |
 * | `GET /chat/conversations/:id`        | one chat with its messages and cards        |
 * | `DELETE /chat/conversations/:id`     | "Delete this chat"                          |
 * | `DELETE /chat/conversations`         | "Delete all chats"                          |
 * | `POST /chat/turns`                   | send a message; the reply streams back      |
 * | `POST /chat/messages/:id/dismiss`    | dismiss a meal card                         |
 * | `GET /ai/consent`, `PUT /ai/consent` | read, grant or withdraw AI consent          |
 * | `GET /ai/allowance`                  | "AI this month: $x of $5"                   |
 *
 * Reading and deleting chats needs no AI consent: nothing leaves this server,
 * and a user who withdrew must still be able to delete what they wrote.
 *
 * ## What is logged
 *
 * Status lines and class names. A message, a reply or a tool result is never
 * written to the console or to Sentry (Q14).
 */

export const chatRoutes = new Hono<AppEnv>()

chatRoutes.use("/chat/*", requireUser)
chatRoutes.use("/ai/*", requireUser)

const idParam = z.uuid()

function badRequest(c: Context<AppEnv>, message: string) {
  return c.json({ code: "bad-request" as const, message }, 400)
}

function notFound(c: Context<AppEnv>) {
  return c.json({ code: "not-found" as const, message: "No such chat." }, 404)
}

chatRoutes.get("/chat/conversations", async (c) => {
  return c.json({ conversations: await listConversations(getScope(c)) })
})

chatRoutes.get("/chat/conversations/:id", async (c) => {
  const id = idParam.safeParse(c.req.param("id"))
  if (!id.success) return badRequest(c, "id: expected a UUID")
  const detail = await readConversation(getScope(c), id.data)
  return detail ? c.json(detail) : notFound(c)
})

chatRoutes.delete("/chat/conversations/:id", writeRateLimit, async (c) => {
  const id = idParam.safeParse(c.req.param("id"))
  if (!id.success) return badRequest(c, "id: expected a UUID")
  const deleted = await deleteConversation(getScope(c), id.data)
  return c.json({ deleted })
})

chatRoutes.delete("/chat/conversations", writeRateLimit, async (c) => {
  const count = await deleteAllConversations(getScope(c))
  return c.json({ deleted: count })
})

chatRoutes.post("/chat/messages/:id/dismiss", writeRateLimit, async (c) => {
  const id = idParam.safeParse(c.req.param("id"))
  if (!id.success) return badRequest(c, "id: expected a UUID")
  const dismissed = await dismissProposal(getScope(c), id.data)
  if (!dismissed) return c.json({ code: "not-found" as const, message: "No such card." }, 404)
  return c.json({ dismissed })
})

chatRoutes.get("/ai/consent", async (c) => c.json(await readAiConsent(getScope(c))))

const consentBody = z.object({ granted: z.boolean() })

chatRoutes.put("/ai/consent", writeRateLimit, async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return badRequest(c, "Expected a JSON body.")
  }
  const body = consentBody.safeParse(raw)
  if (!body.success) return badRequest(c, "granted: expected true or false")
  return c.json(await writeAiConsent(getScope(c), body.data.granted))
})

chatRoutes.get("/ai/allowance", async (c) => c.json(await readAiAllowance(getScope(c))))

/**
 * `POST /chat/turns` — send a message; the reply streams back as server-sent
 * events (`ChatEvent` in `@shared`).
 *
 * Everything that can refuse the turn runs before the stream opens, and
 * answers as ordinary JSON with a status: a bad body (400), no consent (403),
 * an id that is someone else's (409), the hourly cap or a spent allowance
 * (429), an unreadable ledger (503, failing closed). The user's message is
 * stored before the model is called, so no failure after that point loses it.
 */
chatRoutes.post("/chat/turns", writeRateLimit, chatTurnRateLimit, async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return badRequest(c, "Expected a JSON body.")
  }
  // The issue's path and message only, never the value: the value is a chat message.
  const body = chatTurnRequestSchema.safeParse(raw)
  if (!body.success) {
    const issue = body.error.issues[0]
    return badRequest(c, `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}`)
  }

  const scope = getScope(c)
  const gate = await checkAiGate(scope)
  if (!gate.ok) return c.json(gate.body, gate.status)

  const { conversationId, messageId, text } = body.data
  const opened = await openConversation(scope, conversationId, text)
  if (!opened.ok) return c.json({ code: "conflict" as const, message: "That id is already in use." }, 409)
  const saved = await saveUserMessage(scope, { id: messageId, conversationId, text })
  if (!saved.ok) return c.json({ code: "conflict" as const, message: "That id is already in use." }, 409)

  const history = await readHistory(scope, conversationId, messageId)
  const today = currentLoggingDay()
  const rung = gate.allowance.rung === "cheaper" ? "cheaper" : "full"

  return streamSSE(c, async (stream) => {
    // Stop on the phone closes the connection; the model call stops with it.
    const stopped = new AbortController()
    stream.onAbort(() => stopped.abort())
    c.req.raw.signal.addEventListener("abort", () => stopped.abort())

    // Events are written in order, one after another, and a write to a closed
    // stream is ignored: the turn still finishes and is stored.
    let writing = Promise.resolve()
    const send = (event: ChatEvent) => {
      writing = writing
        .then(() => stream.writeSSE({ data: JSON.stringify(event) }))
        .catch(() => undefined)
      return writing
    }

    let result: ChatTurnResult
    try {
      result = await traceChatTurn(() =>
        runChatTurn({
          scope,
          today,
          history,
          rung,
          signal: stopped.signal,
          emit: (event) => void send(event),
          recordUsage: async (model, usage) => {
            // A failed ledger write does not fail the turn: the call is paid
            // for, and the miss is reported (`label.ts` says why).
            try {
              await recordAiUsage(scope, { feature: "chat", model, usage })
            } catch (error) {
              console.error(`ai_usage write failed for ${scope.userId}: ${error instanceof Error ? error.name : "unknown"}`)
              captureRouteError(error, scope.userId)
            }
          },
        }),
      )
    } catch (error) {
      // A lookup's database read failed. The user's message is already stored.
      console.error(`Chat turn failed for ${scope.userId}: ${error instanceof Error ? error.name : "unknown"}`)
      captureRouteError(error, scope.userId)
      result = {
        text: "",
        status: "failed",
        proposal: null,
        unsourced: [],
        outcome: "error",
        rung,
        error: "upstream-failed",
        fellBack: false,
      }
    }

    if (result.fellBack) captureChatFallback()

    let stored: { id: string }
    try {
      stored = await saveAssistantMessage(scope, {
        conversationId,
        content: result.text,
        status: result.status,
        proposal: result.proposal,
        unsourcedNumbers: result.unsourced.length > 0,
      })
    } catch (error) {
      console.error(`Chat reply not stored for ${scope.userId}: ${error instanceof Error ? error.name : "unknown"}`)
      captureRouteError(error, scope.userId)
      await send({ type: "error", code: "server-error" })
      return
    }

    if (result.error) {
      await send({ type: "error", code: result.error })
      return
    }
    if (result.proposal) {
      await send({ type: "proposal", proposal: { ...result.proposal, confirmed: false } })
    }
    await send({
      type: "done",
      messageId: stored.id,
      unsourcedNumbers: result.unsourced.length > 0,
      rung: result.rung,
    })
  })
})
