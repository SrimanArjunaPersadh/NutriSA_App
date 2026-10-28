import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import {
  addDays,
  belowSafeFloor,
  checkLogDate,
  currentClockTime,
  isPortionUnit,
  MEAL_SLOTS,
  portionLabel,
  roundTo,
  scalePortion,
  servingsQuantity,
  sumMacros,
  type LogDay,
  type PortionUnit,
} from "@engine"
import {
  foodDisplayName,
  writeMealSchema,
  type ChatProposal,
  type ChatToolName,
  type DaySummary,
  type Food,
  type SavedMeal,
  type WriteMeal,
} from "@shared"

import type { UserScope } from "../auth/user-scope"
import { readDaySummary } from "../data/day"
import { searchLocalFoods } from "../data/foods"
import { listSavedMeals } from "../data/saved-meals"
import { readWeightSeries } from "../data/weight"
import { uuidv7 } from "../db/uuidv7"

/**
 * The assistant's tools (plan.md, Phase 9, Q4, Q5, Q16, Q18, Q31).
 *
 * ## Reads return engine values, never raw rows
 *
 * Every tool wraps a read the app already serves, so the numbers are the ones
 * on the user's screens, computed by the engine. Each answer carries only the
 * fields a reply needs: no database ids, no user id, no email (Q16).
 *
 * ## Foods are named by a per-turn reference
 *
 * `search_foods` and `get_saved_meals` label each result `f1`, `m1` and so on.
 * A meal card may only name references this turn handed out (Q5), which is
 * also what lets a card use a recent meal line that has no `foods` row. The
 * model never sees a database id, and cannot name another user's food,
 * because every reference was minted from this user's scoped reads.
 *
 * ## Other people's text is capped and labelled as data
 *
 * Shared and Open Food Facts names were written by other people. They reach
 * the model only as JSON string values, cut to `NAME_CHARS` (Q18).
 *
 * ## The card touches nothing
 *
 * `propose_meal_log` builds a `POST /meal-logs` body and keeps it in the turn's
 * context. Nothing is written until the user taps Confirm on the phone.
 */

/** How far back a tool may look: the same quarter the week strip scrolls. */
const LOOKBACK_DAYS = 90

/** Results per search, enough to choose from without filling the context. */
const SEARCH_RESULTS = 8

/** A food or meal name, as the model sees it (Q18). */
const NAME_CHARS = 80

/** Weigh-ins listed by `get_weight_trend`, newest first. */
const RECENT_WEIGH_INS = 7

export type ToolRef = { kind: "food"; food: Food } | { kind: "saved"; meal: SavedMeal }

/** What a turn's tools share: who is asking, which day it is, what was found. */
export type ToolContext = {
  scope: UserScope
  today: LogDay
  refs: Map<string, ToolRef>
  proposal: ChatProposal | null
}

export function newToolContext(scope: UserScope, today: LogDay): ToolContext {
  return { scope, today, refs: new Map(), proposal: null }
}

const dateInput: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "A day as YYYY-MM-DD. Today or up to 90 days back." },
  },
  required: ["date"],
  additionalProperties: false,
}

/**
 * The definitions, in a fixed order. They sit before the cache breakpoint, so
 * a change here costs one cache write and nothing else.
 */
export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_day_summary",
    description:
      "The user's log for one day: what they ate (meals and items), their targets, consumed and remaining kcal and macros.",
    input_schema: dateInput,
    strict: true,
  },
  {
    name: "get_remaining_macros",
    description: "For one day: the user's targets, what they have consumed, and what remains. No meal list.",
    input_schema: dateInput,
    strict: true,
  },
  {
    name: "get_weight_trend",
    description:
      "The user's smoothed weight trend: the latest trend weight, its change over 7 and 30 days, the goal weight and the recent weigh-ins.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: ["integer", "null"],
          description: "How many days back to cover, or null for the whole history.",
        },
      },
      required: ["days"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_targets",
    description:
      "The user's kcal and macro targets in force on one day, and whether the kcal target is below the coach's safe floor.",
    input_schema: dateInput,
    strict: true,
  },
  {
    name: "get_saved_meals",
    description: "The user's saved meals, each with a reference (m1, m2, ...) that propose_meal_log accepts.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "search_foods",
    description:
      "Search the user's foods, recent meal lines and the shared food list. Each result has a reference (f1, f2, ...) that propose_meal_log accepts, a unit, and one serving.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "A food name, e.g. 'eggs' or 'oats'." } },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "propose_meal_log",
    description:
      "Show the user a card to log a meal today. It saves nothing: the user confirms or dismisses it. Every item must be a reference from search_foods or get_saved_meals in this turn. Give servings (a count of the result's serving) or amount with unit g or ml, never both.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", enum: [...MEAL_SLOTS] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ref: { type: "string" },
              servings: { type: ["number", "null"] },
              amount: { type: ["number", "null"] },
              // `anyOf`, not `type: ["string", "null"]` with an enum: the API
              // rejects an enum holding a value its type list does not name
              // (found by `countTokens` on the first real call, 2026-10-28).
              unit: { anyOf: [{ type: "string", enum: ["g", "ml"] }, { type: "null" }] },
            },
            required: ["ref", "servings", "amount", "unit"],
            additionalProperties: false,
          },
        },
      },
      required: ["slot", "items"],
      additionalProperties: false,
    },
    strict: true,
  },
]

const dateArgs = z.object({ date: z.string() })
const trendArgs = z.object({ days: z.number().int().positive().max(36_500).nullable() })
const searchArgs = z.object({ query: z.string().trim().min(1).max(100) })
const proposeArgs = z.object({
  slot: z.enum(MEAL_SLOTS),
  items: z
    .array(
      z.object({
        ref: z.string(),
        servings: z.number().positive().nullable(),
        amount: z.number().positive().nullable(),
        unit: z.enum(["g", "ml"]).nullable(),
      }),
    )
    .min(1)
    .max(20),
})

/** A tool's answer: JSON for the model, and whether it is an error. */
export type ToolResult = { content: string; isError: boolean }

const ok = (value: unknown): ToolResult => ({ content: JSON.stringify(value), isError: false })
const fail = (message: string): ToolResult => ({ content: JSON.stringify({ error: message }), isError: true })

/**
 * Runs one tool call. Never throws for bad input: the model gets an error it
 * can read and correct. A database failure does throw, and ends the turn.
 */
export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolResult> {
  switch (name as ChatToolName) {
    case "get_day_summary":
    case "get_remaining_macros":
    case "get_targets": {
      const args = dateArgs.safeParse(input)
      if (!args.success) return fail("Expected { date: 'YYYY-MM-DD' }.")
      const day = checkDay(ctx, args.data.date)
      if (!day.ok) return fail(day.message)
      const summary = await readDaySummary(ctx.scope, day.day)
      if (name === "get_targets") return ok(targetsResult(summary))
      if (name === "get_remaining_macros") return ok(remainingResult(summary))
      return ok(daySummaryResult(summary))
    }
    case "get_weight_trend": {
      const args = trendArgs.safeParse(input)
      if (!args.success) return fail("Expected { days: a whole number, or null }.")
      return ok(await weightTrendResult(ctx, args.data.days))
    }
    case "get_saved_meals":
      return ok(await savedMealsResult(ctx))
    case "search_foods": {
      const args = searchArgs.safeParse(input)
      if (!args.success) return fail("Expected { query: a food name }.")
      return ok(await searchResult(ctx, args.data.query))
    }
    case "propose_meal_log": {
      const args = proposeArgs.safeParse(input)
      if (!args.success) return fail("Expected a slot and one or more items, each with a reference.")
      return proposeMeal(ctx, args.data)
    }
    default:
      return fail(`There is no tool called ${name}.`)
  }
}

/**
 * The server's date check (Q4): a real day, not after today, not more than
 * `LOOKBACK_DAYS` back. The engine's `checkLogDate`, the same one the write
 * routes bound back-dating with.
 */
function checkDay(
  ctx: ToolContext,
  date: string,
): { ok: true; day: LogDay } | { ok: false; message: string } {
  const result = checkLogDate(date, { today: ctx.today, earliest: addDays(ctx.today, -LOOKBACK_DAYS) })
  if (result.ok) return { ok: true, day: result.day }
  switch (result.reason) {
    case "in-the-future":
      return { ok: false, message: `${date} is after today (${ctx.today}).` }
    case "too-far-back":
      return {
        ok: false,
        message: `${date} is more than ${LOOKBACK_DAYS} days back. Only the last ${LOOKBACK_DAYS} days can be read.`,
      }
    default:
      return { ok: false, message: `${date} is not a day. Use YYYY-MM-DD.` }
  }
}

const name = (text: string) => text.slice(0, NAME_CHARS)

function targetsResult(summary: DaySummary) {
  return {
    date: summary.date,
    targets: summary.targets,
    belowSafeFloor: summary.targets ? belowSafeFloor(summary.targets.kcal) : null,
  }
}

function remainingResult(summary: DaySummary) {
  return {
    date: summary.date,
    targets: summary.targets,
    consumed: summary.consumed,
    remaining: summary.remaining,
  }
}

function daySummaryResult(summary: DaySummary) {
  return {
    ...remainingResult(summary),
    meals: summary.meals.map((meal) => ({
      name: name(meal.name),
      time: meal.loggedTime,
      macros: meal.macros,
      items: meal.items.map((item) => ({ name: name(item.name), qty: item.qty, kcal: item.macros.kcal })),
    })),
  }
}

/**
 * The weight figures, at the precision the Weight tab prints them: kg to one
 * decimal, the weekly rate to two. Rounded by the engine's `roundTo` so the
 * model can quote what the user sees; the unsourced-number check compares
 * against exactly these.
 */
async function weightTrendResult(ctx: ToolContext, days: number | null) {
  const series = await readWeightSeries(ctx.scope, days ?? "all")
  const kg = (value: number) => roundTo(value, 1)
  return {
    latest: series.latest ? { day: series.latest.day, trendKg: kg(series.latest.trend) } : null,
    change7dKg: series.change7d ? kg(series.change7d.delta) : null,
    change30dKg: series.change30d ? kg(series.change30d.delta) : null,
    goalWeightKg: series.goalWeightKg,
    remainingToGoalKg: series.goal ? kg(series.goal.remainingKg) : null,
    ratePerWeekKg: series.projection ? roundTo(series.projection.ratePerWeek, 2) : null,
    projectedGoalDay: series.projection?.goalDay ?? null,
    recentWeighIns: series.entries.slice(0, RECENT_WEIGH_INS).map((entry) => ({
      day: entry.day,
      weightKg: kg(entry.weightKg),
    })),
  }
}

async function savedMealsResult(ctx: ToolContext) {
  const { meals } = await listSavedMeals(ctx.scope)
  return {
    meals: meals.map((meal) => {
      const ref = `m${countRefs(ctx, "saved") + 1}`
      ctx.refs.set(ref, { kind: "saved", meal })
      return {
        ref,
        name: name(meal.name),
        macros: meal.macros,
        items: meal.items.map((item) => name(item.name)),
      }
    }),
  }
}

async function searchResult(ctx: ToolContext, query: string) {
  const { foods } = await searchLocalFoods(ctx.scope, query)
  return {
    query,
    foods: foods.slice(0, SEARCH_RESULTS).map((food) => {
      const ref = `f${countRefs(ctx, "food") + 1}`
      ctx.refs.set(ref, { kind: "food", food })
      const unit = unitOf(food)
      return {
        ref,
        name: name(foodDisplayName(food.name, food.brand)),
        unit,
        serving: { quantity: food.serving.quantity, label: food.serving.label },
        servingMacros: scalePortion(food.per, food.serving.quantity, unit),
      }
    }),
  }
}

function countRefs(ctx: ToolContext, kind: ToolRef["kind"]): number {
  let count = 0
  for (const ref of ctx.refs.values()) if (ref.kind === kind) count += 1
  return count
}

/** A unit this build does not know is a piece, as the logger treats it. */
function unitOf(food: Food): PortionUnit {
  return isPortionUnit(food.unit) ? food.unit : "piece"
}

/**
 * Builds the card. Every line's macros come from the stored food through the
 * engine; the model supplies only references, counts and weights it copied
 * from the user. The result is a complete `POST /meal-logs` body for today,
 * checked against the same schema the route parses it with.
 */
function proposeMeal(ctx: ToolContext, args: z.infer<typeof proposeArgs>): ToolResult {
  const items: WriteMeal["items"] = []

  for (const line of args.items) {
    const ref = ctx.refs.get(line.ref)
    if (!ref) {
      return fail(
        `${line.ref} was not returned by search_foods or get_saved_meals in this turn. ` +
          "Search first, or tell the user the food was not found and suggest adding it by hand.",
      )
    }

    if (ref.kind === "saved") {
      if (line.amount !== null || (line.servings !== null && line.servings !== 1)) {
        return fail(`A saved meal (${line.ref}) is logged as saved: give servings 1 or null, and no amount.`)
      }
      items.push(...ref.meal.items.map(savedItem))
      continue
    }

    const unit = unitOf(ref.food)
    let quantity: number
    if (line.amount !== null) {
      if (line.servings !== null) return fail(`${line.ref}: give servings or amount, not both.`)
      if (line.unit !== unit) {
        return fail(`${line.ref} is measured in ${unit}. Give servings, or an amount in ${unit}.`)
      }
      quantity = line.amount
    } else {
      quantity = servingsQuantity(line.servings ?? 1, ref.food.serving.quantity)
    }
    if (quantity <= 0) return fail(`${line.ref}: the amount must be more than zero.`)

    items.push({
      name: foodDisplayName(ref.food.name, ref.food.brand),
      qty: portionLabel(quantity, unit),
      macros: scalePortion(ref.food.per, quantity, unit),
      portion: { quantity, unit, per: ref.food.per },
    })
  }

  const parsed = writeMealSchema.safeParse({
    id: uuidv7(),
    date: ctx.today,
    name: args.slot,
    macros: sumMacros(items.map((item) => item.macros)),
    items,
    loggedTime: currentClockTime(),
  })
  if (!parsed.success) return fail("That meal could not be built. Check the amounts and try again.")

  ctx.proposal = { day: ctx.today, slot: args.slot, meal: parsed.data, dismissed: false }
  return ok({
    shown: true,
    note: "The card is on the user's screen. Nothing is logged until they tap Confirm.",
    slot: args.slot,
    items: parsed.data.items.map((item) => ({
      name: name(item.name),
      qty: item.qty,
      kcal: item.macros.kcal,
    })),
    total: parsed.data.macros,
  })
}

/** A saved meal's line, carried over as stored, the way the logger logs one. */
function savedItem(item: SavedMeal["items"][number]): WriteMeal["items"][number] {
  const portion = item.portion
  return {
    name: item.name.trim(),
    qty: item.qty,
    macros: item.macros,
    portion:
      portion && isPortionUnit(portion.unit)
        ? {
            quantity: portion.quantity,
            unit: portion.unit,
            per: portion.per,
            ...(portion.measure ? { measure: portion.measure } : {}),
          }
        : null,
  }
}
