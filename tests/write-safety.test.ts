import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, posix, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * The rule that makes the write routes safe to retry, enforced as a test.
 *
 * `server/db/retry.ts` states it in prose, twice, and plan.md states it a third
 * time:
 *
 * > ⚠️ **The Phase 2 write routes must not simply reuse this** — their safety
 * > comes from the client-minted UUIDv7 and `ON CONFLICT DO NOTHING`, not from
 * > a retry wrapper.
 *
 * Prose is not a guard. The failure it warns about is silent and expensive: a
 * `POST /meal-logs` that succeeded and then lost its response would, if
 * retried server-side, insert the meal a second time under a second id — and
 * `ON CONFLICT (id)` would not catch it, because the id is the same on both
 * attempts only when the **client** is the one retrying. The day's totals would
 * be quietly wrong, and the row that proves it looks exactly like a real meal.
 *
 * A static check over source text, like its neighbours in this directory. It
 * cannot prove the writes are correct; it proves nobody has wrapped them in the
 * one thing that would make them incorrect.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = join(HERE, "..", "server")

function serverFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...serverFiles(full))
    else if (entry.name.endsWith(".ts")) found.push(full)
  }
  return found
}

function repoPath(absolute: string): string {
  return relative(join(HERE, ".."), absolute).split(sep).join(posix.sep)
}

/** Same heuristic as `scoped-access.test.ts` — these files argue in prose. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const files = serverFiles(SERVER).map((file) => [repoPath(file), file] as const)

describe("no write is wrapped in a retry", () => {
  /**
   * The mutating Drizzle verbs. `db.insert`, `db.delete` and `db.update` reach
   * Postgres only from `server/data/scoped.ts` — the other guard proves that —
   * so that is the file this really watches, and the check runs over all of
   * them so it keeps working if that ever changes.
   */
  const MUTATION = /\bdb\s*\.\s*(?:insert|update|delete)\s*\(/

  /**
   * Checked per function, not per file, because `scoped.ts` legitimately holds
   * both halves: `selectOwned` retries and is right to — replaying a `SELECT`
   * cannot change anything — while `insertOwned` two functions below must
   * never. A file-level check reads that correct file as a violation, and a
   * guard that cries wolf on the one file it exists to watch gets deleted.
   */
  function functionBlocks(source: string): { name: string; body: string }[] {
    const starts = [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
    return starts.map((match, index) => ({
      name: match[1]!,
      body: source.slice(match.index, starts[index + 1]?.index),
    }))
  }

  it("finds the server's source files", () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)("%s", (name, file) => {
    const source = withoutComments(readFileSync(file, "utf8"))
    if (!MUTATION.test(source)) return

    const offenders = functionBlocks(source)
      .filter((fn) => MUTATION.test(fn.body) && /\bwithRetry\s*\(/.test(fn.body))
      .map((fn) => fn.name)

    expect(
      offenders,
      `${name}: ${offenders.join(", ")} both mutates the database and calls withRetry. ` +
        `A retried write whose first attempt succeeded before the response was lost ` +
        `writes the row twice. Idempotency on this API comes from the client-minted ` +
        `UUIDv7 and ON CONFLICT, never from a retry — see server/db/retry.ts.`,
    ).toEqual([])
  })
})

describe("the write helpers stamp user_id from the scope", () => {
  const scoped = readFileSync(join(SERVER, "data", "scoped.ts"), "utf8")
  const body = withoutComments(scoped)

  /**
   * Every `.values(...)` in the scoped layer spreads the caller's fields and
   * then sets `userId` from the scope. Written in that order deliberately: a
   * `userId` smuggled into `values` is overwritten rather than honoured, so the
   * type that forbids it (`Omit<…, "userId">`) is belt and the order is braces.
   */
  it.each(["insertOwned", "upsertOwned"])("%s sets userId from the scope", (helper) => {
    const start = body.indexOf(`export async function ${helper}`)
    expect(start, `${helper} is gone from scoped.ts — has the write path moved?`).toBeGreaterThan(-1)

    const nextExport = body.indexOf("export ", start + 10)
    const fn = body.slice(start, nextExport === -1 ? undefined : nextExport)

    expect(
      /userId:\s*scope\.userId/.test(fn),
      `${helper} must set userId from the UserScope. A row's owner is not ` +
        `something a caller may pass in — that is the same rule as the WHERE clause ` +
        `on every read, applied to the write side.`,
    ).toBe(true)
  })

  it("applies the ownership filter to deletes", () => {
    const start = body.indexOf("export async function deleteOwned")
    const fn = body.slice(start)
    expect(
      /db\s*\.\s*delete\([^)]*\)\s*\.\s*where\(\s*ownedBy\(/.test(fn),
      "deleteOwned must filter by ownedBy(scope, …). A DELETE that loses its WHERE " +
        "does not return the wrong rows — it destroys everybody's.",
    ).toBe(true)
  })
})
