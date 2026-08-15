import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { db, schema } from "../server/db"
import { withRetry } from "../server/db/retry"

/**
 * Seeds the one `profiles` row the dashboard reads.
 *
 *     npx tsx scripts/seed-profile.ts --dry-run
 *     npx tsx scripts/seed-profile.ts
 *
 * ## Why this exists as a script and not a screen
 *
 * `profiles.goal_weight_kg` has been a column since migration 0003 and **no
 * surface in the app writes it**. Three things on the dashboard read it and
 * none can render without it: the chart's goal line, the "% of the way" ring,
 * and `goalProgress()`. `profiles` is empty, so today all three are absent
 * rather than wrong — which is the correct behaviour and also a blank third of
 * the screen.
 *
 * A real profile/settings surface is a whole screen with four states, its own
 * validation and its own branch. Blocking the entire live-data branch on it
 * would be the tail wagging the dog, so this seeds one row for one user and the
 * screen stays owed. plan.md, "The next three branches", 2026-08-14.
 *
 * ## The goal weight comes from the environment, not from this file
 *
 * It was a hard-coded constant in this file — a real person's real target
 * weight, committed, in git history forever. Caught by the Privacy axis of
 * `/nutrisa-review`, 2026-08-15. The value is deliberately not repeated here
 * either: a comment quoting the literal is the same exposure in a different
 * syntax.
 *
 * The −9.0 kg fixture offset genuinely does not apply here, and that reasoning
 * still holds: this writes to Neon, which already holds the true 38-row history
 * unshifted, and a goal offset by 9 kg against unoffset weights would put the
 * goal line in the wrong place and report the user as having arrived when they
 * had not. But "the offset does not apply" is an argument about *Neon*, not
 * about the literal in the source — and the literal is the part that ends up in
 * a repository that may not stay private.
 *
 * So it moves to `.env`, alongside every other value this project treats as
 * personal. `SEED_GOAL_WEIGHT_KG=85`.
 */

const dryRun = process.argv.includes("--dry-run")

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Add it to .env — see plan.md Phase 0.`)
  return value
}

/**
 * Validated rather than trusted. A typo that parses as `NaN` would otherwise
 * reach the `numeric(5,2)` column as a null and silently un-set the goal —
 * which looks identical, on screen, to never having set one.
 */
function requireGoalWeight(): number {
  const raw = requireEnv("SEED_GOAL_WEIGHT_KG")
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SEED_GOAL_WEIGHT_KG must be a positive number of kilograms, got "${raw}".`)
  }
  return value
}

async function main() {
  const userId = requireEnv("MIGRATION_TARGET_USER_ID")
  const GOAL_WEIGHT_KG = requireGoalWeight()

  // The FK to users.clerk_id would catch this, but the error it throws names a
  // constraint rather than the problem. A missing mirror row means the Clerk
  // webhook has not run for this account, which is a different fix.
  const [user] = await withRetry("users lookup", () =>
    db
      .select({ clerkId: schema.users.clerkId })
      .from(schema.users)
      .where(eq(schema.users.clerkId, userId))
      .limit(1),
  )

  if (!user) {
    throw new Error(
      `No users row for ${userId}. The Clerk sync has not mirrored this account yet — ` +
        `sign in once with the webhook running, then re-run this.`,
    )
  }

  const [existing] = await withRetry("profiles lookup", () =>
    db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1),
  )

  if (dryRun) {
    console.log(
      existing
        ? `Dry run: would set goal_weight_kg = ${GOAL_WEIGHT_KG} on the existing profile ` +
            `(currently ${existing.goalWeightKg ?? "unset"}).`
        : `Dry run: would insert one profiles row for ${userId} with goal_weight_kg = ${GOAL_WEIGHT_KG}.`,
    )
    return
  }

  /**
   * Idempotent, and an update rather than a skip.
   *
   * Re-running with a different `GOAL_WEIGHT_KG` is the only way to change the
   * goal until the settings screen exists, so this has to be the way to move
   * it. Every other profile field is left alone: they are all nullable, an
   * empty profile is a valid state, and this script has no opinion about them.
   */
  if (existing) {
    await withRetry("profiles update", () =>
      db
        .update(schema.profiles)
        .set({ goalWeightKg: GOAL_WEIGHT_KG, updatedAt: new Date() })
        .where(eq(schema.profiles.userId, userId)),
    )
    console.log(
      `Updated goal_weight_kg to ${GOAL_WEIGHT_KG} (was ${existing.goalWeightKg ?? "unset"}).`,
    )
    return
  }

  await withRetry("profiles insert", () =>
    db.insert(schema.profiles).values({
      id: randomUUID(),
      userId,
      goalWeightKg: GOAL_WEIGHT_KG,
    }),
  )
  console.log(`Inserted one profiles row for ${userId}, goal_weight_kg = ${GOAL_WEIGHT_KG}.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
