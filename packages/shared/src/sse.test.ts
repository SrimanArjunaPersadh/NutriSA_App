import { describe, expect, it } from "vitest"

import { parseSseChunk } from "./sse"

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`

describe("parseSseChunk", () => {
  it("reads whole events and keeps nothing over", () => {
    const { events, rest } = parseSseChunk(frame({ type: "text", text: "Hi" }) + frame({ type: "status", tool: "search_foods" }))
    expect(events).toEqual([
      { type: "text", text: "Hi" },
      { type: "status", tool: "search_foods" },
    ])
    expect(rest).toBe("")
  })

  it("keeps an unfinished event for the next piece", () => {
    const whole = frame({ type: "text", text: "Hello there" })
    const first = parseSseChunk(whole.slice(0, 15))
    expect(first.events).toEqual([])
    const second = parseSseChunk(first.rest + whole.slice(15))
    expect(second.events).toEqual([{ type: "text", text: "Hello there" }])
  })

  it("handles an event split inside its JSON across many pieces", () => {
    const whole = frame({ type: "text", text: "split, with \"quotes\"" }) + frame({ type: "text", text: "next" })
    let rest = ""
    const seen: unknown[] = []
    for (const char of whole) {
      const result = parseSseChunk(rest + char)
      seen.push(...result.events)
      rest = result.rest
    }
    expect(seen).toEqual([
      { type: "text", text: "split, with \"quotes\"" },
      { type: "text", text: "next" },
    ])
  })

  it("accepts CRLF line endings", () => {
    const { events } = parseSseChunk('data: {"type":"text","text":"a"}\r\n\r\n')
    expect(events).toEqual([{ type: "text", text: "a" }])
  })

  it("keeps newlines inside the reply text", () => {
    const { events } = parseSseChunk(frame({ type: "text", text: "line one\n\nline two" }))
    expect(events).toEqual([{ type: "text", text: "line one\n\nline two" }])
  })

  it("skips and counts a frame that is not a chat event, without throwing", () => {
    const { events, invalid } = parseSseChunk(
      "data: not json\n\n" + frame({ type: "nonsense" }) + frame({ type: "text", text: "ok" }),
    )
    expect(events).toEqual([{ type: "text", text: "ok" }])
    expect(invalid).toBe(2)
  })

  it("ignores comment and keep-alive lines", () => {
    const { events } = parseSseChunk(": ping\n\n" + frame({ type: "text", text: "a" }))
    expect(events).toEqual([{ type: "text", text: "a" }])
  })
})
