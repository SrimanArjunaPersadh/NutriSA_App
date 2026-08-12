import { defineConfig } from "vitest/config"

/**
 * The engine suite only. `packages/engine/` is pure TypeScript with zero runtime
 * dependencies, which is the whole point of it living outside `src/` — it runs
 * under plain Node with no React Native transform, no jsdom and no network.
 *
 * Nothing under `src/` or `server/` is included on purpose. The engine is the
 * one thing that can break silently: a wrong trend does not throw, it just
 * shows a number that is a lie. Everything visual is caught by eye on the first
 * screen open, so the testing weight sits here.
 */
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    environment: "node",
  },
})
