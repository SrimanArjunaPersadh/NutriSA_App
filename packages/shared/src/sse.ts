import { chatEventSchema, type ChatEvent } from "./chat"

/**
 * Reads the assistant's server-sent events (plan.md, Phase 9, Q22).
 *
 * The app reads the turn's body with `expo/fetch` and `getReader()`, and the
 * bytes arrive in whatever pieces the network delivers: half an event, three
 * events, an event split inside its JSON. This takes everything received so
 * far and returns the whole events in it plus the unfinished tail, which the
 * caller prepends to the next piece.
 *
 * Pure, so it is tested here rather than on a phone. An event that does not
 * parse as a `ChatEvent` is counted and skipped, never thrown: one bad frame
 * should not end a reply the user is reading.
 */
export function parseSseChunk(buffer: string): { events: ChatEvent[]; rest: string; invalid: number } {
  const normalised = buffer.replace(/\r\n/g, "\n")
  const frames = normalised.split("\n\n")
  const rest = frames.pop() ?? ""
  const events: ChatEvent[] = []
  let invalid = 0

  for (const frame of frames) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
    if (data === "") continue

    let json: unknown
    try {
      json = JSON.parse(data)
    } catch {
      invalid += 1
      continue
    }
    const parsed = chatEventSchema.safeParse(json)
    if (parsed.success) events.push(parsed.data)
    else invalid += 1
  }

  return { events, rest, invalid }
}
