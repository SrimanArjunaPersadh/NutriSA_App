import { z } from "zod"

import { PORTION_UNITS } from "@engine"

import { logDaySchema, macrosSchema } from "./common"

/**
 * The write contracts: what the app may send, and what it gets back.
 *
 * ## Every write carries a client-minted UUIDv7
 *
 * plan.md, Phase 2: "accepts client UUIDv7, `ON CONFLICT (id) DO NOTHING`".
 * The id is the idempotency key, and it is the *only* thing making these routes
 * safe to retry. A logged meal has no natural key — same food, same day, twice
 * is a real thing people do — so the server cannot tell a duplicate from a
 * genuine second helping. The client can: it knows whether this is the same
 * save being retried or a new one, and it says so by reusing the id or minting
 * a fresh one.
 *
 * v7 rather than v4 specifically. The values sort by creation time, so they
 * cluster in the primary-key index instead of scattering random pages across
 * it, and a batch flushed by the offline queue (v1.1) inserts in one region of
 * the index rather than all over it. `z.uuidv7()` checks the version nibble,
 * so a v4 sent by mistake is a 400 here rather than a subtly worse index later.
 *
 * ## `date` is optional, and that is the point
 *
 * Omitting it means "today", and the server answers that with
 * `currentLoggingDay()`. plan.md's standing rule is that there is **one time
 * authority**: a client that fills in its own date is a second one, running on
 * a phone whose clock and timezone this server does not control. At 00:40 SAST
 * the two answers differ by a whole day.
 *
 * Sending a date explicitly is back-dating, which is a supported feature and is
 * bounded in `server/routes/writes.ts` — not here, because the bounds depend on
 * what day it is now, which is not a fact a schema knows.
 *
 * ## The numeric ceilings are the column widths, restated
 *
 * Each bound below is the largest value its Postgres column can hold. Without
 * them an absurd number reaches the driver and comes back as a numeric
 * overflow — a 500 with a Postgres error in it, for what is plainly a bad
 * request. They are not plausibility checks: a weight of 400 kg is allowed,
 * because refusing a real user's real number is worse than accepting a typo the
 * UI can query.
 */

/** `numeric(9,2)` — the kcal columns on `meal_logs` and `targets`. */
const MAX_KCAL = 9_999_999.99
/** `numeric(8,2)` — every gram column. */
const MAX_GRAMS = 999_999.99
/** `numeric(5,2)` — `weight_logs.weight`. */
const MAX_WEIGHT_KG = 999.99

/**
 * Text ceilings. Postgres `text` is unbounded, so these are the only thing
 * standing between the app and a meal named by a megabyte of pasted rubbish.
 * Generous on purpose — long enough that no honest entry ever meets them.
 */
const MAX_NAME_CHARS = 200
const MAX_QTY_CHARS = 60
/** Long enough for a big shopping-list meal; short enough to bound the jsonb. */
const MAX_ITEMS = 100

/**
 * The idempotency key for every write.
 *
 * Minted by the client — see the note above — and never generated server-side
 * for a request that did not carry one. A server-generated id would make the
 * write succeed twice under a retry, which is the whole failure this design
 * exists to prevent.
 */
export const clientIdSchema = z.uuidv7()

/**
 * Macros as written, in the engine's vocabulary.
 *
 * Non-negative because a negative macro is not a thing. `remainingMacros` goes
 * below zero and is right to — that is a response, computed by the engine, and
 * it is not this schema.
 */
export const writeMacrosSchema = z.object({
  kcal: z.number().min(0).max(MAX_KCAL),
  protein: z.number().min(0).max(MAX_GRAMS),
  carbs: z.number().min(0).max(MAX_GRAMS),
  fat: z.number().min(0).max(MAX_GRAMS),
})

/**
 * How the line was entered, in the engine's vocabulary.
 *
 * Stored verbatim onto the item's jsonb (translated to `pro`/`carb`/`fat` on
 * the way in) so the edit surface can reopen the line as it was typed. **The
 * server does not recompute `macros` from it** — the same rule as the header
 * totals below: what the user confirmed is what is stored.
 *
 * `quantity` is bounded well under the gram ceiling because it is a count or a
 * measure, not a macro. `unit` is checked against the engine's list here rather
 * than left as free text, because an unrecognised unit written *now* is a
 * client bug, and lenience belongs on the read path where old rows live.
 */
export const writePortionSchema = z.object({
  quantity: z.number().min(0).max(MAX_GRAMS),
  unit: z.enum(PORTION_UNITS),
  per: writeMacrosSchema,
})

/**
 * One line of a logged meal.
 *
 * `qty` is a free-text string and stays one — "1 slice", "half a punnet", "2.5"
 * are all things the old data holds and all things people type. Nothing
 * computes from it; the macros beside it are authoritative. See
 * `meal-items.ts`, which carries the same rule for the read path.
 */
export const writeMealItemSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_CHARS),
  qty: z.string().trim().max(MAX_QTY_CHARS),
  macros: writeMacrosSchema,
  /** Optional: an item may be typed as plain macros with no portion behind it. */
  portion: writePortionSchema.nullish(),
})

/**
 * `POST /meal-logs`.
 *
 * ## The header totals are taken as given, deliberately
 *
 * `macros` is not checked against the sum of `items`, and must not be. The
 * header is what the user confirmed on the review screen — `db/schema.ts` calls
 * it "confirmed and authoritative" — and re-deriving it here would let a later
 * change to rounding move a number somebody already saw and accepted. The items
 * are the record of what went in; the header is the record of what was agreed.
 *
 * That means a client bug can store a header that does not match its items.
 * That is the accepted cost, and it is visible: the day view shows both.
 */
export const writeMealSchema = z.object({
  id: clientIdSchema,
  /** Omit for today. See the note at the top of this file. */
  date: logDaySchema.optional(),
  name: z.string().trim().min(1).max(MAX_NAME_CHARS),
  macros: writeMacrosSchema,
  items: z.array(writeMealItemSchema).max(MAX_ITEMS),
  /**
   * The wall-clock time to show against the meal, `HH:MM`. Display only —
   * nothing sorts or computes by it, and a meal without one is ordinary (every
   * migrated row is).
   */
  loggedTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a wall-clock time as HH:MM")
    .nullish(),
  /**
   * Where in the day this meal sits.
   *
   * Optional, and omitting it is the normal case: the server appends via the
   * engine's `nextSortOrder`, which is the only party that can see the day as
   * it is at the moment of the write. Send one only to place a meal
   * deliberately — a reorder, or a back-dated meal that belongs at breakfast.
   */
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  /**
   * The `custom_meals` row this was logged from, if any.
   *
   * Provenance, not a foreign key — the column is plain `text` and nothing
   * joins on it yet. It is **not** verified as belonging to this user, so the
   * first route that does join on it must scope that join itself rather than
   * trust what is stored here.
   */
  libId: z.uuid().nullish(),
})

export type WriteMeal = z.infer<typeof writeMealSchema>

/**
 * `PATCH /meal-logs/:id` — correct a meal that is already logged.
 *
 * ## Why this is not `writeMealSchema.partial()`
 *
 * Decided 2026-08-16, and plan.md carries the reasoning. `.partial()` would
 * make **every** field optional including `id`, which is the one thing a patch
 * must never move: the id is the row, it arrives in the path, and a body that
 * could also carry one creates two answers to "which meal is this" that a
 * careless handler would let disagree. So this is its own object, and it does
 * not have an `id` field at all.
 *
 * ## Why an edit is a patch and not a delete plus a re-post
 *
 * Delete-and-re-post needs no new route, and that is its only merit. The meal
 * would lose its `created_at`, jump to the end of its day, and a failure
 * between the two calls would leave it simply deleted — a correction that
 * destroys the thing being corrected. A patch keeps the id, the `created_at`,
 * the `sort_order` and the day, so an edited meal stays one meal in the
 * history.
 *
 * ## At least one field
 *
 * An empty body is refused rather than treated as a no-op. It cannot be
 * anything but a bug in the caller, and answering 200 to it would hide that bug
 * behind a successful-looking request.
 *
 * ## `date` **is** patchable
 *
 * "I logged this on the wrong day" is a real correction, and the workaround for
 * it is exactly the delete-and-re-post this route removes. A meal that moves to
 * another day is given a fresh `sortOrder` for the day it lands on — see
 * `server/data/meals.ts` — because its old position belongs to a different
 * day's ordering and would otherwise collide with whatever already sits there.
 */
export const patchMealSchema = z
  .object({
    /** Moves the meal to another day. Bounded by the route, same as a create. */
    date: logDaySchema.optional(),
    name: z.string().trim().min(1).max(MAX_NAME_CHARS).optional(),
    /** The confirmed header. Not checked against `items`, same as on a create. */
    macros: writeMacrosSchema.optional(),
    items: z.array(writeMealItemSchema).max(MAX_ITEMS).optional(),
    /**
     * `null` clears the time; omitting the field leaves it as it was. The two
     * are genuinely different requests and the route reads them as such.
     */
    loggedTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a wall-clock time as HH:MM")
      .nullable()
      .optional(),
    /** A deliberate reorder within the day. Omit and the position is left alone. */
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "Send at least one field to change.",
  })

export type PatchMeal = z.infer<typeof patchMealSchema>

/**
 * What a patch answers with.
 *
 * The same three facts a create returns, for the same reason — the client
 * refetches the day rather than patching its cache — plus the day the meal is
 * on **now**, which is the one thing the caller may have just changed and
 * cannot assume. `created` has no meaning here: a patch never creates a row,
 * and a missing one is a 404.
 */
export const mealPatchResultSchema = z.object({
  id: z.string(),
  date: logDaySchema,
  sortOrder: z.number(),
  /** The day the meal was on **before** this patch, so the client can also
   *  invalidate the day it left. Equal to `date` when nothing moved. */
  previousDate: logDaySchema,
})

export type MealPatchResult = z.infer<typeof mealPatchResultSchema>

/**
 * `POST /weight-logs`.
 *
 * One weigh-in per calendar day, enforced by a unique index. Posting a second
 * one for a day **replaces** it rather than failing: standing on the scale
 * twice is how people correct a reading, and the trend takes one step per day,
 * so there is no shape of this table where both could be kept.
 */
export const writeWeightSchema = z.object({
  id: clientIdSchema,
  date: logDaySchema.optional(),
  /**
   * The raw scale reading in kg. Never the trend — that is derived by the
   * engine on every read and is stored nowhere.
   */
  weightKg: z.number().gt(0).max(MAX_WEIGHT_KG),
})

export type WriteWeight = z.infer<typeof writeWeightSchema>

/**
 * `POST /targets`.
 *
 * Effective-dated: a row records what the targets became on `validFrom` and
 * holds until a later row supersedes it, so changing them today never rewrites
 * what a day in March resolved to. Posting twice for the same `validFrom`
 * updates that row — it is the same edit, pressed twice.
 *
 * A future `validFrom` is refused by the route even though the read side
 * already handles one correctly (`GET /day/:date` filters `valid_from <= day`).
 * Nothing in the app can schedule a target change yet, so a future date today
 * could only be a mistake, and it would be a silent one: the new targets would
 * appear to do nothing. Lifting that is one line when a scheduling surface
 * exists.
 */
export const writeTargetsSchema = z.object({
  id: clientIdSchema,
  /** Omit for today — the usual case, "these are my targets from now". */
  validFrom: logDaySchema.optional(),
  macros: writeMacrosSchema,
})

export type WriteTargets = z.infer<typeof writeTargetsSchema>

/**
 * What a write answers with.
 *
 * Not the whole day. The client refetches `GET /day/:date` after a successful
 * write, because a meal changes the totals, the rings, the average and possibly
 * the streak, and every one of those is the engine's answer rather than
 * something the client can patch into its cache correctly. What comes back here
 * is only what the client cannot know: the id the row actually has, the day it
 * actually landed on, and whether anything changed.
 */
export const mealWriteResultSchema = z.object({
  id: clientIdSchema,
  date: logDaySchema,
  sortOrder: z.number(),
  /**
   * False when this exact id was already stored — a retry that arrived after
   * the first attempt had already succeeded. Nothing was written the second
   * time, and that is the design working, not an error.
   */
  created: z.boolean(),
})

export type MealWriteResult = z.infer<typeof mealWriteResultSchema>

/**
 * `DELETE /meal-logs/:id`.
 *
 * `deleted: false` means there was nothing to delete — already gone, or never
 * this user's. The two are deliberately not distinguished: telling a caller
 * "that row exists but is not yours" is an existence oracle over other people's
 * data, and the client's behaviour is the same either way.
 */
export const mealDeleteResultSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
})

export type MealDeleteResult = z.infer<typeof mealDeleteResultSchema>

export const weightWriteResultSchema = z.object({
  /** The id of the row that now holds this day — not necessarily the one sent. */
  id: z.string(),
  date: logDaySchema,
  weightKg: z.number(),
  /** True when this overwrote an existing weigh-in for that day. */
  replaced: z.boolean(),
})

export type WeightWriteResult = z.infer<typeof weightWriteResultSchema>

/** One effective-dated target row, as the client reads it. */
export const targetRowSchema = z.object({
  id: z.string(),
  validFrom: logDaySchema,
  macros: macrosSchema,
})

export type TargetRowResponse = z.infer<typeof targetRowSchema>

/**
 * `GET /targets`.
 *
 * `current` is resolved by the engine's `resolveTargetForDate` against today,
 * not simply the newest row: a row dated in the future is not in force, and
 * picking the last one by `valid_from` would apply it early. Null is a real
 * state — every user has it until they first set targets.
 */
export const targetsResponseSchema = z.object({
  current: targetRowSchema.nullable(),
  /** Every row, oldest first. The history is short and the client shows it. */
  history: z.array(targetRowSchema),
})

export type TargetsResponse = z.infer<typeof targetsResponseSchema>

export const targetsWriteResultSchema = z.object({
  id: z.string(),
  validFrom: logDaySchema,
  macros: macrosSchema,
  /** True when a row already existed for that `validFrom` and was updated. */
  replaced: z.boolean(),
})

export type TargetsWriteResult = z.infer<typeof targetsWriteResultSchema>
