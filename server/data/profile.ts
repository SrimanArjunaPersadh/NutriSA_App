import { randomUUID } from "node:crypto"

import type { AiConsent, Profile, WriteProfile } from "@shared"

import type { UserScope } from "../auth/user-scope"
import { profiles } from "../db/schema"
import { selectOwned, upsertOwned } from "./scoped"

/**
 * The profile, as v1 holds it: the goal weight and nothing else.
 *
 * Why only that, and why the client mints no id here, is in
 * `packages/shared/src/profile.ts`. What this file adds is the storage rule:
 * there is at most one `profiles` row per user (`UNIQUE (user_id)`), it is
 * created the first time a goal is saved, and it is never deleted by this
 * surface. Clearing the goal writes `NULL` into the column rather than removing
 * the row, because the row is where the other five columns will live once a
 * feature reads them, and an empty profile is a valid state, not a missing one
 * (see the comment on `profiles` in `../db/schema.ts`).
 */

/** `GET /profile`. No row is the ordinary state for a new user, not a 404. */
export async function readProfile(scope: UserScope): Promise<Profile> {
  const rows = await selectOwned(scope, profiles, { limit: 1 })
  return { goalWeightKg: rows[0]?.goalWeightKg ?? null }
}

/**
 * `PUT /profile` — set or clear the goal weight.
 *
 * An upsert on `user_id`, which is the conflict target `upsertOwned` requires
 * to contain the owner: the row Postgres finds is by construction this user's.
 * `set` names only `goalWeightKg`, so a profile that one day carries a height
 * keeps it when the goal changes.
 *
 * The id is used once, on the insert that creates the row, and discarded by
 * every later `PUT` — the conflict path updates the existing row in place.
 */
export async function writeProfile(scope: UserScope, input: WriteProfile): Promise<Profile> {
  const rows = await upsertOwned(
    scope,
    profiles,
    { id: randomUUID(), goalWeightKg: input.goalWeightKg },
    {
      target: [profiles.userId],
      set: { goalWeightKg: input.goalWeightKg },
    },
  )

  // Unreachable through a correct conflict target — see `upsertOwned`. Thrown
  // rather than answered, because it can only be a bug in this file, and a 200
  // carrying a value nothing stored would tell the client its goal was saved.
  // No value in the message: it reaches `app.onError` and the server log.
  const row = rows[0]
  if (!row) throw new Error("PUT /profile: the upsert returned no row")

  return { goalWeightKg: row.goalWeightKg ?? null }
}

/**
 * Whether this user agreed to AI features (plan.md, Phase 9, Q15). No profile
 * row is the ordinary state for a new user, and it reads as no consent.
 */
export async function readAiConsent(scope: UserScope): Promise<AiConsent> {
  const rows = await selectOwned(scope, profiles, { limit: 1 })
  return { consentedAt: rows[0]?.aiConsentAt?.toISOString() ?? null }
}

/**
 * Grant or withdraw AI consent. Granting stamps the moment, an instant rather
 * than a logging day; withdrawing writes null. The same upsert on `user_id` as `writeProfile`, and
 * `set` names only this column, so the goal weight is untouched.
 */
export async function writeAiConsent(scope: UserScope, granted: boolean): Promise<AiConsent> {
  const value = granted ? new Date() : null
  const rows = await upsertOwned(
    scope,
    profiles,
    { id: randomUUID(), aiConsentAt: value },
    { target: [profiles.userId], set: { aiConsentAt: value } },
  )

  // Unreachable through a correct conflict target, as in `writeProfile`.
  const row = rows[0]
  if (!row) throw new Error("AI consent: the upsert returned no row")

  return { consentedAt: row.aiConsentAt?.toISOString() ?? null }
}
