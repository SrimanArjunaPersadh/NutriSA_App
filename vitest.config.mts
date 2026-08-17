import { fileURLToPath } from "node:url"

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
 * - `scoped-access.test.ts` — only the scoped layer reaches the db, no route
 *   reads a user id from client input, data functions require a `UserScope`
 *
 * Rules in an instructions file get violated by the next person in a hurry.
 * Rules with a failing test do not.
 *
 * `format.test.ts` is the one exception to "not unit tests of app code". The
 * thousands separator in `src/lib/format.ts` is a hand-written loop over digit
 * positions, which is the kind of thing that is wrong for four-digit numbers
 * and right for every example anyone tried by hand. It needs no React Native
 * transform — numbers in, strings out — so it runs here rather than justifying
 * a second suite.
 */
export default defineConfig({
  /**
   * The `@engine` and `@shared` aliases.
   *
   * Vitest resolves through Vite, which does not read `tsconfig.json` paths —
   * `tsc` and `tsx` do, which is why the server runs and typechecks without
   * this. The default suite never needed it while `packages/engine/` was the
   * only thing under test: the engine imports nothing but itself, by design and
   * by `engine-purity.test.ts`. `packages/shared/` is not pure — it validates
   * days through the engine's `isLogDay`, on purpose, so that there is one
   * opinion about what a calendar day is — and its tests need this to resolve.
   *
   * `@shared` arrived with `column-widths.test.ts`, which asks the write
   * schemas about a boundary and the Drizzle column about the same boundary.
   *
   * Kept in step with `tsconfig.json` and `vitest.security.config.mts` by hand.
   * Adding another alias means adding it in all three.
   */
  resolve: {
    alias: {
      "@engine": fileURLToPath(new URL("./packages/engine/src/index.ts", import.meta.url)),
      "@shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    /**
     * `tests/security/` needs a real Postgres branch and runs from
     * `vitest.security.config.mts` via `npm run test:security`. It is excluded
     * here so that the default gate stays pure and offline: a suite that can go
     * red because a network blipped is a suite people learn to re-run instead
     * of read.
     */
    exclude: ["**/node_modules/**", "tests/security/**"],
    environment: "node",
  },
})
