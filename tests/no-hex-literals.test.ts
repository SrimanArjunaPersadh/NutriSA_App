import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, posix, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * No hex literal may appear anywhere under `src/`.
 *
 * The rule this enforces is plan.md's "colour is semantic, never decoration":
 * a colour typed into a component is a colour nobody can find later, and the
 * repo snapshot found nine of them that were never in any table. Colours now
 * come from `src/design/tokens.ts` (values) or a Tailwind class (classNames),
 * both of which are checked against each other by `tokens.test.ts`.
 *
 * Two exemptions, and only two:
 *
 * - `src/design/tokens.ts` is the palette. It is where the hexes live.
 * - `src/components/icons/BrandIcons.tsx` carries Google's four-colour "G" and
 *   the Apple mark. Those are third-party brand assets with fixed, specified
 *   colours; tokenising them would invite someone to theme a trademark.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

const EXEMPT = new Set(["src/design/tokens.ts", "src/components/icons/BrandIcons.tsx"])

/** Matches #RRGGBB. Word-bounded so an 8-digit value still trips it. */
const HEX = /#[0-9a-fA-F]{6}/g

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

/** Repo-relative, forward slashes, so the messages read the same on any OS. */
function repoPath(absolute: string): string {
  return relative(join(HERE, ".."), absolute).split(sep).join(posix.sep)
}

describe("no hex literals under src/", () => {
  const files = sourceFiles(SRC).filter((file) => !EXEMPT.has(repoPath(file)))

  it("finds source files to check", () => {
    // Guards against the walker silently returning nothing and the suite
    // passing because it checked zero files.
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files.map((file) => [repoPath(file), file]))("%s", (_name, file) => {
    const offences: string[] = []

    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const match of line.matchAll(HEX)) {
          offences.push(`${repoPath(file)}:${index + 1} — ${match[0]}`)
        }
      })

    expect(
      offences,
      `hex literal(s) found. Import from src/design/tokens.ts or use a Tailwind class:\n${offences.join("\n")}`,
    ).toEqual([])
  })
})
