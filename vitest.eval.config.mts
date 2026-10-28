import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * The assistant's pre-merge eval (plan.md, Phase 9, Q21 and Q31), against the
 * **real** Anthropic API. It spends money, so it never runs with `npx vitest`:
 * its files end in `.eval.ts`, which the main config does not include. Run it
 * with `npx vitest run --config vitest.eval.config.mts`, and only with
 * Sriman's OK.
 *
 * The database reads are faked inside the eval, so it needs no Neon branch and
 * sends no real user's data to the model.
 */

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@engine": resolvePath("./packages/engine/src/index.ts"),
      "@shared": resolvePath("./packages/shared/src/index.ts"),
      "@": resolvePath("./src"),
    },
  },
  test: {
    include: ["tests/eval/**/*.eval.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30 * 60_000,
  },
})
