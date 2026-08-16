import { asc } from "drizzle-orm"

import { currentLoggingDay, resolveTargetForDate, type LogDay, type TargetRow } from "@engine"
import {
  fromMacros,
  toMacros,
  type TargetRowResponse,
  type TargetsResponse,
  type TargetsWriteResult,
  type WriteTargets,
} from "@shared"

import type { UserScope } from "../auth/user-scope"
import { isUniqueViolation } from "../db/errors"
import { targets } from "../db/schema"
import { selectOwned, upsertOwned, type WriteOutcome } from "./scoped"

/**
 * The macro targets surface — the one thing on the dashboard the user sets
 * rather than records.
 *
 * ## Effective dating, and why editing never rewrites history
 *
 * A row says what the targets *became* on `valid_from` and holds until a later
 * row supersedes it. There is no `valid_to`: two columns describing one
 * boundary can disagree, and the day they do, a stretch of history resolves to
 * two targets or to none. `packages/engine/src/targets.ts` owns that reasoning
 * and the resolution itself — nothing here picks a row by hand.
 *
 * The consequence worth stating out loud: changing your targets today leaves
 * every past day resolving to what you were actually working to at the time. A
 * day in March keeps March's targets after a change in May, so its "remaining"
 * is still a true statement about that day.
 */

function toResponseRow(row: typeof targets.$inferSelect): TargetRowResponse {
  return {
    id: row.id,
    validFrom: row.validFrom,
    macros: toMacros(row),
  }
}

/**
 * `GET /targets` — everything the user has ever set, and what is in force now.
 *
 * `current` is resolved against **today**, by the engine, over every row
 * including any dated ahead. Taking the newest row instead would apply a future
 * target early, which is the one mistake effective dating exists to prevent.
 */
export async function readTargets(scope: UserScope): Promise<TargetsResponse> {
  const rows = await selectOwned(scope, targets, { orderBy: asc(targets.validFrom) })
  const history = rows.map(toResponseRow)

  const resolved: TargetRow | null = resolveTargetForDate(
    rows.map((row) => ({ validFrom: row.validFrom, ...toMacros(row) })),
    currentLoggingDay(),
  )

  return {
    current: resolved
      ? // Matched by `validFrom`, which is unique per user — the index in
        // schema.ts exists precisely so this cannot be ambiguous.
        (history.find((row) => row.validFrom === resolved.validFrom) ?? null)
      : null,
    history,
  }
}

/**
 * `POST /targets` — set the targets taking effect on a day.
 *
 * Posting twice for the same `validFrom` updates that row rather than failing.
 * It is the same edit arriving twice, and the alternative — a second row for
 * the same day — is barred by `UNIQUE (user_id, valid_from)` for a good reason:
 * with two, "the greatest valid_from at or before this day" stops naming one
 * answer.
 *
 * `replaced` means a row already existed for that day and now holds these
 * numbers. See `writeWeightLog`, which defines it the same way and explains why
 * a retry correctly reports `false`.
 */
export async function writeTargets(
  scope: UserScope,
  validFrom: LogDay,
  input: WriteTargets,
): Promise<WriteOutcome<TargetsWriteResult>> {
  const macros = fromMacros(input.macros)

  let rows
  try {
    rows = await upsertOwned(
      scope,
      targets,
      { id: input.id, validFrom, ...macros },
      {
        target: [targets.userId, targets.validFrom],
        set: macros,
      },
    )
  } catch (error) {
    // The same id sent for a different `validFrom`: a primary-key clash, which
    // the conflict target above does not cover. See `writeWeightLog`.
    if (isUniqueViolation(error)) return { ok: false, reason: "id-taken" }
    throw error
  }

  const row = rows[0]
  if (!row) return { ok: false, reason: "id-taken" }

  return {
    ok: true,
    value: {
      id: row.id,
      validFrom: row.validFrom,
      macros: toMacros(row),
      replaced: row.id !== input.id,
    },
  }
}
