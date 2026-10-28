import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import type { TokenUsage } from "@engine"
import { labelReadingSchema, MAX_GRAMS, MAX_NAME_CHARS, type LabelReading } from "@shared"

import { anthropic, LABEL_MAX_TOKENS, LABEL_MODEL, LABEL_TIMEOUT_MS } from "./config"

/**
 * The label reader's model call (Phase 8).
 *
 * ## Synchronous: a documented exception to enqueue-only
 *
 * Every other slow job in this server goes through Inngest so a request never
 * waits on it. This one cannot: the user is holding the phone over the form,
 * and the answer is the next thing on their screen. A queued read would need a
 * poll or a push to come back, and both are slower than the 15 s budget the
 * call already has. So it runs inside the request, bounded by
 * `LABEL_TIMEOUT_MS`, with no retries.
 *
 * ## The photo is not kept
 *
 * `image` is passed to the API and dropped when this returns. It is not
 * logged, not written to a table or a file, and never goes near ImageKit
 * (plan.md, standing rules).
 */

/**
 * The instructions, fixed. They are what stops the model doing arithmetic,
 * which the first standing rule forbids: it copies figures and their units,
 * and the engine converts kJ and rescales per-serving columns.
 */
const SYSTEM_PROMPT = `You transcribe South African nutrition information tables from photos of food packaging.

Copy each figure exactly as it is printed, in the unit it is printed in. Never calculate, convert or estimate a value: if energy is printed only in kJ, give the kJ figure and leave kcal null. If a figure is missing, cut off, blurred or unreadable, give null rather than a guess.

Take every number from the same column. Use the per 100 g or per 100 ml column when the table has one; use the per serving column only when it has no per 100 column, and then give the serving size it states.

Carbohydrate is the total carbohydrate line, not "of which total sugar". Fat is total fat, not "of which saturated fat". If the photo shows no nutrition table at all, answer with status not_a_label and null fields.`

/**
 * The model's `output_config.format`, built from the shared schema so the
 * label's shape is written once.
 *
 * ⚠️ Through `z.toJSONSchema`, **not** the SDK's `zodOutputFormat` helper. In
 * `@anthropic-ai/sdk` 1.3.0 that helper moves every `enum` into the
 * description text (`lib/transform-json-schema.js` keeps only a short list of
 * keywords), so `status`, `basis` and the serving unit would be free strings
 * and an answer like `"per 100g"` would only fail at the zod parse. The API
 * itself supports `enum` in structured outputs. Found 2026-10-26 by printing
 * both schemas; re-check before switching back. `$schema` is dropped because
 * the format wants the schema object alone.
 */
const { $schema: _draft, ...LABEL_OUTPUT_SCHEMA } = z.toJSONSchema(labelReadingSchema)

/** How a read ended: the Sentry span's attribute, and the route's switch. */
export type LabelReadOutcome = LabelReadResult["outcome"]

export type LabelReadResult =
  | { outcome: "ok" | "partial" | "not_a_label"; reading: LabelReading; usage: TokenUsage }
  /** Answered, but with nothing usable. Billed, so it still carries `usage`. */
  | { outcome: "refused" | "error"; usage: TokenUsage }
  /** No answer came back, so there is no usage to record. */
  | { outcome: "timeout" | "cancelled" | "error"; usage: null }

/**
 * Read one label photo.
 *
 * `signal` is the request's own: when the user taps Cancel and the app drops
 * the request, the model call stops with it rather than finishing for nobody.
 *
 * Never throws for an upstream failure; every way the call can end is an
 * outcome the route maps to a status. A missing API key is `error` with no
 * usage, the same failure path as an outage, because to the user it is one.
 */
export async function readLabel(image: string, signal?: AbortSignal): Promise<LabelReadResult> {
  const client = anthropic()
  if (!client) return { outcome: "error", usage: null }

  let response
  try {
    response = await client.messages.create(
      {
        model: LABEL_MODEL,
        max_tokens: LABEL_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        output_config: { effort: "low", format: { type: "json_schema", schema: LABEL_OUTPUT_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
              { type: "text", text: "Transcribe this nutrition label." },
            ],
          },
        ],
      },
      { timeout: LABEL_TIMEOUT_MS, signal },
    )
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) return { outcome: "timeout", usage: null }
    if (error instanceof Anthropic.APIUserAbortError) return { outcome: "cancelled", usage: null }
    // Overloaded, rate-limited, a bad key, a dropped connection: one failure
    // path for the user. The class name is logged and nothing from the
    // request, which was a photo.
    console.warn(`Label read failed: ${error instanceof Error ? error.name : "unknown error"}`)
    return { outcome: "error", usage: null }
  }

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  }

  // Haiku 5.5 has no server-side refusal fallback; a refusal on a food label
  // is a misfire, and the user types it in.
  if (response.stop_reason === "refusal") return { outcome: "refused", usage }
  if (response.stop_reason !== "end_turn") return { outcome: "error", usage }

  const parsed = parseReading(response.content)
  if (!parsed) return { outcome: "error", usage }

  const reading = withinBounds(parsed)
  return { outcome: reading.status, reading, usage }
}

/**
 * The JSON answer, through the same zod schema the client parses it with.
 *
 * The answer is the text block, found by type: Haiku 5.5 thinks by default, so
 * the content can open with `thinking` blocks. Null when there is no text or it
 * does not match, which is an `error` outcome, never a half-filled form.
 */
function parseReading(content: Anthropic.ContentBlock[]): LabelReading | null {
  const text = content.find((block): block is Anthropic.TextBlock => block.type === "text")
  if (!text) return null

  let json: unknown
  try {
    json = JSON.parse(text.text)
  } catch {
    return null
  }

  const parsed = labelReadingSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/**
 * A shape check on what came back, not a calculation on it.
 *
 * Structured outputs guarantees the *shape*; it says nothing about whether a
 * number fits a column or is negative. A value that could not be saved becomes
 * a blank the user fills in, the same as a value the model could not read.
 */
function withinBounds(reading: LabelReading): LabelReading {
  // MAX_GRAMS is the widest numeric column a food's figures land in.
  const storable = (value: number | null) =>
    value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_GRAMS ? value : null

  const name = reading.name?.trim().slice(0, MAX_NAME_CHARS) || null
  const servingSize =
    reading.servingSize && storable(reading.servingSize.value) !== null && reading.servingSize.value > 0
      ? reading.servingSize
      : null

  return {
    ...reading,
    name,
    servingSize,
    energyKj: storable(reading.energyKj),
    energyKcal: storable(reading.energyKcal),
    protein: storable(reading.protein),
    carbohydrate: storable(reading.carbohydrate),
    fat: storable(reading.fat),
  }
}
