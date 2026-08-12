import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

import { colors } from "../src/design/tokens"

/**
 * The palette lives in two files and must never drift.
 *
 * `src/design/tokens.ts` serves the contexts a className cannot reach —
 * `contentStyle`, `NativeTabs` props, SVG `fill`/`stroke`. `tailwind.config.js`
 * serves every className site. Neither can import the other: the Tailwind config
 * is CommonJS `.js` loaded by the Metro/NativeWind pipeline and cannot require a
 * `.ts` module, and making it `.ts` would drag the whole build config into the
 * TypeScript pipeline for one object.
 *
 * So they are two hand-maintained copies, and this test is what makes that
 * safe. It runs both directions on purpose — a one-way check passes happily
 * while one file quietly grows a colour the other has never heard of.
 */

const require = createRequire(import.meta.url)

type TailwindConfig = {
  theme: { extend: { colors: Record<string, string> } }
}

const tailwindColors = (require("../tailwind.config.js") as TailwindConfig).theme.extend
  .colors

describe("colour tokens", () => {
  it("defines at least the fixed table plus the promoted neutrals", () => {
    // A floor, not an exact count — adding a token should not fail this test,
    // only forgetting to add it to both files should.
    expect(Object.keys(colors).length).toBeGreaterThanOrEqual(18)
  })

  it.each(Object.keys(colors))("tokens.ts %s is in tailwind.config.js", (token) => {
    const mine = colors[token as keyof typeof colors]
    const theirs = tailwindColors[token]

    expect(
      theirs,
      `"${token}" is in src/design/tokens.ts but missing from tailwind.config.js`,
    ).toBeDefined()

    expect(
      theirs,
      `"${token}" disagrees: tokens.ts has ${mine}, tailwind.config.js has ${theirs}`,
    ).toBe(mine)
  })

  it.each(Object.keys(tailwindColors))(
    "tailwind.config.js %s is in tokens.ts",
    (token) => {
      const theirs = tailwindColors[token]
      const mine = (colors as Record<string, string>)[token]

      expect(
        mine,
        `"${token}" is in tailwind.config.js but missing from src/design/tokens.ts`,
      ).toBeDefined()

      expect(
        mine,
        `"${token}" disagrees: tailwind.config.js has ${theirs}, tokens.ts has ${mine}`,
      ).toBe(theirs)
    },
  )

  it("has no colour that is not a 6-digit hex", () => {
    for (const [token, value] of Object.entries(colors)) {
      expect(value, `"${token}" is not a 6-digit hex: ${value}`).toMatch(
        /^#[0-9A-F]{6}$/,
      )
    }
  })
})
