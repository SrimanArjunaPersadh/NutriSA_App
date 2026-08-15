import { fileURLToPath } from "node:url"

import { config } from "dotenv"
import { defineConfig } from "vitest/config"

config({ path: ".env" })

const resolvePath = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))

/**
 * The security suite — separate from `npm test` because it needs a database.
 *
 *     npm run test:security
 *
 * ## Why it is not in the default run
 *
 * Everything in the default suite is pure: the engine has no dependencies and
 * the `tests/` guards read files as text. Nothing there can fail because a
 * network was down, which is what makes a red run mean something. These tests
 * talk to real Postgres on purpose — plan.md is explicit that the scope layer
 * is proven "Neon branch, real Postgres — not mocks", because a mocked query
 * layer proves the mock filters by user_id and nothing about Postgres.
 *
 * ## Point it at a branch, never at the real database
 *
 * `TEST_DATABASE_URL` must be a Neon **branch**. These tests create users, write
 * rows for them and delete them again. Run that against the main database and a
 * crashed run leaves debris beside 38 rows of irreplaceable history.
 *
 * Create one in the Neon console (Branches → New branch, from `main`) and put
 * its pooled connection string in `.env` as `TEST_DATABASE_URL`.
 *
 * The value is mapped onto `DATABASE_URL` below because `server/env.ts` reads
 * that name at import time, so the server code under test connects to the
 * branch without knowing it is being tested — which is the point. It is mapped
 * here rather than exported into the shell so that an ordinary `npm test` can
 * never inherit it.
 */
export default defineConfig({
  /**
   * The `@engine` and `@shared` aliases, restated.
   *
   * Vitest resolves through Vite, which does not read `tsconfig.json` paths —
   * `tsc` and `tsx` do, which is why the server runs and typechecks without
   * this and would still fail here on the first `import from "@engine"`. The
   * default suite never noticed because the engine imports nothing but itself,
   * by design and by test. This suite pulls in the whole server.
   *
   * Kept in step with `tsconfig.json` by hand. Adding another alias means
   * adding it in both places.
   */
  resolve: {
    alias: {
      "@engine": resolvePath("./packages/engine/src/index.ts"),
      "@shared": resolvePath("./packages/shared/src/index.ts"),
    },
  },
  test: {
    include: ["tests/security/**/*.test.ts"],
    environment: "node",
    // One connection, one set of fixture rows, no two files racing to create
    // and delete the same users.
    fileParallelism: false,
    /**
     * Well above vitest's 5s default, because these tests wait on a real
     * network and a database that sleeps.
     *
     * Neon's free tier suspends when idle and can take tens of seconds to wake,
     * and `server/db/retry.ts` adds up to 2.8s of backoff on top when a
     * connection drops. At 5s a cold start fails as "Test timed out", which
     * reads as a broken test rather than a napping database — and the fix
     * people reach for then is to weaken the test.
     *
     * The two numbers differ on purpose. `beforeAll` does the whole fixture
     * insert, so it is the call that meets the cold start head-on and is given
     * room for the ~90s wake this project's server README records. Everything
     * after it runs against a warm database and needs no such allowance — 30s
     * still catches a genuine hang instead of sitting on it for two minutes.
     */
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    },
  },
})
