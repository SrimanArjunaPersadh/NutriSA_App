import { randomUUID } from "node:crypto"

import type { Profile, WriteProfile } from "@shared"

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
