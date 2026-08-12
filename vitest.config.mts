import { defineConfig } from "vitest/config"

/**
 * Two suites, both plain Node.
 *
 * `packages/**` is the engine — pure TypeScript with zero runtime dependencies,
 * which is the whole point of it living outside `src/`: no React Native
 * transform, no jsdom, no network. The engine is the one thing that can break
 * silently, because a wrong trend does not throw, it just shows a number that
 * is a lie. Everything visual is caught by eye on the first screen open.
 *
 * `tests/**` is the repo's own hygiene, added on chore/tokens-and-doc-hygiene.
 * These are not unit tests of app code — they still do not render a component,
 * and no React Native transform is involved. They read files as text and assert
 * invariants that previously lived only in prose:
 *
 * - `tokens.test.ts` — tailwind.config.js and src/design/tokens.ts agree
 * - `no-hex-literals.test.ts` — no hex typed into a component
 * - `engine-purity.test.ts` — the engine imports nothing but itself
 *
 * Rules in an instructions file get violated by the next person in a hurry.
 * Rules with a failing test do not.
 */
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
})
