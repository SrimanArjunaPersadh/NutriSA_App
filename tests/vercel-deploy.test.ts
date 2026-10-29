import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * The two things the Vercel deploy rests on, enforced as tests.
 *
 * **What leaves this machine.** `vercel deploy` uploads the project folder and
 * does not read `.gitignore`. `.vercelignore` is therefore the only thing
 * between a deploy and an upload of `.env`, the Expo dev log (which holds the
 * `.env` values in plain text) and `/data/`, the export of real weight and meal
 * history. It is an allowlist so that forgetting an entry fails closed; this
 * test keeps it one, and keeps those paths off it.
 *
 * **No listener in the deployed module.** Vercel serves `server/app.ts`'s
 * default export. A `serve()` there would bind a port inside every function.
 *
 * A static check over source text, like its neighbours.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

function rules(): string[] {
  return read(".vercelignore")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
}

describe(".vercelignore", () => {
  it("ignores everything at the root first", () => {
    expect(rules()[0]).toBe("/*")
  })

  /** The one re-ignore allowed after the wildcard: env files nested in an allowed folder. */
  const REIGNORES = ["**/.env*"]

  it("only re-allows after the wildcard, apart from the nested env re-ignore", () => {
    const rest = rules().slice(1).filter((rule) => !REIGNORES.includes(rule))
    expect(rest.every((rule) => rule.startsWith("!"))).toBe(true)
  })

  it("re-ignores env files nested inside the allowed folders", () => {
    expect(rules()).toContain("**/.env*")
  })

  it.each([".env", ".expo", "data", ".scratch", "research designs", "android", "ios"])(
    "does not allow %s",
    (path) => {
      const allowed = rules()
        .slice(1)
        .filter((rule) => rule.startsWith("!"))
        .map((rule) => rule.slice(1).replace(/^\//, "").replace(/\/$/, ""))
      expect(allowed.some((rule) => rule === path || rule.startsWith(path))).toBe(false)
    },
  )

  it("allows what the server build reads", () => {
    for (const path of ["server", "packages", "package.json", "package-lock.json", "tsconfig.json"]) {
      expect(rules()).toContain(`!${path}`)
    }
  })
})

describe("server/app.ts", () => {
  const source = read("server/app.ts")

  it("never starts a listener", () => {
    expect(source).not.toMatch(/@hono\/node-server/)
  })

  it("exports the app as its default, which is what the Hono preset serves", () => {
    expect(source).toMatch(/^export default app;?$/m)
  })
})

describe("vercel.json", () => {
  const config = JSON.parse(read("vercel.json"))

  it("pins the Hono preset, so Vercel never falls back to serving the repo as static files", () => {
    expect(config.framework).toBe("hono")
  })

  it("serves the bundle that build:server writes", () => {
    const script: string = JSON.parse(read("package.json")).scripts["build:server"]
    expect(script).toContain("server/app.ts")
    expect(script).toContain(`--outfile=${config.outputDirectory}/index.mjs`)
  })

  it("runs beside the database (Neon us-east-2 is Vercel's cle1)", () => {
    expect(config.regions).toEqual(["cle1"])
  })
})
