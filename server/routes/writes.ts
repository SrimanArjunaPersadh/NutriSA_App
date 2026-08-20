import { Hono } from "hono"
import type { Context } from "hono"
import { z } from "zod"

import { addDays, checkLogDate, currentLoggingDay, type LogDateRejection, type LogDay } from "@engine"
import {
  patchMealSchema,
  writeMealSchema,
  writeTargetsSchema,
  writeWeightSchema,
} from "@shared"

import { getScope, requireUser, type AppEnv } from "../auth/user-scope"
import { LOGGED_DAYS_WINDOW_DAYS } from "../data/day"
import { deleteMealLog, patchMealLog, writeMealLog } from "../data/meals"
import { writeTargets } from "../data/targets"
import { writeWeightLog } from "../data/weight"
import { writeRateLimit } from "../http/limits"

/**
 * The write routes.
 *
 * ## Every rule the read routes hold, plus two of its own
 *
 * `user_id` still never comes from the client. It cannot: the only id in scope
 * below is the one `requireUser` derived from a verified Clerk token, and the
 * data layer stamps it onto the row itself. A body carrying `user_id` is
 * ignored the same way a query string carrying one is — nothing reads it, and
 * `tests/security/write-isolation.test.ts` sends one to prove it.
 *
 * All dates still come from `currentLoggingDay()`. A write with no `date` is
 * dated here, by the engine, not by the phone that sent it.
 *
 * The two new ones:
 *
 * **Idempotency, not retries.** Every write is keyed by a client-minted UUIDv7
 * and inserts `ON CONFLICT DO NOTHING`. A lost response is retried by the
 * client with the same id and answered `created: false`. Nothing on this path
 * is wrapped in `withRetry` — see `../data/scoped.ts`, where a retried insert
 * is spelled out as a duplicated meal.
 *
 * **Back-dating is bounded.** `date` is accepted and validated against
 * `checkLogDate`; `created_at` is never accepted at all and always defaults to
 * the real instant of the write.
 */

export const writes = new Hono<AppEnv>()

writes.use("*", requireUser)
/**
 * After `requireUser`, deliberately: the cap is per verified user, and an
 * unauthenticated caller is refused before it and counted separately.
 */
writes.use("*", writeRateLimit)

/**
 * How far back a write may be dated.
 *
 * The same window the day route reports `loggedDays` over, imported rather than
 * repeated. A meal dated before it would be accepted, stored, and then
 * invisible on every surface the app has — which reads as data loss, and is
 * indistinguishable from it.
 */
const BACK_DATE_WINDOW_DAYS = LOGGED_DAYS_WINDOW_DAYS

/**
 * A path parameter that is going into a `uuid` column.
 *
 * Checked before it reaches a query, because Postgres answers an unparseable
 * uuid with an error, which would surface as a 500 for what is plainly a bad
 * request. **Any** version — the migrated rows carry the old app's ids, and new
 * ones are v7 by contract (`clientIdSchema`), so the two are not the same set.
 */
const anyUuidSchema = z.uuid()

/** Words for each way a date can be refused. The client shows its own. */
const DATE_REJECTIONS: Record<LogDateRejection, string> = {
  malformed: "Expected a calendar day as YYYY-MM-DD.",
  "in-the-future": "That day has not started yet.",
  "before-first-log": "That is before your first logged day.",
  "too-far-back": `You can log up to ${BACK_DATE_WINDOW_DAYS} days back.`,
}

function badRequest(c: Context<AppEnv>, message: string) {
  return c.json({ code: "bad-request" as const, message }, 400)
}

/**
 * The day a write lands on.
 *
 * An absent `date` means today — and today is the engine's SAST day, never a
 * value the client worked out. plan.md's standing rule is that there is one
 * time authority, and a client that fills in its own date is a second one
 * running on a clock this server does not control.
 */
function resolveWriteDay(
  raw: string | undefined,
): { ok: true; day: LogDay } | { ok: false; message: string } {
  const today = currentLoggingDay()
  const checked = checkLogDate(raw ?? today, {
    today,
    earliest: addDays(today, -BACK_DATE_WINDOW_DAYS),
    // `firstLogDay` is deliberately not passed. It is a date-*picker* bound —
    // see `packages/engine/src/time.ts`. Applied here it would refuse someone
    // whose first log is today the ability to back-fill yesterday, which is
    // most of what back-dating is for.
  })

  return checked.ok
    ? { ok: true, day: checked.day }
    : { ok: false, message: DATE_REJECTIONS[checked.reason] }
}

/**
 * The request body, parsed through the shared schema.
 *
 * The first failing field is named in the message. That is for whoever is
 * reading a log — the client renders its own words — and it is safe to include
 * because a zod message describes the *shape* that was expected and never
 * echoes the value that arrived. A macro value must not reach a log line.
 */
async function parseBody<T extends z.ZodType>(
  c: Context<AppEnv>,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; message: string }> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return { ok: false, message: "Expected a JSON body." }
  }

  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }

  const issue = parsed.error.issues[0]
  const field = issue?.path.join(".")
  return {
    ok: false,
    message: field ? `${field}: ${issue?.message}` : (issue?.message ?? "Invalid body."),
  }
}

/** The one answer to a client-minted id that is already somebody's. */
function idTaken(c: Context<AppEnv>) {
  return c.json(
    {
      code: "conflict" as const,
      message: "That id is already in use. Mint a new one.",
    },
    409,
  )
}

/**
 * `POST /meal-logs` — log a meal.
 *
 * 201 when the row was written, 200 when this exact id had already been
 * written. The second is a retry landing after its first attempt succeeded, and
 * it is a success: the meal is logged, exactly once, which is what the client
 * asked for.
 */
writes.post("/meal-logs", async (c) => {
  const body = await parseBody(c, writeMealSchema)
  if (!body.ok) return badRequest(c, body.message)

  const day = resolveWriteDay(body.data.date)
  if (!day.ok) return badRequest(c, day.message)

  const outcome = await writeMealLog(getScope(c), day.day, body.data)
  if (!outcome.ok) return idTaken(c)

  return c.json(outcome.value, outcome.value.created ? 201 : 200)
})

/**
 * `PATCH /meal-logs/:id` — correct a meal that is already logged.
 *
 * Decided 2026-08-16 in preference to delete-and-re-post, which needs no route
 * and loses the meal's `created_at`, its position in the day, and — if it fails
 * between the two calls — the meal. `packages/shared/src/writes.ts` carries the
 * full argument; the consequence here is that the id in the path is the row and
 * the body may not carry another one.
 *
 * 404 when there is no such meal **that this user owns**. Unlike the delete
 * below, that is not an existence oracle: the answer is identical for "no such
 * id anywhere" and "somebody else's id", so it tells a prober nothing it did
 * not already know. The delete's always-200 exists for a different reason —
 * replay safety — and a patch has no replay to be safe about.
 *
 * Any UUID version, same as the delete: the migrated rows are as editable as
 * the rest.
 */
writes.patch("/meal-logs/:id", async (c) => {
  const id = anyUuidSchema.safeParse(c.req.param("id"))
  if (!id.success) return badRequest(c, "Expected a UUID.")

  const body = await parseBody(c, patchMealSchema)
  if (!body.ok) return badRequest(c, body.message)

  /**
   * Only resolved when the request actually sent a date. `resolveWriteDay`
   * answers an absent one with today, which is right for a create and wrong
   * here: an edit that did not mention the day must leave it alone, and
   * defaulting would silently drag every corrected back-dated meal forward to
   * today.
   */
  let day: LogDay | undefined
  if (body.data.date !== undefined) {
    const resolved = resolveWriteDay(body.data.date)
    if (!resolved.ok) return badRequest(c, resolved.message)
    day = resolved.day
  }

  const outcome = await patchMealLog(getScope(c), id.data, body.data, day)
  if (!outcome.ok) {
    return c.json(
      { code: "not-found" as const, message: "No such meal." },
      404,
    )
  }

  return c.json(outcome.value)
})

/**
 * `DELETE /meal-logs/:id` — remove a logged meal.
 *
 * Always 200, with `deleted` saying whether anything went. A 404 for an id that
 * is not there would be an existence oracle over other users' rows, and it
 * would make the offline queue's replay (v1.1) treat a successful delete
 * arriving twice as a failure.
 *
 * The id is validated as a UUID of **any** version, not v7: the 38 migrated
 * rows carry ids minted by the old app, and they are as deletable as the rest.
 */
writes.delete("/meal-logs/:id", async (c) => {
  const id = anyUuidSchema.safeParse(c.req.param("id"))
  if (!id.success) return badRequest(c, "Expected a UUID.")

  return c.json(await deleteMealLog(getScope(c), id.data))
})

/**
 * `POST /weight-logs` — record a weigh-in.
 *
 * 201 for a day with no weigh-in yet, 200 when one was replaced. See
 * `../data/weight.ts` for why a second weigh-in on a day overwrites rather than
 * failing, and for exactly what `replaced` means.
 */
writes.post("/weight-logs", async (c) => {
  const body = await parseBody(c, writeWeightSchema)
  if (!body.ok) return badRequest(c, body.message)

  const day = resolveWriteDay(body.data.date)
  if (!day.ok) return badRequest(c, day.message)

  const outcome = await writeWeightLog(getScope(c), day.day, body.data)
  if (!outcome.ok) return idTaken(c)

  return c.json(outcome.value, outcome.value.replaced ? 200 : 201)
})

/**
 * `POST /targets` — set the macro targets taking effect on a day.
 *
 * The matching `GET /targets` lives on the read router, where every other
 * unmetered read is. It is not a write and should not be counted as one.
 */
writes.post("/targets", async (c) => {
  const body = await parseBody(c, writeTargetsSchema)
  if (!body.ok) return badRequest(c, body.message)

  const day = resolveWriteDay(body.data.validFrom)
  if (!day.ok) return badRequest(c, day.message)

  const outcome = await writeTargets(getScope(c), day.day, body.data)
  if (!outcome.ok) return idTaken(c)

  return c.json(outcome.value, outcome.value.replaced ? 200 : 201)
})
