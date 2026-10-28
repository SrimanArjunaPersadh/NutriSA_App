import { parseSseChunk, type ChatEvent } from "@shared"

/**
 * Reads one assistant turn's event stream to its end (plan.md, Phase 9).
 *
 * No React and no network here: it takes the open body `apiPostStream`
 * resolved with, so it is tested in Node with a hand-built stream.
 *
 * ## Bytes, then text, then events
 *
 * The network hands over bytes in whatever pieces it likes, and a piece can end
 * halfway through a two-byte character ("é" in a food name). `TextDecoder` with
 * `stream: true` holds the half until the rest arrives; Hermes provides it from
 * SDK 58. `parseSseChunk` then does the same for half an event.
 *
 * ## How it ends
 *
 * - `finished`: the server sent `done` or `error`, the last event of a turn
 * - `cut_off`: the stream stopped without either. Stop aborts the read (it
 *   rejects with an AbortError), and so does a lost connection. Both keep the
 *   text that arrived (Q13); `stopped` says which one it was
 */
export type ChatStreamEnd =
  | { kind: "finished" }
  | { kind: "cut_off"; stopped: boolean }

export async function readChatEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<ChatStreamEnd> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finished = false

  const take = (text: string) => {
    const { events, rest } = parseSseChunk(buffer + text)
    buffer = rest
    for (const event of events) {
      if (event.type === "done" || event.type === "error") finished = true
      onEvent(event)
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      take(decoder.decode(value, { stream: true }))
    }
    // Whatever the decoder held, and a last frame the server closed without
    // its blank line.
    take(decoder.decode() + "\n\n")
  } catch {
    return { kind: "cut_off", stopped: signal?.aborted ?? false }
  } finally {
    reader.releaseLock()
  }

  return finished ? { kind: "finished" } : { kind: "cut_off", stopped: signal?.aborted ?? false }
}
