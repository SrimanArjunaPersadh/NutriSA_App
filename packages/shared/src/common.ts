import { z } from "zod"

import { isLogDay, type LogDay } from "@engine"

/**
 * Primitives every contract is built from.
 *
 * These are zod schemas rather than bare TypeScript types because they sit on
 * the wire. A type is erased at runtime; a schema is what actually stops a
 * malformed `:date` param reaching a query, and what lets the client trust the
 * response it parsed.
 */

/**
 * A SAST calendar day, `YYYY-MM-DD`.
 *
 * Validated through the engine's `isLogDay`, not through a regex written here.
 * The pattern alone accepts 2026-02-30 and 2026-13-01, and the standing rule is
 * that all date logic flows from the single time authority — a second opinion
 * about what a valid day looks like is exactly the drift that rule forbids.
 */
export const logDaySchema = z
  .string()
  .refine(isLogDay, { message: "Expected a real calendar day, YYYY-MM-DD" })
  .transform((value): LogDay => value)

/** Energy plus the three macros, in the engine's vocabulary. */
export const macrosSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
})

export type Macros = z.infer<typeof macrosSchema>

/**
 * One error shape for every route.
 *
 * `code` is for the client to branch on, `message` is for a human reading a
 * log. Nothing user-facing is built from `message`: the four states on each
 * surface own their own words, in the app's voice, and a string that travelled
 * over HTTP is not going to be in it.
 */
export const apiErrorSchema = z.object({
  code: z.enum([
    /** No token, a malformed token, or one that failed verification. */
    "unauthenticated",
    /** A path param, query string or body that could not be parsed. */
    "bad-request",
    /** The route is fine, the thing it names does not exist. */
    "not-found",
    /**
     * A write whose id is already taken by a row this user cannot see.
     *
     * Distinct from a retry of the same write, which succeeds silently — see
     * `writes.ts`. This one means the UUIDv7 collided with somebody else's,
     * which random 122-bit ids do not do by accident. Minting a fresh id is the
     * only sane response, and it is why the client needs to tell the two apart.
     */
    "conflict",
    /** Too many requests from one caller. Back off and try later. */
    "rate-limited",
    /** Anything unhandled. The details went to Sentry, not to the client. */
    "server-error",
  ]),
  message: z.string(),
})

export type ApiError = z.infer<typeof apiErrorSchema>
export type ApiErrorCode = ApiError["code"]
