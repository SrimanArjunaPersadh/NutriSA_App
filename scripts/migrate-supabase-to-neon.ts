import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { db, schema } from "../server/db"
import { isLogDay, type LogDay } from "@engine"
import { numOrNull, num, nullable, readCsv, ts } from "./csv"

/**
 * Moves the Supabase history into Neon, once.
 *
 * Run the dry run first — it reads and validates everything, prints the counts,
 * and writes nothing:
 *
 *     npx tsx scripts/migrate-supabase-to-neon.ts --dry-run
 *     npx tsx scripts/migrate-supabase-to-neon.ts
 *
 * ## Rules this script exists to keep
 *
 * - **`qty` is copied verbatim as a string.** The old data holds things like
 *   "1 slice". Parsing it would destroy what was actually typed, and nothing
 *   computes from it — the macros on the same object are authoritative.
 * - **Item keys stay `{name, qty, kcal, pro, carb, fat}`.** The target column is
 *   named `items` instead of `ings_json`, but the objects inside are not
 *   remapped: a remap is a chance to transpose carbs and protein across 38 rows
 *   of history and never notice.
 * - **`date` and `created_at` both survive.** They diverge, because a meal can
 *   be logged on a later day than it was eaten. Collapsing them would quietly
 *   re-date the history.
 * - **Every row is stamped with the Clerk id from `.env`**, never a hard-coded
 *   one, so the script stays runnable against a different account.
 *
 * Re-running is safe: every insert is `ON CONFLICT (id) DO NOTHING`, and the
 * source ids are carried over, so a half-finished run finishes on the retry
 * rather than duplicating. It is not one transaction — Neon's HTTP driver has
 * no cross-statement transaction — which is exactly why the inserts have to be
 * idempotent instead.
 */

const EXPORT_DIR = path.join(process.cwd(), "data", "supabase_export")

/** Confirmed by Sriman 2026-08-12. Seeds the one and only `targets` row. */
const CONFIRMED_TARGETS = { kcal: 2300, pro: 167, carb: 195, fat: 60 }

const dryRun = process.argv.includes("--dry-run")

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Add it to .env — see plan.md Phase 0.`)
  return value
}

/**
 * Retries a statement through transient network failures.
 *
 * Neon's HTTP driver reaches the database over `fetch`, and that connection
 * drops often enough to matter: a 38-row insert failed here while a 4-row one
 * immediately after succeeded, with identical data. A transport blip is not a
 * reason to abandon a migration halfway.
 *
 * Only transport errors are retried. A Postgres error carries a `code` (a
 * constraint violation, a bad type), and retrying one of those just produces
 * the same failure more slowly while hiding the real problem.
 */
async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 4
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error: unknown) {
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause
      const isPostgresError = Boolean(cause?.code)
      if (isPostgresError || attempt === MAX_ATTEMPTS) throw error

      const waitMs = 400 * 2 ** (attempt - 1)
      console.log(
        `  ${label}: ${cause?.message ?? "connection failed"} — ` +
          `retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs}ms`,
      )
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}

function table(name: string) {
  const file = path.join(EXPORT_DIR, `${name}.csv`)
  try {
    return readCsv(readFileSync(file, "utf8"))
  } catch {
    throw new Error(`Could not read ${file}. Export it from Supabase first.`)
  }
}

/**
 * Parses one `ings_json` / `ingredients` cell.
 *
 * Validates the shape rather than reshaping it: the keys must already be the
 * ones the app expects, and `qty` must already be a string. If either is ever
 * untrue the migration stops, because the alternative is writing subtly wrong
 * macros that nothing downstream can detect.
 */
function parseItems(raw: string | undefined, where: string): schema.MealItem[] {
  const text = nullable(raw)
  if (text === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`${where}: items is not valid JSON`)
  }
  if (!Array.isArray(parsed)) throw new Error(`${where}: items is not an array`)

  return parsed.map((item, i) => {
    const at = `${where} item ${i}`
    if (typeof item !== "object" || item === null) throw new Error(`${at}: not an object`)
    const it = item as Record<string, unknown>

    if (typeof it.qty !== "string") {
      // Not coerced on purpose — see the header. A number here means the source
      // data changed shape and the assumption needs re-checking, not patching.
      throw new Error(`${at}: qty must be a string, got ${typeof it.qty}`)
    }
    for (const key of ["kcal", "pro", "carb", "fat"] as const) {
      if (typeof it[key] !== "number" || !Number.isFinite(it[key])) {
        throw new Error(`${at}: ${key} must be a number`)
      }
    }
    if (typeof it.name !== "string") throw new Error(`${at}: name must be a string`)

    return {
      name: it.name,
      qty: it.qty,
      kcal: it.kcal as number,
      pro: it.pro as number,
      carb: it.carb as number,
      fat: it.fat as number,
    }
  })
}

function parseMacros(raw: string | undefined, where: string): schema.FoodMacros | null {
  const text = nullable(raw)
  if (text === null) return null
  const v = JSON.parse(text) as Record<string, unknown>
  for (const key of ["kcal", "pro", "carb", "fat"] as const) {
    if (typeof v[key] !== "number") throw new Error(`${where}: ${key} must be a number`)
  }
  return {
    kcal: v.kcal as number,
    pro: v.pro as number,
    carb: v.carb as number,
    fat: v.fat as number,
  }
}

function assertDay(value: string | undefined, where: string): LogDay {
  const day = nullable(value)
  if (day === null || !isLogDay(day)) {
    throw new Error(`${where}: expected YYYY-MM-DD, got ${JSON.stringify(value)}`)
  }
  return day
}

async function main() {
  const userId = requireEnv("MIGRATION_TARGET_USER_ID")

  // ---- read and validate -------------------------------------------------
  const weightCsv = table("weight_logs_rows")
  const mealCsv = table("meal_logs_rows")
  const savedCsv = table("custom_meals_rows")
  const foodCsv = table("custom_foods_rows")

  const weightLogs = weightCsv.rows.map((r, i) => ({
    id: r.id!,
    userId,
    date: assertDay(r.date, `weight_logs[${i}]`),
    weight: num(r.weight, `weight_logs[${i}].weight`),
    createdAt: ts(r.created_at, `weight_logs[${i}].created_at`),
  }))

  const mealLogs = mealCsv.rows.map((r, i) => ({
    id: r.id!,
    userId,
    date: assertDay(r.date, `meal_logs[${i}]`),
    name: r.name ?? "",
    kcal: num(r.kcal, `meal_logs[${i}].kcal`),
    pro: num(r.pro, `meal_logs[${i}].pro`),
    carb: num(r.carb, `meal_logs[${i}].carb`),
    fat: num(r.fat, `meal_logs[${i}].fat`),
    items: parseItems(r.ings_json, `meal_logs[${i}]`),
    loggedTime: nullable(r.logged_time),
    sortOrder: numOrNull(r.sort_order, `meal_logs[${i}].sort_order`) ?? 0,
    // Kept verbatim. It is not a foreign key: these are short text keys from
    // the old app's library, not `custom_meals.id` values, which are UUIDs.
    libId: nullable(r.lib_id),
    createdAt: ts(r.created_at, `meal_logs[${i}].created_at`),
  }))

  const customMeals = savedCsv.rows.map((r, i) => ({
    id: r.id!,
    userId,
    name: r.name ?? "",
    kcal: num(r.kcal, `custom_meals[${i}].kcal`),
    pro: num(r.pro, `custom_meals[${i}].pro`),
    carb: num(r.carb, `custom_meals[${i}].carb`),
    fat: num(r.fat, `custom_meals[${i}].fat`),
    items: parseItems(r.ingredients, `custom_meals[${i}]`),
    category: nullable(r.cat),
    note: nullable(r.note),
    createdAt: ts(r.created_at, `custom_meals[${i}].created_at`),
  }))

  const foods = foodCsv.rows.map((r, i) => {
    const per100 = parseMacros(r.per100, `custom_foods[${i}].per100`)
    const perUnit = parseMacros(r.per_unit, `custom_foods[${i}].per_unit`)
    if ((per100 === null) === (perUnit === null)) {
      // The foods_one_basis CHECK would reject this anyway; failing here names
      // the offending row instead of surfacing a constraint violation.
      throw new Error(`custom_foods[${i}]: needs exactly one of per100 / per_unit`)
    }
    return {
      id: r.id!,
      // The user's own foods, not global rows — global ones have a NULL user_id
      // and arrive later from Open Food Facts.
      userId,
      name: r.name ?? "",
      cat: nullable(r.cat),
      unit: nullable(r.unit),
      defaultQty: numOrNull(r.default_qty, `custom_foods[${i}].default_qty`),
      per100,
      perUnit,
      unitLabel: nullable(r.unit_label),
      barcode: nullable(r.barcode),
      source: "manual" as const,
      createdAt: ts(r.created_at, `custom_foods[${i}].created_at`),
    }
  })

  // The first day anything was logged. The targets row is dated from here so
  // every migrated day resolves to a target instead of to null.
  const earliestDay = [...weightLogs, ...mealLogs]
    .map((r) => r.date)
    .sort()[0]
  if (!earliestDay) throw new Error("No dated rows found — nothing to anchor targets to.")

  const targetsRow = {
    id: randomUUID(),
    userId,
    validFrom: earliestDay,
    kcal: CONFIRMED_TARGETS.kcal,
    pro: CONFIRMED_TARGETS.pro,
    carb: CONFIRMED_TARGETS.carb,
    fat: CONFIRMED_TARGETS.fat,
  }

  // ---- report ------------------------------------------------------------
  const itemCount = (rows: { items: schema.MealItem[] }[]) =>
    rows.reduce((n, r) => n + r.items.length, 0)

  console.log(`\nsource: ${EXPORT_DIR}`)
  console.log(`target user: ${userId.slice(0, 9)}… (from MIGRATION_TARGET_USER_ID)\n`)
  // Sorted for display: the CSV is in insertion order, so printing the first
  // and last rows as-is shows a range that reads backwards.
  const weightDays = weightLogs.map((r) => r.date).sort()
  console.log(`  weight_logs   ${String(weightLogs.length).padStart(3)}  ` +
    `${weightDays[0]} … ${weightDays.at(-1)}  (${new Set(weightDays).size} distinct days)`)
  console.log(`  meal_logs     ${String(mealLogs.length).padStart(3)}  ` +
    `${itemCount(mealLogs)} items`)
  console.log(`  custom_meals  ${String(customMeals.length).padStart(3)}  ` +
    `${itemCount(customMeals)} items, ${customMeals.filter((m) => m.note).length} with a note`)
  console.log(`  foods         ${String(foods.length).padStart(3)}  ` +
    `${foods.filter((f) => f.barcode).length} with a barcode, source='manual'`)
  console.log(`  targets         1  valid_from ${earliestDay} ` +
    `(${CONFIRMED_TARGETS.kcal}/${CONFIRMED_TARGETS.pro}/` +
    `${CONFIRMED_TARGETS.carb}/${CONFIRMED_TARGETS.fat})`)
  console.log(`\n  water_logs      -  cut from v1, deliberately not migrated`)

  if (dryRun) {
    console.log("\nDRY RUN — everything above parsed and validated. Nothing was written.\n")
    return
  }

  // ---- write -------------------------------------------------------------
  console.log("\nwriting…")
  const wrote = {
    weight_logs: (await withRetry("weight_logs", () =>
      db.insert(schema.weightLogs).values(weightLogs)
        .onConflictDoNothing().returning({ id: schema.weightLogs.id }))).length,
    meal_logs: (await withRetry("meal_logs", () =>
      db.insert(schema.mealLogs).values(mealLogs)
        .onConflictDoNothing().returning({ id: schema.mealLogs.id }))).length,
    custom_meals: (await withRetry("custom_meals", () =>
      db.insert(schema.customMeals).values(customMeals)
        .onConflictDoNothing().returning({ id: schema.customMeals.id }))).length,
    foods: (await withRetry("foods", () =>
      db.insert(schema.foods).values(foods)
        .onConflictDoNothing().returning({ id: schema.foods.id }))).length,
    targets: (await withRetry("targets", () =>
      db.insert(schema.targets).values(targetsRow)
        .onConflictDoNothing().returning({ id: schema.targets.id }))).length,
  }

  for (const [name, n] of Object.entries(wrote)) {
    console.log(`  ${name.padEnd(14)} inserted ${n}`)
  }
  console.log("\nA count of 0 on a re-run is correct — the rows were already there.\n")
}

main().catch((error: unknown) => {
  // Drizzle's message is the full parameterised SQL, which buries the reason
  // under 190 bind parameters. The cause is where Postgres — or the transport —
  // actually says what went wrong, so lead with that.
  const cause = (error as { cause?: { message?: string; code?: string; detail?: string } })
    ?.cause
  const headline = cause?.message ?? (error instanceof Error ? error.message : String(error))

  console.error(`\nMigration aborted: ${headline.split("\n")[0]}`)
  if (cause?.code) console.error(`  postgres code: ${cause.code}`)
  if (cause?.detail) console.error(`  detail: ${cause.detail}`)
  console.error("\nRe-running is safe — inserts skip ids that are already there.\n")
  process.exit(1)
})
