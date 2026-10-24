import { Hono, type Context } from "hono"
import { z } from "zod"

import {
  barcodeSchema,
  foodQuerySchema,
  mealSlotSchema,
  patchSavedMealSchema,
  writeFoodSchema,
  writeSavedMealSchema,
} from "@shared"

import { getScope, requireUser, type AppEnv } from "../auth/user-scope"
import { createFood, lookupBarcode, recentFoods, searchFoods, searchLocalFoods } from "../data/foods"
import {
  createSavedMeal,
  deleteSavedMeal,
  listSavedMeals,
  patchSavedMeal,
} from "../data/saved-meals"
import { writeRateLimit } from "../http/limits"

/**
 * The food logger's routes.
 *
 * Their own router, mounted **before** `writes` in `server/index.ts`, and that
 * order is load-bearing. `writes` registers its rate limit as wildcard
 * middleware under `/api`, so any route mounted after it is metered as a write —
 * and a search fires on every pause in typing. Here the limit is applied to the
 * one route that writes a row of the user's own, and nowhere else.
 *
 * `GET /foods/barcode/:code` can write too — a global cache row — but it is
 * metered by `../food/off.ts`'s own budget against OFF, which is the resource
 * that actually runs out, and it never writes the same barcode twice.
 *
 * Same two rules as every other router: `user_id` only from `getScope(c)`, and
 * no route here takes a date at all.
 *
 * Saved meals live here too (`food-logger`, 2026-10-19): they are reached from
 * the logger, and their three writes carry `writeRateLimit` per route exactly
 * as `POST /foods` does.
 */

export const foodRoutes = new Hono<AppEnv>()

foodRoutes.use("*", requireUser)

/** Any UUID version — the 4 migrated saved meals carry the old app's ids. */
const anyUuidSchema = z.uuid()

function badRequest(c: Context<AppEnv>, message: string) {
  return c.json({ code: "bad-request" as const, message }, 400)
}

function idTaken(c: Context<AppEnv>) {
  return c.json(
    { code: "conflict" as const, message: "That id is already in use. Mint a new one." },
    409,
  )
}

/**
 * The request body through its shared schema. The first failing field is
 * named — the shape that was expected, never the value that arrived, because a
 * macro value must not reach a log line or a response.
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

/** `GET /foods/search?q=` — see `searchFoods`. */
foodRoutes.get("/foods/search", async (c) => {
  const query = foodQuerySchema.safeParse(c.req.query("q") ?? "")
  if (!query.success) {
    return c.json(
      { code: "bad-request" as const, message: "q must be 1 to 100 characters." },
      400,
    )
  }

  return c.json(await searchFoods(getScope(c), query.data))
})

/** `GET /foods/search/local?q=` — see `searchLocalFoods`. The fast half, no OFF. */
foodRoutes.get("/foods/search/local", async (c) => {
  const query = foodQuerySchema.safeParse(c.req.query("q") ?? "")
  if (!query.success) {
    return c.json(
      { code: "bad-request" as const, message: "q must be 1 to 100 characters." },
      400,
    )
  }

  return c.json(await searchLocalFoods(getScope(c), query.data))
})

/** `GET /foods/recent?slot=` — see `recentFoods`. An unknown slot is a 400, not ignored. */
foodRoutes.get("/foods/recent", async (c) => {
  const raw = c.req.query("slot")
  if (raw === undefined) return c.json(await recentFoods(getScope(c)))

  const slot = mealSlotSchema.safeParse(raw)
  if (!slot.success) {
    return c.json(
      { code: "bad-request" as const, message: "slot must be Breakfast, Lunch, Dinner or Snack." },
      400,
    )
  }
  return c.json(await recentFoods(getScope(c), slot.data))
})

/** `GET /foods/barcode/:code` — see `lookupBarcode`. */
foodRoutes.get("/foods/barcode/:code", async (c) => {
  const code = barcodeSchema.safeParse(c.req.param("code"))
  if (!code.success) {
    return c.json(
      { code: "bad-request" as const, message: "Expected a retail barcode, 8 to 14 digits." },
      400,
    )
  }

  return c.json(await lookupBarcode(getScope(c), code.data))
})

/**
 * `POST /foods` — create a food of the user's own.
 *
 * 201 when written, 200 when it already existed: a retry of the same id, or a
 * barcode this user already made a food for. 409 only when the id belongs to
 * somebody else, which is the client's cue to mint a fresh one.
 */
foodRoutes.post("/foods", writeRateLimit, async (c) => {
  const body = await parseBody(c, writeFoodSchema)
  if (!body.ok) return badRequest(c, body.message)

  const outcome = await createFood(getScope(c), body.data)
  if (!outcome.ok) return idTaken(c)

  return c.json(outcome.value, outcome.value.created ? 201 : 200)
})

/** `GET /saved-meals` — see `listSavedMeals`. */
foodRoutes.get("/saved-meals", async (c) => c.json(await listSavedMeals(getScope(c))))

/** `POST /saved-meals` — 201 written, 200 a retry of the same id, 409 someone else's id. */
foodRoutes.post("/saved-meals", writeRateLimit, async (c) => {
  const body = await parseBody(c, writeSavedMealSchema)
  if (!body.ok) return badRequest(c, body.message)

  const outcome = await createSavedMeal(getScope(c), body.data)
  if (!outcome.ok) return idTaken(c)

  return c.json(outcome.value, outcome.value.created ? 201 : 200)
})

/** `PATCH /saved-meals/:id` — 404 for no such meal *that this user owns*. */
foodRoutes.patch("/saved-meals/:id", writeRateLimit, async (c) => {
  const id = anyUuidSchema.safeParse(c.req.param("id"))
  if (!id.success) return badRequest(c, "Expected a UUID.")

  const body = await parseBody(c, patchSavedMealSchema)
  if (!body.ok) return badRequest(c, body.message)

  const outcome = await patchSavedMeal(getScope(c), id.data, body.data)
  if (!outcome.ok) return c.json({ code: "not-found" as const, message: "No such saved meal." }, 404)

  return c.json(outcome.value)
})

/** `DELETE /saved-meals/:id` — always 200 with `deleted`, like every delete here. */
foodRoutes.delete("/saved-meals/:id", writeRateLimit, async (c) => {
  const id = anyUuidSchema.safeParse(c.req.param("id"))
  if (!id.success) return badRequest(c, "Expected a UUID.")

  return c.json(await deleteSavedMeal(getScope(c), id.data))
})
