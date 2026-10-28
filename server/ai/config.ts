import Anthropic from "@anthropic-ai/sdk"

import type { ModelId } from "@engine"

import { env } from "../env"

/**
 * Every model call this server makes is configured here (plan.md, Phase 9:
 * "single server-side config module — model IDs as constants, never inline
 * strings"). Created on `label-ocr`, Phase 8; the chat's entries follow the
 * reader's, and both share the one client below.
 *
 * Model ids are typed as the engine's `ModelId`, so a model with no row in the
 * rate table does not compile: `computeUsageCost` would otherwise throw after
 * the call had already been paid for, and the ledger would miss it.
 */

/**
 * The label reader. Haiku 5.5, decided 2026-10-26: transcription is not
 * reasoning, and it is a tenth of Haiku 4.5's price.
 */
export const LABEL_MODEL = "claude-haiku-5-5" satisfies ModelId

/**
 * The reader's whole time budget, server side. The user is waiting on the
 * screen with a photo; past this, typing it in is faster than waiting.
 * Vercel Hobby's ceiling is 60 s, far above it.
 */
export const LABEL_TIMEOUT_MS = 15_000

/**
 * Room for adaptive thinking plus a few hundred tokens of JSON. Thinking counts
 * toward `max_tokens` on Haiku 5.5, so a cap sized for the JSON alone could be
 * spent before any answer was written.
 */
export const LABEL_MAX_TOKENS = 2048

/**
 * The assistant (Phase 9, Q1): Sonnet 5.5 with adaptive thinking at low
 * effort. `thinking` is left unset, which is adaptive on this model; the
 * Sonnet 5 form, `{type: "disabled"}`, is a 400 on it.
 */
export const CHAT_MODEL = "claude-sonnet-5-5" satisfies ModelId

/**
 * The cheaper rung (Q8): the rest of the month once spend reaches $4, and a
 * second try for one turn when the chat model is overloaded or down.
 */
export const CHAT_FALLBACK_MODEL = "claude-haiku-5-5" satisfies ModelId

export const CHAT_EFFORT = "low" as const

/** One turn, every model call and lookup in it (Q11). Vercel's ceiling is 60 s. */
export const CHAT_TURN_TIMEOUT_MS = 45_000

/** Lookups per turn (Q11). Past this, the model answers with what it has. */
export const CHAT_MAX_LOOKUPS = 4

/** Per model call, thinking included (Q11). A chat answer is a few sentences. */
export const CHAT_MAX_TOKENS = 4096

let client: Anthropic | null = null

/**
 * The shared client, or null when no key is configured.
 *
 * - `maxRetries: 0`: the reader's 15 s is one attempt, and a silent retry
 *   inside it only hides a slow minute (decided 2026-10-26). The user has
 *   "Try again".
 * - `openTelemetry: false`: SDK 1.x traces every call by default into the
 *   global tracer, which is Sentry's once `tracesSampler` is set, and it adds
 *   trace headers to every request. One environment variable
 *   (`ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE=content`) would then put the
 *   prompt and answer into a Sentry span that `beforeSendTransaction` does not
 *   scrub. Off in code, so no env var can turn it on. The reader's own span is
 *   `traceLabelRead`, which carries the outcome and nothing else.
 * - `logLevel: "warn"`, pinned: `ANTHROPIC_LOG=debug` would print each request
 *   body, the photo's base64 included, to the server log.
 *
 * Both found by the Privacy axis of `/nutrisa-review`, 2026-10-28.
 */
export function anthropic(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: 0,
    openTelemetry: false,
    logLevel: "warn",
  })
  return client
}
