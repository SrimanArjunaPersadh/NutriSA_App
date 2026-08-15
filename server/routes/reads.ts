import { Hono } from "hono"

import { currentLoggingDay } from "@engine"
import { logDaySchema, weightRangeSchema } from "@shared"

import { getScope, requireUser, type AppEnv } from "../auth/user-scope"
import { readDaySummary } from "../data/day"
import { readWeightSeries } from "../data/weight"

/**
 * The dashboard's read routes.
 *
 * ## Two rules hold here structurally, not by inspection
 *
 * **No route reads `user_id` from the client.** There is no code below that
 * could: the only id in scope is the one `requireUser` derived from a verified
 * Clerk token, and `getScope` is the only way to reach it. A body, a param or a
 * header carrying a `user_id` would simply be ignored — nothing looks at one.
 * `tests/scoped-access.test.ts` keeps that true as the file grows.
 *
 * **All dates come from `currentLoggingDay()`.** The `:date` param is validated
 * with `logDaySchema`, which defers to the engine's `isLogDay`, and the default
 * when a caller asks for "today" is the engine's SAST day — never a `new Date()`
 * here and never a day key the client picked. At 00:40 SAST those two answers
 * differ by a whole day.
 */

export const reads = new Hono<AppEnv>()

reads.use("*", requireUser)

/**
 * `GET /day/:date` — one day, fully computed.
 *
 * `:date` accepts the literal `today` as well as a `YYYY-MM-DD`. The alias is
 * not sugar: without it the client has to work out what day it is, which means
 * a `new Date()` on a phone whose clock and timezone the server does not
 * control, and the standing rule is that there is one time authority.
 */
reads.get("/day/:date", async (c) => {
  const raw = c.req.param("date")
  const parsed =
    raw === "today" ? { success: true as const, data: currentLoggingDay() } : logDaySchema.safeParse(raw)

  if (!parsed.success) {
    return c.json(
      {
        code: "bad-request" as const,
        message: "Expected a calendar day as YYYY-MM-DD, or 'today'.",
      },
      400,
    )
  }

  return c.json(await readDaySummary(getScope(c), parsed.data))
})

/**
 * `GET /weight-logs?days=30` — the full trend, windowed for display.
 *
 * `days` defaults to the whole history. Whatever it is, the trend behind the
 * response is computed over every weigh-in on record — see the note in
 * `../data/weight.ts` for why narrowing the query instead would produce a line
 * that is wrong at exactly the end the user reads.
 */
reads.get("/weight-logs", async (c) => {
  const raw = c.req.query("days")
  const parsed = weightRangeSchema.safeParse(raw ?? undefined)

  if (!parsed.success) {
    return c.json(
      {
        code: "bad-request" as const,
        message: "days must be a positive whole number of days, or 'all'.",
      },
      400,
    )
  }

  return c.json(await readWeightSeries(getScope(c), parsed.data))
})
