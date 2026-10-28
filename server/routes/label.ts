import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { labelReadRequestSchema, MAX_LABEL_IMAGE_CHARS } from "@shared"

import { LABEL_MODEL } from "../ai/config"
import { checkAiGate } from "../ai/gate"
import { readLabel } from "../ai/label-reader"
import { getScope, requireUser, type AppEnv } from "../auth/user-scope"
import { recordAiUsage } from "../data/ai-usage"
import { labelReadRateLimit, writeRateLimit } from "../http/limits"
import { captureRouteError, traceLabelRead } from "../observability/sentry"

/**
 * `POST /label-reads` — read a nutrition label photo (Phase 8, `label-ocr`).
 *
 * Its own router, mounted before `writes` for the same reason `foods` is, and
 * metered explicitly: `writeRateLimit` like any write, then
 * `labelReadRateLimit`, because a read costs money rather than a row.
 *
 * Nothing is stored except the `ai_usage` ledger row. The answer is a draft the
 * form fills in for review; it becomes a food only through `POST /foods`.
 *
 * Before the model is called, the AI gate (Phase 9, Q8 and Q15): no consent
 * is a 403 `ai-consent-required`, a spent month a 429 `ai-allowance-used`, and
 * an unreadable ledger a 503, failing closed. See `ai/gate.ts`.
 *
 * | Outcome                     | Status | Body                             |
 * |-----------------------------|--------|----------------------------------|
 * | ok / partial / not_a_label  | 200    | `LabelReading`                   |
 * | timeout                     | 504    | `upstream-failed`                |
 * | refused / error / no key    | 502    | `upstream-failed`                |
 * | cancelled                   | 499    | nobody is listening; for the log |
 */

export const labelRoutes = new Hono<AppEnv>()

labelRoutes.use("/label-reads", requireUser)

/**
 * Room for the largest legal image plus its JSON wrapper. Refused before the
 * body is parsed, so an oversized upload costs a header read and no more.
 */
const MAX_BODY_BYTES = MAX_LABEL_IMAGE_CHARS + 1024

labelRoutes.post(
  "/label-reads",
  writeRateLimit,
  labelReadRateLimit,
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ code: "bad-request" as const, message: "The photo is too large." }, 413),
  }),
  async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return c.json({ code: "bad-request" as const, message: "Expected a JSON body." }, 400)
    }

    // The issue's message only, never the value: the value is a photo.
    const body = labelReadRequestSchema.safeParse(raw)
    if (!body.success) {
      const issue = body.error.issues[0]
      return c.json(
        { code: "bad-request" as const, message: `image: ${issue?.message ?? "invalid"}` },
        400,
      )
    }

    const scope = getScope(c)
    const gate = await checkAiGate(scope)
    if (!gate.ok) return c.json(gate.body, gate.status)

    const result = await traceLabelRead(() => readLabel(body.data.image, c.req.raw.signal))

    // Every answered call is billed, so every answered call is recorded —
    // refusals and unusable answers too. A timeout has no usage to record.
    //
    // A ledger write that fails does **not** fail the read. The model has
    // already answered and been paid for; turning that into a 500 would make
    // the user pay again for the same photo. The miss goes to Sentry instead,
    // and the Console's monthly limit bounds what an unrecorded read can cost.
    // Phase 9's gate must read the ledger knowing a row can be missing.
    if (result.usage) {
      try {
        await recordAiUsage(scope, { feature: "ocr", model: LABEL_MODEL, usage: result.usage })
      } catch (error) {
        console.error(`ai_usage write failed for ${scope.userId}: ${error instanceof Error ? error.name : "unknown"}`)
        captureRouteError(error, scope.userId)
      }
    }

    switch (result.outcome) {
      case "ok":
      case "partial":
      case "not_a_label":
        return c.json(result.reading)
      case "timeout":
        return c.json(
          { code: "upstream-failed" as const, message: "The label took too long to read." },
          504,
        )
      case "cancelled":
        // 499, nginx's "client closed request": nobody is listening, so this
        // is for the log. A plain Response, because Hono's status type has no
        // 499 and a cast would claim it was a 400.
        return new Response(null, { status: 499 })
      case "refused":
      case "error":
        return c.json(
          { code: "upstream-failed" as const, message: "The label could not be read." },
          502,
        )
    }
  },
)
