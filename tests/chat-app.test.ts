import { describe, expect, it } from "vitest"

import { CHAT_TOOL_NAMES, type ChatEvent, type ChatMessage, type ChatProposal } from "@shared"

import {
  CHAT_STATUS_DONE,
  CHAT_STATUS_LINES,
  cardState,
  chatDayLabel,
  chatRows,
  expiredCardNote,
  plainReply,
  repliesTo,
  turnFailure,
  turnSteps,
  type LiveTurn,
} from "../src/lib/chat"
import { readChatEvents } from "../src/lib/chat-stream"
import { formatDayMonth, formatUsd } from "../src/lib/format"

/**
 * The AI Assistant tab's logic (plan.md, Phase 9, `ai-chat-app`, A1–A11),
 * tested without a phone: the stream reader, the rows the thread draws, the
 * card's states and the copy for a failed turn.
 */

const encoder = new TextEncoder()

/** A body that hands over the given byte pieces, then ends or fails. */
function body(pieces: (string | Uint8Array)[], end: "close" | "drop" = "close"): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < pieces.length) {
        const piece = pieces[index++]!
        controller.enqueue(typeof piece === "string" ? encoder.encode(piece) : piece)
        return
      }
      if (end === "close") controller.close()
      else controller.error(new TypeError("Network request failed"))
    },
  })
}

const frame = (event: ChatEvent) => `data: ${JSON.stringify(event)}\n\n`
const DONE: ChatEvent = {
  type: "done",
  messageId: "0192f6a4-0000-7000-8000-000000000001",
  unsourcedNumbers: false,
  rung: "full",
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const events: ChatEvent[] = []
  const end = await readChatEvents(stream, (event) => events.push(event), signal)
  return { events, end }
}

describe("readChatEvents", () => {
  it("reads a whole turn", async () => {
    const { events, end } = await collect(
      body([frame({ type: "status", tool: "get_day_summary" }), frame({ type: "text", text: "Hi" }), frame(DONE)]),
    )
    expect(events.map((event) => event.type)).toEqual(["status", "text", "done"])
    expect(end).toEqual({ kind: "finished" })
  })

  it("joins an event split across pieces", async () => {
    const whole = frame({ type: "text", text: "Two eggs" }) + frame(DONE)
    const { events } = await collect(body([whole.slice(0, 7), whole.slice(7, 30), whole.slice(30)]))
    expect(events[0]).toEqual({ type: "text", text: "Two eggs" })
    expect(events).toHaveLength(2)
  })

  it("keeps a character whose bytes are split across pieces", async () => {
    const bytes = encoder.encode(frame({ type: "text", text: "Crème brûlée" }) + frame(DONE))
    const at = bytes.indexOf(0xc3) + 1 // inside the two bytes of "è"
    const { events } = await collect(body([bytes.slice(0, at), bytes.slice(at)]))
    expect(events[0]).toEqual({ type: "text", text: "Crème brûlée" })
  })

  it("is cut off when the stream ends without done or error", async () => {
    const { events, end } = await collect(body([frame({ type: "text", text: "Half a" })]))
    expect(events).toHaveLength(1)
    expect(end).toEqual({ kind: "cut_off", stopped: false })
  })

  it("is cut off, not thrown, when the connection drops", async () => {
    const { end } = await collect(body([frame({ type: "text", text: "Half" })], "drop"))
    expect(end).toEqual({ kind: "cut_off", stopped: false })
  })

  it("says Stop was the cause when the signal aborted", async () => {
    const abort = new AbortController()
    abort.abort()
    const { end } = await collect(body([frame({ type: "text", text: "Half" })], "drop"), abort.signal)
    expect(end).toEqual({ kind: "cut_off", stopped: true })
  })

  it("an error event finishes the turn", async () => {
    const { events, end } = await collect(body([frame({ type: "error", code: "upstream-failed" })]))
    expect(events).toEqual([{ type: "error", code: "upstream-failed" }])
    expect(end).toEqual({ kind: "finished" })
  })

  it("reads a last frame closed without its blank line", async () => {
    const { events, end } = await collect(body([`data: ${JSON.stringify(DONE)}`]))
    expect(events).toEqual([DONE])
    expect(end).toEqual({ kind: "finished" })
  })
})

describe("plainReply (A9)", () => {
  it("drops bold and italic marks", () => {
    expect(plainReply("You have **420 kcal** left, *nice*.")).toBe("You have 420 kcal left, nice.")
  })

  it("keeps bullets and line breaks, and makes a star bullet a dash", () => {
    expect(plainReply("Left today:\n* Protein 40 g\n- Fat 12 g")).toBe("Left today:\n- Protein 40 g\n- Fat 12 g")
  })

  it("drops a heading's hashes", () => {
    expect(plainReply("## Today\nGood day.")).toBe("Today\nGood day.")
  })

  it("leaves a multiplication alone", () => {
    expect(plainReply("2 * 3 eggs")).toBe("2 * 3 eggs")
  })
})

describe("the working checklist (C2)", () => {
  it("ticks finished lookups and puts the running one last", () => {
    expect(turnSteps(["get_day_summary", "search_foods"], "search_foods")).toEqual([
      { tool: "get_day_summary", done: true },
      { tool: "search_foods", done: false },
    ])
  })

  it("shows a lookup run twice as one row", () => {
    expect(turnSteps(["search_foods", "search_foods", "propose_meal_log"], "propose_meal_log")).toEqual([
      { tool: "search_foods", done: true },
      { tool: "propose_meal_log", done: false },
    ])
  })

  it("moves a repeated lookup to the end while it runs again", () => {
    expect(turnSteps(["search_foods", "propose_meal_log", "search_foods"], "search_foods")).toEqual([
      { tool: "propose_meal_log", done: true },
      { tool: "search_foods", done: false },
    ])
  })

  it("is empty before any lookup, which reads as Thinking", () => {
    expect(turnSteps([], null)).toEqual([])
  })

  it("has a done line for every lookup, in the past tense", () => {
    for (const tool of CHAT_TOOL_NAMES) expect(CHAT_STATUS_DONE[tool]).toMatch(/^(Checked|Looked|Searched|Made) /)
  })

  it("reaches the live row only while it streams", () => {
    const working = chatRows([], liveTurn({ messageId: "m1", text: "Hi", tool: "search_foods", tools: ["get_day_summary", "search_foods"] }))
    expect(working[1]).toMatchObject({ steps: [{ tool: "get_day_summary", done: true }, { tool: "search_foods", done: false }] })
    const finished = chatRows([], liveTurn({ messageId: "m1", text: "Hi", tools: ["get_day_summary"], phase: "done" }))
    expect(finished[1]).toMatchObject({ steps: [] })
  })
})

describe("status lines (A10)", () => {
  it("has a line for every lookup the server can name", () => {
    for (const tool of CHAT_TOOL_NAMES) expect(CHAT_STATUS_LINES[tool]).toBeTruthy()
  })

  it("never suggests the model works anything out", () => {
    for (const line of Object.values(CHAT_STATUS_LINES)) expect(line).not.toMatch(/work|calculat|comput/i)
  })
})

const meal: ChatProposal["meal"] = {
  id: "0192f6a4-0000-7000-8000-0000000000aa",
  date: "2026-10-28",
  name: "Breakfast",
  macros: { kcal: 300, protein: 20, carbs: 10, fat: 18 },
  items: [],
}

describe("cardState (Q5, A3)", () => {
  const card = { day: "2026-10-28", dismissed: false, confirmed: false } as const

  it("is open on the day it was made", () => {
    expect(cardState(card, "2026-10-28")).toBe("open")
  })

  it("expires the next day", () => {
    expect(cardState(card, "2026-10-29")).toBe("expired")
  })

  it("is logged whatever the day, once its meal exists", () => {
    expect(cardState({ ...card, confirmed: true }, "2026-10-30")).toBe("logged")
  })

  it("is dismissed when dismissed", () => {
    expect(cardState({ ...card, dismissed: true }, "2026-10-28")).toBe("dismissed")
  })

  it("names the day an old card was made", () => {
    expect(expiredCardNote("2026-10-27")).toBe("From Tue 27 Oct. Ask again to log it today.")
  })
})

let seq = 0
function message(role: "user" | "assistant", content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  seq += 1
  return {
    id: `0192f6a4-0000-7000-8000-${String(seq).padStart(12, "0")}`,
    role,
    content,
    status: "complete",
    proposal: null,
    unsourcedNumbers: false,
    createdAt: "2026-10-28T08:00:00.000Z",
    ...extra,
  }
}

function liveTurn(extra: Partial<LiveTurn> & Pick<LiveTurn, "messageId" | "text">): LiveTurn {
  return {
    conversationId: "0192f6a4-0000-7000-8000-0000000000cc",
    repliesBefore: 0,
    reply: "",
    tool: null,
    tools: [],
    proposal: null,
    phase: "streaming",
    unsourcedNumbers: false,
    failure: null,
    retryable: true,
    ...extra,
  }
}

describe("chatRows (Q13, A4)", () => {
  it("offers Retry on the newest reply to the newest message when it was cut off", () => {
    const question = message("user", "What's left?")
    const cut = message("assistant", "You have", { status: "cut_off" })
    const rows = chatRows([question, cut], null)
    expect(rows[1]).toMatchObject({ kind: "reply", status: "cut_off", retry: { messageId: question.id, text: "What's left?" } })
  })

  it("hides Retry once a newer reply answers the same message", () => {
    const question = message("user", "What's left?")
    const cut = message("assistant", "You have", { status: "cut_off" })
    const answer = message("assistant", "You have 420 kcal left.")
    const rows = chatRows([question, cut, answer], null)
    expect(rows[1]).toMatchObject({ status: "cut_off", retry: null })
    expect(rows[2]).toMatchObject({ status: "complete", retry: null })
  })

  it("gives an older cut-off reply no Retry, since its answer would land under a later question", () => {
    const rows = chatRows(
      [message("user", "One"), message("assistant", "Half", { status: "cut_off" }), message("user", "Two"), message("assistant", "Fine.")],
      null,
    )
    expect(rows[1]).toMatchObject({ status: "cut_off", retry: null })
  })

  it("words a failed reply and offers Retry", () => {
    const question = message("user", "Log my eggs")
    const rows = chatRows([question, message("assistant", "", { status: "failed" })], null)
    expect(rows[1]).toMatchObject({ failure: "Couldn't answer. Try again.", retry: { messageId: question.id } })
  })

  it("draws a new message and its reply before the server has them", () => {
    const rows = chatRows([], liveTurn({ messageId: "m1", text: "Hi", reply: "Hel", tool: "get_targets" }))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ kind: "user", id: "m1", text: "Hi" })
    expect(rows[1]).toMatchObject({ kind: "reply", status: "streaming", text: "Hel", tool: "get_targets" })
  })

  it("stops drawing the turn once the server has stored its reply", () => {
    const question = message("user", "Hi")
    const live = liveTurn({ messageId: question.id, text: "Hi", reply: "Hello", phase: "done" })
    expect(chatRows([question], live)).toHaveLength(2)
    expect(chatRows([question, message("assistant", "Hello")], live)).toHaveLength(2)
  })

  it("a retry's turn waits for a reply newer than the cut-off one", () => {
    const question = message("user", "What's left?")
    const cut = message("assistant", "You have", { status: "cut_off" })
    const live = liveTurn({ messageId: question.id, text: question.content, repliesBefore: repliesTo([question, cut], question.id) })
    const rows = chatRows([question, cut], live)
    expect(rows).toHaveLength(3)
    // While it runs, the stored cut-off reply loses its button.
    expect(rows[1]).toMatchObject({ status: "cut_off", retry: null })
    expect(chatRows([question, cut, message("assistant", "You have 420 kcal left.")], live)).toHaveLength(3)
  })

  it("a finished turn no longer hides the stored reply's Retry", () => {
    const question = message("user", "What's left?")
    const cut = message("assistant", "You have", { status: "cut_off" })
    const live = liveTurn({ messageId: question.id, text: question.content, reply: "You have", phase: "cut_off" })
    const rows = chatRows([question, cut], live)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ retry: { messageId: question.id } })
  })

  it("keeps the turn's card and its unsourced-number flag", () => {
    const proposal = { day: "2026-10-28", slot: "Breakfast", meal, dismissed: false, confirmed: false } as const
    const rows = chatRows([], liveTurn({ messageId: "m1", text: "2 eggs", proposal, unsourcedNumbers: true, phase: "done" }))
    expect(rows[1]).toMatchObject({ proposal, unsourcedNumbers: true, status: "complete" })
  })

  it("strips markup from stored replies too", () => {
    const rows = chatRows([message("user", "Hi"), message("assistant", "**420 kcal** left")], null)
    expect(rows[1]).toMatchObject({ text: "420 kcal left" })
  })
})

describe("turnFailure (Q13)", () => {
  it("retries what a retry can fix", () => {
    expect(turnFailure("network")).toEqual({ copy: "Couldn't reach the server. Try again.", retryable: true })
    expect(turnFailure("upstream-failed")).toEqual({ copy: "Couldn't answer. Try again.", retryable: true })
    expect(turnFailure("server-error").retryable).toBe(true)
  })

  it("does not offer a retry that will be refused again", () => {
    expect(turnFailure("rate-limited").retryable).toBe(false)
    expect(turnFailure("ai-allowance-used").retryable).toBe(false)
    expect(turnFailure("ai-consent-required").retryable).toBe(false)
  })
})

describe("chatDayLabel", () => {
  it("names today and yesterday by SAST day, not UTC", () => {
    // 22:30 UTC on the 27th is 00:30 SAST on the 28th.
    expect(chatDayLabel("2026-10-27T22:30:00.000Z", "2026-10-28")).toBe("Today")
    expect(chatDayLabel("2026-10-27T08:00:00.000Z", "2026-10-28")).toBe("Yesterday")
    expect(chatDayLabel("2026-10-20T08:00:00.000Z", "2026-10-28")).toBe("Tue 20 Oct")
  })
})

describe("allowance formatting (Q8, Q26)", () => {
  it("prints whole dollars bare and cents to two places", () => {
    expect(formatUsd(5)).toBe("$5")
    expect(formatUsd(0.42)).toBe("$0.42")
  })

  it("prints the reset day the South African way", () => {
    expect(formatDayMonth("2026-11-01")).toBe("1 November")
  })
})

describe("the plate from a card's Edit (A2)", async () => {
  const { clearPlate, loadPlateFromCard, plateMealId } = await import("../src/lib/plate")
  // By hand: `meal-draft` mints keys through Expo, which does not load in Node.
  const zero = { kcal: "", protein: "", carbs: "", fat: "" }
  const emptyDraftItem = () => ({
    key: "k1",
    name: "Egg",
    mode: "portion" as const,
    quantity: "2",
    unit: "piece" as const,
    per: zero,
    qty: "",
    macros: zero,
    measure: null,
  })

  it("logs under the card's id while it holds the card's lines", () => {
    loadPlateFromCard([emptyDraftItem()], meal.id)
    expect(plateMealId()).toBe(meal.id)
  })

  it("forgets the id when the plate is cleared", () => {
    loadPlateFromCard([emptyDraftItem()], meal.id)
    clearPlate()
    expect(plateMealId()).toBeNull()
  })

  it("takes no id for an empty card", () => {
    loadPlateFromCard([], meal.id)
    expect(plateMealId()).toBeNull()
  })
})

describe("chat never reaches device storage (Q19)", async () => {
  const { readFileSync, readdirSync } = await import("node:fs")
  const files = [
    "src/lib/chat.ts",
    "src/lib/chat-stream.ts",
    "src/lib/chat-selection.ts",
    "src/lib/use-chat-turn.ts",
    "src/app/chats.tsx",
    "src/app/ai-consent.tsx",
    "src/app/(tabs)/assistant.tsx",
    ...readdirSync("src/components/chat").map((name) => `src/components/chat/${name}`),
  ]

  it.each(files)("%s imports no storage", (file) => {
    const text = readFileSync(file, "utf8")
    expect(text).not.toMatch(/async-storage|expo-secure-store|expo-file-system|expo-sqlite|localStorage|MMKV/i)
  })
})
