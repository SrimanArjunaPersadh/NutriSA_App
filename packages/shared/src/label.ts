import { z } from "zod"

/**
 * The label reader's contract (Phase 8, `label-ocr`).
 *
 * The client photographs a nutrition label and posts it; the server hands it
 * to the model and answers with what the model read off it. The form on
 * `create-food` is then filled in and **reviewed before anything is saved**:
 * a transcription is a draft, never a food.
 *
 * ## One shape, three jobs
 *
 * `labelReadingSchema` is the response the client parses, and it is also the
 * model's `output_config.format` on the server, so the label's shape is
 * written once. It is deliberately plain — nullable numbers and enums — because
 * that is what structured outputs constrains well; bounds are checked after the
 * model answers, not inside the schema it is handed.
 *
 * ## The model copies, it never computes
 *
 * Every number is **as printed**, in the unit printed. A label that shows only
 * kJ comes back with `energyKcal: null`, and the engine's `labelKcal` decides
 * the kcal figure. A label that shows only a per-serving column comes back with
 * `basis: "per_serving"`, and the engine rescales it. The model is told this
 * in its instructions, and the schema leaves it nowhere to put a derived value.
 *
 * ## The photo is not stored
 *
 * `image` crosses the wire once, is sent to the model, and is gone. It is never
 * written to a table, a file, a log line or ImageKit (plan.md, standing rules).
 */

/**
 * The largest base64 string accepted, in characters.
 *
 * The client resizes to a 1568 px long edge at JPEG ~0.7 before sending, which
 * lands far below this; the model scales anything larger down to about that
 * size anyway, so more pixels are only more upload. The route's `bodyLimit` is
 * set just above this so a JSON wrapper around a legal image always fits.
 */
export const MAX_LABEL_IMAGE_CHARS = 1_900_000

/**
 * Base64 of a JPEG starts `/9j/` — the encoding of its FF D8 FF signature.
 *
 * Checked so the server can name the media type it sends to the model without
 * trusting a field the client sets, and so a PNG or a stray string is refused
 * as a 400 here rather than as an upstream error.
 */
const JPEG_BASE64_PREFIX = "/9j/"

export const labelReadRequestSchema = z.object({
  image: z
    .string()
    .min(1)
    .max(MAX_LABEL_IMAGE_CHARS)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Expected base64 with no line breaks")
    .refine((value) => value.startsWith(JPEG_BASE64_PREFIX), "Expected a JPEG"),
})

export type LabelReadRequest = z.infer<typeof labelReadRequestSchema>

/** Which column the numbers were copied from. */
export const LABEL_BASES = ["per_100g", "per_100ml", "per_serving"] as const

export type LabelBasis = (typeof LABEL_BASES)[number]

const printed = (description: string) => z.number().nullable().describe(description)

export const labelReadingSchema = z.object({
  status: z
    .enum(["ok", "partial", "not_a_label"])
    .describe(
      "ok: every field present on the label was read. partial: the photo is a nutrition label but some fields could not be read. not_a_label: no nutrition information table is visible.",
    ),
  name: z
    .string()
    .nullable()
    .describe("The product name and brand as printed on the packet, or null if not visible."),
  basis: z
    .enum(LABEL_BASES)
    .nullable()
    .describe(
      "The column the numbers below were copied from. Prefer per_100g or per_100ml when the label has one; per_serving only when it has no per-100 column.",
    ),
  servingSize: z
    .object({
      value: z.number(),
      unit: z.enum(["g", "ml"]),
    })
    .nullable()
    .describe("The serving size as printed, in g or ml, or null if the label gives none."),
  energyKj: printed("Energy in kJ, exactly as printed in that column, or null if not printed."),
  energyKcal: printed(
    "Energy in kcal, exactly as printed in that column, or null if not printed. Never converted from kJ.",
  ),
  protein: printed("Protein in grams, as printed, or null."),
  carbohydrate: printed(
    "Total carbohydrate in grams, as printed (not 'of which sugars'), or null.",
  ),
  fat: printed("Total fat in grams, as printed (not 'of which saturated'), or null."),
})

export type LabelReading = z.infer<typeof labelReadingSchema>
