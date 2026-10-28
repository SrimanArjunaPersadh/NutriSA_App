import Anthropic from "@anthropic-ai/sdk"

import type { AiAnsweringRung, LogDay, ModelId, TokenUsage } from "@engine"
import {
  CHAT_REFUSAL_TEXT,
  isChatToolName,
  type ChatMessageStatus,
  type ChatProposal,
  type ChatToolName,
} from "@shared"

import type { UserScope } from "../auth/user-scope"
import { CHAT_SYSTEM_PROMPT, HELPLINE_PHRASES, todayLine } from "./chat-prompt"
import { CHAT_TOOLS, LOOKBACK_PHRASE, newToolContext, runTool, todaySnapshot } from "./chat-tools"
import {
  anthropic,
  CHAT_EFFORT,
  CHAT_FALLBACK_MODEL,
  CHAT_MAX_LOOKUPS,
  CHAT_MAX_TOKENS,
  CHAT_MODEL,
  CHAT_TURN_TIMEOUT_MS,
} from "./config"
import { unsourcedNumbers } from "./number-check"

/**
 * One assistant turn (plan.md, Phase 9): the model call, its lookups, and the
 * reply streamed as it is written.
 *
 * ## Synchronous, like the label reader
 *
 * The user is watching the reply type out, so it cannot be queued. It runs
 * inside the request, bounded by `CHAT_TURN_TIMEOUT_MS` across every model
 * call and lookup, with no SDK retries.
 *
 * ## Spend is recorded even when a turn is cut short
 *
 * A stream's first event reports the input and cache tokens and every
 * `message_delta` the output so far, so a turn that is stopped, times out or
 * fails part way still reports what it used. Only a call that dies before its
 * first event goes unrecorded; the budget's headroom under the Console cap is
 * for those (Q2).
 *
 * ## What reaches the logs
 *
 * Error class names and nothing else. The messages, the tool results and an
 * SDK error's `message` (which can echo the request) never reach the console
 * or Sentry (Q14, Q20).
 */

/** How a turn ended: the Sentry span's only attribute (Q14). */
export type ChatTurnOutcome =
  | "ok"
  | "unsourced_number"
  | "cut_off"
  | "timeout"
  | "refused"
  | "error"

/**
 * What the turn tells the phone while it runs. A meal card goes the moment
 * `propose_meal_log` makes it, not after the reply's last sentence: the card
 * is what the user came for, and the sentence after it is a whole model call
 * (Sriman, iPhone, 2026-10-28: "way too slow"). A second card in the same turn
 * replaces the first.
 */
export type ChatTurnEvent =
  | { type: "status"; tool: ChatToolName }
  | { type: "text"; text: string }
  | { type: "proposal"; proposal: ChatProposal }

export type ChatTurnInput = {
  scope: UserScope
  today: LogDay
  /** Oldest first, ending with the message being answered. */
  history: { role: "user" | "assistant"; content: string }[]
  /** `cheaper` runs the whole turn on the fallback model (Q8). */
  rung: AiAnsweringRung
  /** The request's own signal: aborted when the user taps Stop or drops off. */
  signal: AbortSignal
  emit: (event: ChatTurnEvent) => void
  /** Called once per model call that reported usage, however it ended. */
  recordUsage: (model: ModelId, usage: TokenUsage) => Promise<void>
}

export type ChatTurnResult = {
  text: string
  status: ChatMessageStatus
  proposal: ChatProposal | null
  unsourced: number[]
  outcome: ChatTurnOutcome
  /** Which model answered, for the `done` event. */
  rung: AiAnsweringRung
  /** Set when the turn produced no reply the user can read. */
  error: "upstream-failed" | "refused" | null
  /** Set when the chat model failed and the turn was retried on the fallback. */
  fellBack: boolean
}

type Attempt = {
  text: string
  stop: "end" | "refused" | "truncated" | "aborted" | "timeout" | "failed" | "unavailable"
  proposal: ChatProposal | null
  toolResults: string[]
}

/**
 * Runs a turn. Never throws for an upstream failure; a database failure inside
 * a lookup does throw, and the route stores the turn as failed.
 */
export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const client = anthropic()
  if (!client) return failed(input.rung, false)

  const deadline = AbortSignal.timeout(CHAT_TURN_TIMEOUT_MS)
  const signal = AbortSignal.any([input.signal, deadline])
  const timings = new TurnTimings()

  // Today's log, read once for both attempts. A failed read is not fatal: the
  // model still has `get_day_summary`, and that read failing ends the turn.
  let today: string | null = null
  const read = timings.start("today")
  try {
    today = await todaySnapshot(input.scope, input.today)
  } catch (error) {
    console.warn(`Today's log not read for the chat: ${error instanceof Error ? error.constructor.name : "unknown error"}`)
  }
  read()

  let model: ModelId = input.rung === "cheaper" ? CHAT_FALLBACK_MODEL : CHAT_MODEL
  let attempt = await attemptTurn(client, model, input, today, signal, timings)
  let fellBack = false

  // The chat model overloaded or down, with nothing shown yet: the turn runs
  // again on the cheaper model rather than dying (Q8). A card already on the
  // screen counts as shown: a rerun would make a second card with another id.
  if (
    attempt.stop === "unavailable" &&
    model === CHAT_MODEL &&
    attempt.text === "" &&
    attempt.proposal === null &&
    !signal.aborted
  ) {
    console.warn("Chat model unavailable; retrying the turn on the fallback model")
    model = CHAT_FALLBACK_MODEL
    fellBack = true
    attempt = await attemptTurn(client, model, input, today, signal, timings)
  }

  const rung = model === CHAT_MODEL ? "full" : "cheaper"
  const result = settle(attempt, input, today, rung, fellBack, deadline.aborted)
  console.info(timings.line(result.outcome))
  return result
}

/**
 * Where a turn's time went, as one server log line (plan.md, Phase 9,
 * `ai-chat-app`, B1): "today 180ms · model 3100ms (text 2900ms) ·
 * search_foods 210ms · model 2400ms · total 5900ms". Step names and
 * milliseconds only, never a message, a result or a user id (Q14).
 */
class TurnTimings {
  private readonly began = performance.now()
  private readonly steps: string[] = []

  /** Starts a step; the function it returns ends it. */
  start(label: string): (note?: string) => void {
    const from = performance.now()
    return (note) => {
      const ms = Math.round(performance.now() - from)
      this.steps.push(`${label} ${ms}ms${note ? ` (${note})` : ""}`)
    }
  }

  /** Milliseconds since the step began, for "text arrived at". */
  since(from: number): number {
    return Math.round(performance.now() - from)
  }

  line(outcome: ChatTurnOutcome): string {
    const total = Math.round(performance.now() - this.began)
    return `Chat turn ${outcome}: ${[...this.steps, `total ${total}ms`].join(" · ")}`
  }
}

/** The model's view of today: the date, then the log it would otherwise look up. */
function todayMessage(today: LogDay, snapshot: string | null): string {
  if (!snapshot) return todayLine(today)
  return `${todayLine(today)}\n\nToday's log and targets, the same as get_day_summary and get_targets return for today:\n${snapshot}`
}

function settle(
  attempt: Attempt,
  input: ChatTurnInput,
  snapshot: string | null,
  rung: AiAnsweringRung,
  fellBack: boolean,
  timedOut: boolean,
): ChatTurnResult {
  const text = attempt.text.trim()
  const base = { rung, fellBack, unsourced: [] as number[] }

  if (attempt.stop === "refused") {
    return {
      ...base,
      text: CHAT_REFUSAL_TEXT,
      status: "complete",
      proposal: null,
      outcome: "refused",
      error: "refused",
    }
  }

  // A turn that made its card and then lost the sentence after it is cut off,
  // not failed: the card the phone already shows is stored with it, so it
  // stays confirmable and its id stays the one on the screen.
  const lost = attempt.stop === "failed" || attempt.stop === "unavailable"
  const cut =
    attempt.stop === "aborted" ||
    attempt.stop === "timeout" ||
    attempt.stop === "truncated" ||
    (lost && attempt.proposal !== null)
  if ((lost && attempt.proposal === null) || (cut && text === "" && attempt.proposal === null)) {
    return {
      ...base,
      text: "",
      status: "failed",
      proposal: null,
      outcome: timedOut || attempt.stop === "timeout" ? "timeout" : "error",
      error: "upstream-failed",
    }
  }

  // The prompt is not a source: its helpline digits are blanked as `fixed`
  // instead, so they cannot vouch for an invented number (number-check.ts).
  const sources = [
    todayLine(input.today),
    ...(snapshot ? [snapshot] : []),
    ...input.history.filter((message) => message.role === "user").map((message) => message.content),
    ...attempt.toolResults,
  ]
  const unsourced = unsourcedNumbers(text, sources, [...HELPLINE_PHRASES, LOOKBACK_PHRASE])

  if (cut) {
    return {
      ...base,
      text,
      unsourced,
      status: "cut_off",
      proposal: attempt.proposal,
      outcome: lost ? "error" : attempt.stop === "timeout" || timedOut ? "timeout" : "cut_off",
      error: null,
    }
  }

  return {
    ...base,
    text,
    unsourced,
    status: "complete",
    proposal: attempt.proposal,
    outcome: unsourced.length > 0 ? "unsourced_number" : "ok",
    error: null,
  }
}

function failed(rung: AiAnsweringRung, fellBack: boolean): ChatTurnResult {
  return {
    text: "",
    status: "failed",
    proposal: null,
    unsourced: [],
    outcome: "error",
    rung,
    error: "upstream-failed",
    fellBack,
  }
}

/**
 * One model's go at the turn: model call, lookups, model call, until it
 * answers, the lookups run out, or the turn is stopped.
 */
async function attemptTurn(
  client: Anthropic,
  model: ModelId,
  input: ChatTurnInput,
  snapshot: string | null,
  signal: AbortSignal,
  timings: TurnTimings,
): Promise<Attempt> {
  const ctx = newToolContext(input.scope, input.today)
  const toolResults: string[] = []
  let text = ""
  let lookups = 0

  // History, then the date and today's log, which change every turn, so they
  // come last, after the cached rules and tools (Q9).
  //
  // The history itself is not read back from cache on the next turn. A
  // breakpoint on the newest history message was tried after the review and
  // removed (Sriman, 2026-10-29): on the real API turn 2 still read only the
  // rules and tools, and Anthropic's cache diagnostics said only
  // `messages_changed`. Worth about half a cent a message in a long chat; look
  // again if chats get long enough for that to matter.
  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((message) => ({ role: message.role, content: message.content })),
    { role: "system", content: todayMessage(input.today, snapshot) },
  ]

  // Each lookup round is one call; one more lets the model answer after the
  // last lookup or after being told the lookups ran out.
  for (let call = 0; call <= CHAT_MAX_LOOKUPS + 1; call += 1) {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    let started = false
    let final: Anthropic.Message

    // Text after a lookup starts a new paragraph, in the stream and the
    // stored reply alike, so the phone and the database show the same thing.
    let paragraph = text !== "" && !/\s$/.test(text)
    const callStarted = performance.now()
    const callDone = timings.start("model")
    let firstText: number | null = null
    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: CHAT_MAX_TOKENS,
          // The breakpoint after the rules caches the tool definitions too,
          // which render before them. The top-level one caches the whole
          // request so far, for the next call in this turn.
          system: [{ type: "text", text: CHAT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          cache_control: { type: "ephemeral" },
          tools: CHAT_TOOLS,
          output_config: { effort: CHAT_EFFORT },
          messages,
        },
        { signal, timeout: CHAT_TURN_TIMEOUT_MS, maxRetries: 0 },
      )

      for await (const event of stream) {
        if (event.type === "message_start") {
          started = true
          usage.inputTokens = event.message.usage.input_tokens
          usage.outputTokens = event.message.usage.output_tokens
          usage.cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0
          usage.cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0
        } else if (event.type === "message_delta") {
          usage.outputTokens = event.usage.output_tokens
          if (event.usage.input_tokens != null) usage.inputTokens = event.usage.input_tokens
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          firstText ??= timings.since(callStarted)
          const piece = paragraph ? `\n\n${event.delta.text}` : event.delta.text
          paragraph = false
          text += piece
          input.emit({ type: "text", text: piece })
        }
      }
      final = await stream.finalMessage()
    } catch (error) {
      callDone("ended early")
      if (started) await input.recordUsage(model, usage)
      return { text, stop: classify(error, signal, input.signal), proposal: ctx.proposal, toolResults }
    }
    callDone(firstText === null ? undefined : `text ${firstText}ms`)

    await input.recordUsage(model, usage)

    switch (final.stop_reason) {
      case "refusal":
        return { text, stop: "refused", proposal: null, toolResults }
      case "max_tokens":
      case "model_context_window_exceeded":
        return { text, stop: "truncated", proposal: ctx.proposal, toolResults }
      case "tool_use":
        break
      default:
        return { text, stop: "end", proposal: ctx.proposal, toolResults }
    }

    // Every tool result goes back in one user message, in call order.
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const block of final.content) {
      if (block.type !== "tool_use") continue
      lookups += 1
      if (lookups > CHAT_MAX_LOOKUPS) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: "No more lookups this turn. Answer with what you have." }),
          is_error: true,
        })
        continue
      }
      // Only a declared tool gets a status line; anything else falls through
      // to `runTool`, which answers the model with an error it can read.
      if (isChatToolName(block.name)) input.emit({ type: "status", tool: block.name })
      const lookupDone = timings.start(isChatToolName(block.name) ? block.name : "unknown tool")
      const result = await runTool(ctx, block.name, block.input)
      lookupDone()
      if (block.name === "propose_meal_log" && !result.isError && ctx.proposal) {
        input.emit({ type: "proposal", proposal: ctx.proposal })
      }
      toolResults.push(result.content)
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError,
      })
    }

    // The assistant turn goes back whole, thinking blocks included and
    // unchanged, so the conversation stays append-only within the turn.
    messages.push({ role: "assistant", content: final.content }, { role: "user", content: results })
    if (signal.aborted) {
      return { text, stop: classify(null, signal, input.signal), proposal: ctx.proposal, toolResults }
    }
  }

  return { text, stop: "truncated", proposal: ctx.proposal, toolResults }
}

/**
 * Why a call ended early. The user's Stop and the turn's deadline are told
 * apart by which signal fired. An overload, a rate limit, a 5xx or a dropped
 * connection is `unavailable`, which may be retried on the fallback model;
 * anything else is `failed`. Only the class name is logged.
 */
function classify(error: unknown, signal: AbortSignal, userSignal: AbortSignal): Attempt["stop"] {
  if (userSignal.aborted) return "aborted"
  if (signal.aborted || error instanceof Anthropic.APIConnectionTimeoutError) return "timeout"
  if (error === null) return "failed"

  // The constructor's name: the SDK's error classes all report `name` as "Error".
  console.warn(`Chat call failed: ${error instanceof Error ? error.constructor.name : "unknown error"}`)
  if (error instanceof Anthropic.APIConnectionError) return "unavailable"
  if (error instanceof Anthropic.RateLimitError) return "unavailable"
  if (error instanceof Anthropic.APIError && typeof error.status === "number" && error.status >= 500) {
    return "unavailable"
  }
  return "failed"
}
