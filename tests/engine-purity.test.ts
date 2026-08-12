import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, posix, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * `packages/engine/` imports nothing but itself.
 *
 * AGENTS.md: "Do not add a runtime dependency to `packages/engine/`. It stays
 * pure TypeScript so it can be tested in isolation and shared by both sides."
 * Until now that rule lived only in prose, and the directory has no
 * `package.json` to pin it — it is resolved through the `@engine` alias, so
 * nothing mechanically stopped a `date-fns` import landing in `time.ts` and
 * following the engine into both the server and the Metro bundle.
 *
 * Every specifier in a shipped engine file must therefore be relative. A bare
 * specifier is a dependency, whether or not it is in package.json.
 *
 * `*.test.ts` is excluded: the tests import `vitest`, which is a devDependency
 * that never reaches a bundle. The rule is about what ships, not what proves it.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ENGINE = join(HERE, "..", "packages", "engine", "src")

/**
 * `from "x"`, side-effect `import "x"`, and `import("x")`. Covers `export …
 * from` too, since that ends in the same `from "…"`.
 */
const SPECIFIERS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']/g,
]

function engineFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...engineFiles(full))
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      found.push(full)
    }
  }
  return found
}

function repoPath(absolute: string): string {
  return relative(join(HERE, ".."), absolute).split(sep).join(posix.sep)
}

describe("engine purity", () => {
  const files = engineFiles(ENGINE)

  it("finds the engine's shipped source files", () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files.map((file) => [repoPath(file), file]))("%s", (_name, file) => {
    const source = readFileSync(file, "utf8")
    const offences: string[] = []

    for (const pattern of SPECIFIERS) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]!
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
          offences.push(`${repoPath(file)} imports "${specifier}"`)
        }
      }
    }

    expect(
      offences,
      `packages/engine/ must import nothing but itself — every specifier has to be relative:\n${offences.join("\n")}`,
    ).toEqual([])
  })
})
