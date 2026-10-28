import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import Anthropic from "@anthropic-ai/sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The label reader's model call, with the SDK replaced (Phase 8).
 *
 * What this pins down is everything around the model, not the model: the
 * request it is sent (the right model, no sampling parameters, the photo as a
 * JPEG, one 15 s attempt), how every way the call can end maps to an outcome,
 * and the bounds check on what came back. Whether Haiku reads a real label well
 * is a device check with a real packet; a mock cannot answer it.
 *
 * `../server/ai/config` is mocked whole, so `server/env.ts` never loads and the
 * suite needs no `.env`.
 */

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  configured: true,
}))

vi.mock("../server/ai/config", () => ({
  LABEL_MODEL: "claude-haiku-5-5",
  LABEL_TIMEOUT_MS: 15_000,
  LABEL_MAX_TOKENS: 2048,
  anthropic: () => (sdk.configured ? { messages: { create: sdk.create } } : null),
}))

const { readLabel } = await import("../server/ai/label-reader")

const IMAGE = "/9j/4AAQSkZJRg=="

const goodReading = {
  status: "ok",
  name: "  Jungle Oats  ",
  basis: "per_100g",
  servingSize: { value: 40, unit: "g" },
  energyKj: 1590,
  energyKcal: 380,
  protein: 13.1,
  carbohydrate: 60.2,
  fat: 7.4,
}

/**
 * A response as Haiku 5.5 sends it: a `thinking` block first (empty text, the
 * default display), then the JSON as text.
 */
function answer(overrides: Record<string, unknown> & { parsed_output?: unknown } = {}) {
  const { parsed_output = goodReading, ...rest } = overrides
  return {
    stop_reason: "end_turn",
    content:
      parsed_output === null
        ? []
        : [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "text", text: JSON.stringify(parsed_output) },
          ],
    usage: {
      input_tokens: 1800,
      output_tokens: 300,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    },
    ...rest,
  }
}

beforeEach(() => {
  sdk.create.mockReset()
  sdk.configured = true
})

describe("the request the model is sent", () => {
  it("asks Haiku 5.5 at low effort, with the photo as a JPEG and no sampling parameters", async () => {
    sdk.create.mockResolvedValue(answer())
    await readLabel(IMAGE)

    const [body, options] = sdk.create.mock.calls[0]!
    expect(body.model).toBe("claude-haiku-5-5")
    expect(body.output_config.effort).toBe("low")
    expect(body.output_config.format).toBeDefined()
    // A 400 on Haiku 5.5, and not wanted for transcription anyway.
    expect(body).not.toHaveProperty("temperature")
    expect(body).not.toHaveProperty("top_p")
    expect(body).not.toHaveProperty("thinking")
    expect(body.messages.at(-1).role).toBe("user")
    expect(body.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: IMAGE },
    })
    expect(options.timeout).toBe(15_000)
  })

  /**
   * Guards the workaround in `label-reader.ts`: the SDK's zod helper drops
   * `enum`, and the shared schema's enums are what keep `basis` to three words.
   */
  it("sends the schema with its enums intact", async () => {
    sdk.create.mockResolvedValue(answer())
    await readLabel(IMAGE)
    const { format } = sdk.create.mock.calls[0]![0].output_config
    expect(format.type).toBe("json_schema")
    expect(format.schema.properties.status.enum).toEqual(["ok", "partial", "not_a_label"])
    expect(format.schema.properties.basis.anyOf[0].enum).toEqual([
      "per_100g",
      "per_100ml",
      "per_serving",
    ])
    expect(format.schema).not.toHaveProperty("$schema")
  })

  it("tells the model to copy figures and never convert them", async () => {
    sdk.create.mockResolvedValue(answer())
    await readLabel(IMAGE)
    const [body] = sdk.create.mock.calls[0]!
    expect(body.system).toMatch(/Never calculate, convert or estimate/)
  })

  it("passes the request's abort signal through", async () => {
    sdk.create.mockResolvedValue(answer())
    const controller = new AbortController()
    await readLabel(IMAGE, controller.signal)
    expect(sdk.create.mock.calls[0]![1].signal).toBe(controller.signal)
  })
})

describe("how a read ends", () => {
  it("returns the reading and its usage", async () => {
    sdk.create.mockResolvedValue(answer())
    const result = await readLabel(IMAGE)
    expect(result.outcome).toBe("ok")
    expect(result.usage).toEqual({
      inputTokens: 1800,
      outputTokens: 300,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    })
    if (result.outcome !== "ok") throw new Error("expected ok")
    expect(result.reading.name).toBe("Jungle Oats")
    expect(result.reading.energyKj).toBe(1590)
  })

  it("passes partial and not_a_label through as outcomes", async () => {
    sdk.create.mockResolvedValue(answer({ parsed_output: { ...goodReading, status: "partial" } }))
    expect((await readLabel(IMAGE)).outcome).toBe("partial")

    sdk.create.mockResolvedValue(
      answer({ parsed_output: { ...goodReading, status: "not_a_label", name: null } }),
    )
    expect((await readLabel(IMAGE)).outcome).toBe("not_a_label")
  })

  it("treats a refusal as a failure that was still billed", async () => {
    sdk.create.mockResolvedValue(answer({ stop_reason: "refusal", parsed_output: null }))
    const result = await readLabel(IMAGE)
    expect(result.outcome).toBe("refused")
    expect(result.usage?.inputTokens).toBe(1800)
  })

  it("treats running out of tokens as an error, still billed", async () => {
    sdk.create.mockResolvedValue(answer({ stop_reason: "max_tokens", parsed_output: null }))
    const result = await readLabel(IMAGE)
    expect(result.outcome).toBe("error")
    expect(result.usage).not.toBeNull()
  })

  it("is a timeout with nothing to bill when the 15 s run out", async () => {
    sdk.create.mockRejectedValue(new Anthropic.APIConnectionTimeoutError())
    expect(await readLabel(IMAGE)).toEqual({ outcome: "timeout", usage: null })
  })

  it("is cancelled when the user drops the request", async () => {
    sdk.create.mockRejectedValue(new Anthropic.APIUserAbortError())
    expect(await readLabel(IMAGE)).toEqual({ outcome: "cancelled", usage: null })
  })

  it("is an error for any other upstream failure, without throwing", async () => {
    sdk.create.mockRejectedValue(new Error("overloaded"))
    expect(await readLabel(IMAGE)).toEqual({ outcome: "error", usage: null })
  })

  it("is an error, not a crash, when no API key is configured", async () => {
    sdk.configured = false
    expect(await readLabel(IMAGE)).toEqual({ outcome: "error", usage: null })
    expect(sdk.create).not.toHaveBeenCalled()
  })
})

describe("an answer that does not parse", () => {
  it("is an error, never a half-filled form", async () => {
    sdk.create.mockResolvedValue(answer({ parsed_output: { ...goodReading, basis: "per 100g" } }))
    expect((await readLabel(IMAGE)).outcome).toBe("error")

    sdk.create.mockResolvedValue({
      ...answer(),
      content: [{ type: "text", text: "not json" }],
    })
    expect((await readLabel(IMAGE)).outcome).toBe("error")
  })
})

describe("the bounds check on what came back", () => {
  it("blanks a figure no column could hold rather than passing it on", async () => {
    sdk.create.mockResolvedValue(
      answer({
        parsed_output: { ...goodReading, protein: -3, fat: 5_000_000, servingSize: { value: 0, unit: "g" } },
      }),
    )
    const result = await readLabel(IMAGE)
    if (result.outcome !== "ok") throw new Error("expected ok")
    expect(result.reading.protein).toBeNull()
    expect(result.reading.fat).toBeNull()
    expect(result.reading.servingSize).toBeNull()
    expect(result.reading.carbohydrate).toBe(60.2)
  })

  it("turns a blank name into null and caps a long one", async () => {
    sdk.create.mockResolvedValue(answer({ parsed_output: { ...goodReading, name: "   " } }))
    const blank = await readLabel(IMAGE)
    if (blank.outcome !== "ok") throw new Error("expected ok")
    expect(blank.reading.name).toBeNull()

    sdk.create.mockResolvedValue(answer({ parsed_output: { ...goodReading, name: "x".repeat(500) } }))
    const long = await readLabel(IMAGE)
    if (long.outcome !== "ok") throw new Error("expected ok")
    expect(long.reading.name).toHaveLength(200)
  })
})

/**
 * `server/ai/config.ts` is mocked above, so its client options are checked as
 * source text, like the repo's other static guards. Both are privacy settings
 * (Privacy axis of `/nutrisa-review`, 2026-10-28): with SDK tracing on, one
 * environment variable puts the prompt and answer into a Sentry span; with the
 * log level left to `ANTHROPIC_LOG`, `debug` prints the photo's base64.
 */
describe("the Anthropic client's privacy settings", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../server/ai/config.ts", import.meta.url)),
    "utf8",
  )

  it("turns the SDK's OpenTelemetry tracing off in code", () => {
    expect(source).toMatch(/openTelemetry:\s*false/)
  })

  it("pins the log level rather than reading ANTHROPIC_LOG", () => {
    expect(source).toMatch(/logLevel:\s*"warn"/)
  })
})
