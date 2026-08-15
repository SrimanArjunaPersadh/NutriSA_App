import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, posix, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * The two structural rules behind the API's user isolation, enforced as tests.
 *
 * plan.md, branch `api-scope-and-reads`:
 *
 * > - Scoped query layer — data functions **cannot be called** without a `UserScope`
 * > - Confirm no route reads `user_id` from a body, param, or header
 *
 * Both were checkboxes somebody ticks after reading the diff. A checkbox is
 * true on the day it is ticked; a test is true on the day someone adds a
 * seventh route in a hurry. This file is the same idea as
 * `engine-purity.test.ts` — the rule that only holds by convention is the rule
 * that eventually does not hold.
 *
 * These are static checks over source text. They cannot prove the queries are
 * right, only that nothing has routed around the layer that makes them right.
 * The proof lives in `tests/security/`, against real Postgres.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = join(HERE, "..", "server")

/**
 * The one module allowed to import the database handle. Everything else in
 * `server/` reaches Postgres through the helpers it exports, which apply the
 * ownership filter themselves.
 *
 * `db/index.ts` is the handle itself. `inngest/functions.ts` is the deliberate
 * exception and it is not a hole: it runs from a Svix-verified Clerk webhook,
 * not from a user request, and its whole job is writing the `users` mirror row
 * that every `UserScope` is later checked against. There is no session there to
 * scope to — the user may not exist yet.
 */
const MAY_IMPORT_DB = new Set([
  "server/data/scoped.ts",
  "server/db/index.ts",
  "server/inngest/functions.ts",
])

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

/**
 * Source with its comments removed.
 *
 * These files argue for their own rules in prose, and the prose quotes the very
 * code it is forbidding — `user-scope.ts` explains the brand symbol by showing
 * `{ userId: req.body.userId } as UserScope` and noting that it does not
 * compile. Matching raw text flags that docblock, which would leave two bad
 * options: delete the clearest explanation of the rule, or add an exemption
 * that also stops the file being checked for real.
 *
 * Deliberately a heuristic, not a parser. `//` is ignored when preceded by `:`
 * so URLs in strings survive; a `//` inside some other string literal would
 * still take the rest of that line. For a smoke alarm over first-party source
 * that is the right trade — the cost of being slightly over-eager is a missed
 * match in a string, and none of the patterns below would ever legitimately
 * live in one.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const files = serverFiles(SERVER).map((file) => [repoPath(file), file] as const)

describe("the database handle is reached only through the scoped layer", () => {
  it("finds the server's source files", () => {
    expect(files.length).toBeGreaterThan(5)
  })

  /** `from "../db"`, `from "./db"`, `from "../../db/index"` — any road to it. */
  const DB_IMPORT = /\bfrom\s*["'](?:\.{1,2}\/)+db(?:\/index)?["']/

  it.each(files)("%s", (name, file) => {
    if (MAY_IMPORT_DB.has(name)) return

    const source = withoutComments(readFileSync(file, "utf8"))
    expect(
      DB_IMPORT.test(source),
      `${name} imports the db handle directly. Every user-scoped read goes through ` +
        `server/data/scoped.ts, which applies the user_id filter itself — a raw query ` +
        `here would return every user's rows and would not fail while doing it.`,
    ).toBe(false)
  })
})

describe("no route takes user_id from the client", () => {
  /**
   * Client-controlled inputs being read into something that looks like a user
   * id. The id may only ever come from `getScope(c)`, which reads it off a
   * verified Clerk token.
   *
   * Matched loosely on purpose — this is a smoke alarm, not a type system. If
   * it fires on something innocent, that line is still worth a second look.
   */
  const SUSPECT = [
    /\breq\.param\(\s*["'][^"']*user_?[iI]d[^"']*["']\s*\)/,
    /\breq\.query\(\s*["'][^"']*user_?[iI]d[^"']*["']\s*\)/,
    /\breq\.header\(\s*["'][^"']*user_?[iI]d[^"']*["']\s*\)/,
    /\bbody\s*\.\s*user_?[iI]d\b/,
    /\bbody\s*\[\s*["']user_?[iI]d["']\s*\]/,
  ]

  it.each(files)("%s", (name, file) => {
    // The webhook's payload legitimately carries a Clerk user id: it is the
    // event's subject, verified by Svix signature, and it is what the mirror
    // row is keyed on. It is not a session, and it scopes nothing.
    if (name === "server/index.ts" || name.startsWith("server/inngest/")) return

    const source = withoutComments(readFileSync(file, "utf8"))
    const offences = SUSPECT.filter((pattern) => pattern.test(source)).map(String)

    expect(
      offences,
      `${name} appears to read a user id from client input:\n${offences.join("\n")}\n` +
        `The only permitted source is getScope(c), which derives it from a verified ` +
        `Clerk session token.`,
    ).toEqual([])
  })
})

describe("data functions require a UserScope", () => {
  const DATA_DIR = join(SERVER, "data")
  const dataFiles = serverFiles(DATA_DIR)
    .filter((file) => !file.endsWith("scoped.ts"))
    .map((file) => [repoPath(file), file] as const)

  it("finds the data layer", () => {
    expect(dataFiles.length).toBeGreaterThan(0)
  })

  /**
   * Every exported function in `server/data/` takes `scope: UserScope` first.
   *
   * First, not merely somewhere in the list: a scope that can be omitted is a
   * scope that will be, and putting it in the leading position means a call
   * site without one does not compile rather than silently defaulting.
   */
  it.each(dataFiles)("%s", (name, file) => {
    const source = withoutComments(readFileSync(file, "utf8"))
    const exported = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)/g)]

    expect(exported.length, `${name} exports no functions — is it still a data module?`).toBeGreaterThan(0)

    for (const [, fnName, params] of exported) {
      expect(
        params!.trimStart().startsWith("scope: UserScope"),
        `${name}: ${fnName}() must take \`scope: UserScope\` as its first parameter. ` +
          `That is what makes a verified session a precondition of reading anything.`,
      ).toBe(true)
    }
  })
})
