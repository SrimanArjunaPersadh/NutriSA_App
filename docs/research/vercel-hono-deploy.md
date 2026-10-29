# Deploying the Hono API (`server/`) to Vercel

> **Superseded in two places by what shipped (`vercel-deploy`, 2026-10-29).** The API is
> deployed (`https://nutrisa-api.vercel.app`), so "nothing was linked, deployed or
> installed" below describes the research, not the repo. And the `.vercelignore` sketched
> under "Recommended shape" is a **denylist that misses `/data/`**: the shipped file is an
> allowlist, guarded by `tests/vercel-deploy.test.ts`. Do not copy the sketch. Unverified
> item 1 there was settled by the first remote build: the Hono preset found
> `dist-server/index.mjs`. The rest stands as research; `plan.md` (Phase 2) is the record.

Researched 2026-10-29, read-only. Nothing was linked, deployed or installed.

## Versions this applies to

| Package | Range in `package.json` | Installed (`node_modules/<pkg>/package.json`) | `"type"` |
|---|---|---|---|
| hono | `^4.13.1` | **4.13.1** | module (dual: `import` + `require` exports) |
| @hono/node-server | `^2.1.0` | **2.1.0** | module (dual) |
| inngest | `^4.18.0` | **4.18.0** | module (dual) |
| @sentry/node | `^10.70.0` | **10.70.0** (its nested `@sentry/core` is 10.70.0) | none (dual) |
| @neondatabase/serverless | `^1.1.0` | **1.1.0** | none (dual: `require` ./index.js, `import` ./index.mjs) |
| drizzle-orm | `^0.45.2` | **0.45.2** | module (dual) |
| typescript | `~6.0.3` (dev) | **6.0.3** | n/a |
| dotenv | `^17.4.2` (**dev**Dependency) | **17.4.2** | none (CJS) |
| @clerk/backend | `^3.16.1` | **3.16.1** | none (dual) |
| esbuild | not declared | **0.25.12** hoisted at top level (transitive, from drizzle-kit) | n/a |
| Vercel CLI (global) | n/a | **54.17.3** (`%APPDATA%\npm\node_modules\vercel`) | n/a |
| Builders bundled in that CLI | n/a | `@vercel/hono` **0.2.100**, `@vercel/node` **5.8.21**, `@vercel/backends` **0.8.18**, `@vercel/nft` **1.10.0** | n/a |
| `@vercel/functions` | **not installed** | n/a | n/a |

Expo is SDK **58** (`expo ~58.0.19`, React Native 0.88.0). The `versioned-research`
skill text still says `v54.0.0` (`.claude/skills/versioned-research/SKILL.md:18,32`); that
is stale and was ignored. Nothing in this research touches Expo code.

Root tsconfig: `tsconfig.json` extends `expo/tsconfig.base`, which sets `"module": "preserve"`,
`"moduleResolution": "bundler"`, `"customConditions": ["react-native"]`, `"noEmit": true`
(`node_modules/expo/tsconfig.base.json`). **verified**

**Caveat on builder versions.** Builder behaviour below was read from the builders bundled
inside the local CLI 54.17.3. A Git-triggered or `vercel deploy` build runs on Vercel's build
image, which may use newer builders. Treat "verified (CLI-bundled builder)" as "verified for
that version"; confirm on the first real build log. **inferred** (from how the CLI vendors
builders under `vercel/node_modules/@vercel/*`)

---

## Contradictions with AGENTS.md / plan.md / code comments

1. **plan.md:2008 "one turn ≤ 45 s (Vercel's ceiling is 60)" is out of date.** With Fluid
   compute (on by default for projects created after 2025-04-23), Hobby's default *and*
   maximum duration is **300 s**; Pro is 300 s default / 800 s max.
   Source: https://vercel.com/docs/functions/limitations#max-duration ,
   https://vercel.com/docs/fluid-compute#default-settings-by-plan . **verified**.
   60 s was the old non-Fluid Hobby ceiling (the duration page links a changelog titled
   "Vercel Functions for Hobby can now run up to 60 seconds"). **inferred**. The 45 s turn
   limit still fits; only the stated reason is wrong.

2. **`server/inngest/client.ts:40-42` says "With no INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY
   set, the SDK talks to the local Inngest dev server".** In inngest 4.18.0 the default mode
   is **cloud**. Dev mode comes only from `isDev: true` or `INNGEST_DEV`
   (`node_modules/inngest/components/Inngest.js:309-314`). Locally it works because
   `.env.example:50` sets `INNGEST_DEV` to a URL. **verified**. On Vercel, `INNGEST_DEV` must
   be **absent**, because any value (a boolean or a URL) puts the SDK in dev mode.

3. **AGENTS.md "Secrets ... are never committed" holds for Git deploys but not for CLI
   uploads.** The CLI's default upload ignore list includes `.env.local` and `.env.*.local`
   but **not `.env`**, and it does not read `.gitignore`. It reads only `.vercelignore` /
   `.nowignore` (`vercel/dist/chunks/chunk-BHMMV3HE.js:45919-45960`). **verified**. So
   `vercel deploy` from this folder would upload `.env`, and `.expo/` too, which holds
   plaintext secrets in `.expo/dev/logs/` (see memory note "Expo dev log holds secrets").
   That is not a contradiction of the text, but it is a way around it. Fix: add
   `.vercelignore` (see Recommended shape).

4. **plan.md:578-580 and `server/http/limits.ts:37-46` ("each serverless instance gets its
   own copy")** are right, but under Fluid compute the picture is wider: one instance serves
   **many concurrent requests**, and they share the Maps. See Q7. Refinement, not a
   contradiction.

---

## Q1. Zero-config Hono detection vs `api/`; which fits an Expo-root repo

**What zero-config Hono looks for.**
- The entry file must be one of `app`, `index`, `server`, `src/app`, `src/index`, `src/server`,
  with extension `js|cjs|mjs|ts|cts|mts`. The **entry file's own text** must match
  `(?:from|require|import)\s*(?:\(\s*)?["']hono["']`.
  Source: `@vercel/hono/dist/index.js:53-63, 103-150, 184-188`; also
  https://vercel.com/docs/frameworks/backend/hono#exporting-the-hono-application . **verified**
- It wants **`export default app`** (the Hono instance, which has a `fetch` method).
  Sources: https://vercel.com/docs/frameworks/backend/hono and
  https://hono.dev/docs/getting-started/vercel . **verified**. `hono/vercel`'s `handle()` is
  now just `(req) => app.fetch(req)` (`node_modules/hono/dist/adapter/vercel/handler.js`),
  so it is not needed. **verified**
- Framework detection: the `hono` preset needs `hono` in package.json **and** one of those
  root files (`chunk-BHMMV3HE.js:16263-16300`). It has `supersedes: ["node"]` (line 16271),
  and its default routes are `filesystem` then `/(.*) -> /` (one function serves every path).
  **verified**
- If the build sets an **Output Directory**, the Hono builder looks for the entry inside that
  directory, **after** the install and build commands have run (`@vercel/hono/dist/index.js:78-84,
  106-123`). With no output directory it searches the root, then package.json `main` (here
  `expo-router/entry`, which does not import hono), and then fails with "No entrypoint found".
  **verified (CLI-bundled builder)**
- **There is no Expo preset** in CLI 54.17.3's framework list (all slugs listed, none is
  expo; `chunk-BHMMV3HE.js`). **verified**. If `framework` is left unset, nothing here
  matches `hono` or `node` (no root `server.ts`/`index.ts`/`app.ts`, and `src/` holds only
  `app components design lib`), so the project would fall to "Other". With no build and no
  `public/`, "Other" serves the **project root as static files**: the default output
  directory is "`public` or `.` root" (https://vercel.com/docs/project-configuration/vercel-json#outputdirectory).
  **verified** for the default; **inferred** that it would expose source. Always pin
  `"framework": "hono"`.

**`api/` directory.** Each file in root `api/` becomes a function. Vercel recommends one
shared entry (for example `api/index.ts` with `export default { fetch }`) plus rewrites
(https://vercel.com/docs/functions/runtimes/node-js#create-a-node.js-function-in-/api).
**verified**. This uses the same `@vercel/node` compiler as the Hono preset (the Hono
builder calls `@vercel/node`'s `build`, `@vercel/hono/dist/index.js:73-85`), so it has the
same alias and ESM problems (Q2) and adds a rewrite to maintain. **verified** that it is
the same compiler.

**Fit for this repo.** Pin `framework: "hono"` and point the builder at a **pre-bundled**
entry in an output directory (Recommended shape). Do not add a root `index.ts`, `app.ts` or
`server.ts`. `src/index.ts` / `src/app.ts` would sit inside the Expo app's `src/`.
**inferred**

**Keeping local dev.** `server/index.ts` calls `honoServe(...)` at module level
(`server/index.ts:186`). If the Vercel entry imported that module, it would also try to
listen on `PORT` inside the function. **inferred**. Split it:
- `server/app.ts`: everything from `initSentry()` to `app.onError(...)`, then `export default app`.
- `server/index.ts`: `import app from "./app"` and `honoServe({ fetch: app.fetch, port: env.PORT })`.
  `npm run server` (`tsx watch server/index.ts`) does not change.
- Vercel entry: the bundle of `server/app.ts`.

The experimental `@vercel/backends` builder (Q2, option B) **runs the entry module at build
time** to read its routes (`@vercel/backends/dist/introspection/hono.mjs`, which subclasses
`Hono` and dumps `app.routes` on exit, and `dist/index.mjs:1399-1545`, which spawns it with a
timeout). That is another reason to keep `serve()` out of the deployed entry. **verified**
that it executes the module. Failure appears non-fatal (falls back to defaults). **inferred**
from `index.mjs:1541`

## Q2. tsconfig `paths`, CJS vs ESM, ESM-only dependencies

**Default (non-experimental) build does NOT resolve `@engine` / `@shared`.**
- Vercel's docs: tsconfig is honoured "aside from 'Path Mappings' and 'Project References'"
  (https://vercel.com/docs/functions/runtimes/node-js#using-typescript-with-the-node.js-runtime). **verified**
- Mechanism: `@vercel/node` compiles each `.ts` file on its own with the **project's tsconfig
  and the project's TypeScript 6.0.3** (`register()`, `@vercel/node/dist/index.js:71891-72220`,
  called at 72437). It traces imports with `@vercel/nft` 1.10.0, which has no tsconfig
  support (`grep tsconfig` over `@vercel/nft/out` finds nothing). **verified**
- TypeScript does not rewrite `paths` on emit. Running the same transpile locally on
  `server/routes/reads.ts` with this tsconfig gives `module Preserve`, `moduleResolution
  Bundler` and output that keeps `import { currentLoggingDay } from "@engine"` and
  `import { getScope, requireUser } from "../auth/user-scope"` (extensionless). **verified**
  (run locally, output to stdout only)

**CJS vs ESM.** The root package.json has no `"type"`. Two things follow:
- Because the tsconfig sets `module: "preserve"`, Vercel's `fixConfig` does not apply its
  NodeNext default (`index.js:72210` only acts when `module` is undefined). **verified**
- The ESM→CJS babel pass skips anything whose source ended in `.ts`
  (`index.js:72556-72558`), so compiled `server/**/*.js` would keep `import`/`export` syntax
  in a CommonJS package scope. **verified**

At runtime, Node either rejects it as CJS or, with syntax detection, loads it as ESM. As
ESM it fails on the extensionless relative imports and on the bare `@engine`. **inferred**
(Node ESM requires file extensions; the exact Node 24 behaviour on Vercel was not tested).
Vercel's own changelog for the experimental builder lists "relative imports without file
extensions, TypeScript path aliases" as fixes, which confirms the default mode does not
handle them (https://vercel.com/changelog/experimental-build-mode-hono-express, 2026-01-15).
**verified**

Under the Hono preset, **type errors are fatal**: the builder sets
`EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS=1` (`@vercel/hono/dist/index.js:66`) and `@vercel/node`
throws on diagnostics when it is set (`index.js:72091`). The language service loads every
file the root tsconfig includes, which is the whole Expo app. That only matters if Vercel
compiles `.ts`; a pre-bundled `.mjs` skips it. **verified**

**ESM-only dependencies: none.** Every runtime dependency publishes a `require` condition:
hono, @hono/node-server, inngest (incl. `./hono`), drizzle-orm (incl. `./neon-http`),
@neondatabase/serverless, @sentry/node, @clerk/backend (incl. `./webhooks`), zod 4.6.7 and
@anthropic-ai/sdk (from each package.json `"exports"`). **verified**. So CJS output would
not break a dependency. The breakage is our own source (aliases plus extensionless ESM).

**Supported fixes, best first:**
- **A. Pre-bundle with esbuild (recommended).** esbuild applies tsconfig `baseUrl`/`paths`
  while bundling (https://esbuild.github.io/content-types/#tsconfig-json; it ignores
  `module`, `moduleResolution` and `customConditions`, so the `react-native` condition does
  not leak in). **verified**. Tested locally with the hoisted esbuild 0.25.12:
  `esbuild server/index.ts --bundle --platform=node --format=esm --packages=external`
  exits 0. `@engine` / `@shared` are **inlined**, even with `--packages=external`. The only
  remaining imports are real packages (`hono`, `hono/streaming`, `hono/body-limit`,
  `inngest`, `inngest/hono`, `@clerk/backend`, `@clerk/backend/webhooks`, `drizzle-orm`,
  `drizzle-orm/neon-http`, `@neondatabase/serverless`, `@sentry/node`, `@anthropic-ai/sdk`,
  `zod`, `dotenv`, `@hono/node-server`, `node:crypto`). **verified** (bundle written to temp,
  then deleted). Keeping `hono` external also keeps `from "hono"` in the bundle text, which
  the Hono builder's entry regex needs. An `.mjs` output is native ESM and skips the
  babel/TS steps (`index.js:72556`). **verified**. Declare `esbuild` as an explicit
  devDependency, because 0.25.12 is only there by hoisting. **inferred**
- **B. `VERCEL_EXPERIMENTAL_BACKENDS=1`** (project env var). This switches Hono to
  `@vercel/backends` (`@vercel/build-utils/dist/framework-helpers.js:81-95`), which bundles
  with rolldown using `tsconfig: true` (`@vercel/backends/dist/index.mjs:727-728,1339-1344`)
  and treats package.json deps as externals (706-720). **verified**. It is labelled
  experimental, it needs a root-level entry file (same name list, plus `src/main`;
  `index.mjs:84-92`), and it runs the entry at build time (Q1).
- **C. Relative imports.** Replacing `@engine`/`@shared` with relative paths in `server/`
  removes only the alias half. The extensionless-ESM half remains. Not recommended.
  **inferred**
- **D. Build Output API** (write `.vercel/output/functions/*.func` yourself). This is full
  control but the most hand-written config. **unverified** (not researched in depth)

## Q3. Region, duration, streaming; where config goes

- **Region code:** `cle1` = AWS `us-east-2`, Cleveland, USA. Neon `us-east-2` is the same AWS
  region (https://vercel.com/docs/regions#region-list). **verified**. The default for new
  projects is `iad1` (https://vercel.com/docs/functions/configuring-functions/region). **verified**
- **Setting it:** `vercel.json` `"regions": ["cle1"]`, or the dashboard under Settings →
  Functions → Function Regions. Hobby gets a **single** region, but "Hobby plans can select
  any single region" (https://vercel.com/docs/project-configuration/vercel-json#regions ,
  https://vercel.com/docs/functions/configuring-functions/region#limits). **verified**
- **maxDuration (Fluid, Hobby):** 300 s default and 300 s max (Pro: 300 s / 800 s). It
  includes streamed response time. Going over it returns 504 `FUNCTION_INVOCATION_TIMEOUT`
  (https://vercel.com/docs/functions/limitations#max-duration). **verified**. The 45 s turn
  (`server/ai/config.ts:54`) needs **no** config. Fluid is default for new projects, and
  `"fluid": true` in vercel.json makes it explicit (https://vercel.com/docs/fluid-compute).
  **verified**
- **Where config goes:**
  - `vercel.json` `regions` applies project-wide. **verified**
  - `vercel.json` `functions["<glob>"].maxDuration` is documented for `api/` paths
    (https://vercel.com/docs/project-configuration/vercel-json#functions). **verified**.
    How it maps onto a framework-preset Hono entry is **unverified**. In the CLI builder,
    `config.functions[entry]` is read only for `includeFiles`/`excludeFiles`
    (`@vercel/node/dist/index.js:72674-72686`).
  - `export const config = { maxDuration, regions }` in the entry is read statically by
    ts-morph (`index.js:72692, 72833-72836`). **verified**. esbuild rewrites
    `export const config` into `var config = ...; export { config }`, and whether the static
    reader sees that form is **unverified**. Since the defaults suffice, do not rely on
    either.
  - Memory cannot be set in vercel.json under Fluid; use the dashboard (vercel.json docs,
    `functions` value definition). **verified**
- **Streaming on Node:** enabled by default for all Node.js functions, on Hobby since
  2024-07-08 (https://vercel.com/changelog/vercel-functions-to-enable-streaming-by-default)
  and on Pro/Enterprise since 2024-10-01
  (https://vercel.com/changelog/streaming-now-enabled-by-default-for-all-node-js-vercel-functions).
  **verified**. Vercel's Hono page shows Hono's `stream()` working
  (https://vercel.com/docs/frameworks/backend/hono#streaming). **verified**. `streamSSE` is
  the same helper over a `TransformStream`, and it sets `Content-Type: text/event-stream`
  (`node_modules/hono/dist/helper/streaming/sse.js:48-63`). **verified** that the
  implementation is the same mechanism; **inferred** that SSE streams the same way.
- **Body size:** 4.5 MB request/response cap (413 `FUNCTION_PAYLOAD_TOO_LARGE`; limitations
  page). **verified**. The label image cap is 1,900,000 chars (`packages/shared/src/label.ts:41`),
  under the cap. **inferred**
- **Client disconnect (the chat Stop button).** Cancellation is **opt-in**:
  `functions[glob].supportsCancellation: true`. When it is on, `request.signal` fires on
  disconnect **and the function is terminated**, and any work not in `waitUntil` is lost
  (https://vercel.com/docs/functions/functions-api-reference#cancel-requests). **verified**.
  The chat route's design ("a write to a closed stream is ignored: the turn still finishes
  and is stored", `server/routes/chat.ts:154-161`) assumes the process outlives the
  disconnect.
  - **Without** cancellation: `c.req.raw.signal` presumably never fires, so Stop does not
    abort the model call server-side (still bounded by the 45 s deadline), but the turn is
    stored. **inferred**. Whether `stream.onAbort` fires is **unverified**.
  - **With** cancellation: the save after the turn must be wrapped in `waitUntil`.
  - This is a decision for Sriman.

## Q4. Keeping Vercel from building the Expo app; install; bundle size

- `"framework": "hono"` in vercel.json overrides the dashboard preset; `null` means "Other"
  (vercel.json docs, `framework`). **verified**
- `buildCommand` overrides the dashboard and package.json `build`; `installCommand` overrides
  install (an empty string skips it); `outputDirectory` overrides the output dir (same page).
  **verified**. With `considerBuildCommand: true` the Hono builder runs the project
  `buildCommand` in the build (`@vercel/node/dist/index.js:72655-72664`; Hono passes
  `considerBuildCommand: true` at `@vercel/hono/dist/index.js:81`). **verified (CLI-bundled builder)**
- There is no Expo build to suppress. Without a `build` script and with `framework: "hono"`,
  nothing runs `expo export`. **inferred**
- **Install:** with `package-lock.json` present, Vercel runs `npm install`
  (https://vercel.com/docs/functions/runtimes/node-js#node.js-dependencies). **verified**. The
  whole Expo tree installs, including `@sentry/cli`'s `postinstall` binary download
  (`node_modules/@sentry/cli/package.json:45`). That costs build time, not function size.
  Whether any Expo/RN postinstall fails on Linux is **unverified**; local `npm install` works,
  and there is no `.npmrc`.
- **Function size:** the limit is 250 MB uncompressed
  (https://vercel.com/docs/functions/limitations#bundle-size-limits). **verified**. Only files
  nft traces from the entry are shipped (`index.js:72462-72515`), so React Native and Expo
  never enter the function. **verified** (mechanism); **inferred** (that the result is well
  under the limit). `includeFiles` / `excludeFiles` can adjust it.
- **Node version:** new projects default to 24.x; 22.x is also available. Pin it with
  package.json `engines.node` (which wins over the dashboard) or in the dashboard
  (https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). **verified**. Local
  dev runs Node 22.23.2.

## Q5. Inngest 4.18.0 in production

- **Env vars:**
  - `INNGEST_SIGNING_KEY` is required in cloud mode, or the SDK logs "In cloud mode but no
    signing key found" (`node_modules/inngest/helpers/env.js:6-11`).
  - `inngest.send()` in cloud mode throws without an event key (`components/Inngest.js:601`),
    so the Clerk webhook needs `INNGEST_EVENT_KEY`.
  - `INNGEST_SIGNING_KEY_FALLBACK` exists for key rotation (`helpers/consts.js:24`).
  - `INNGEST_DEV` must be **unset** (Contradiction 2).
  **verified**
- **v4 changes** (https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4):
  the default mode is now cloud; `serveHost` is renamed `serveOrigin`, and
  `INNGEST_SERVE_HOST` is deprecated in favour of `INNGEST_SERVE_ORIGIN`; `streaming` is now
  `true|false`, and it **throws** if the adapter cannot stream. **verified**
- **Hono adapter on Vercel:**
  - `inngest/hono` builds its URL from `new URL(c.req.url)` first, then `serveOrigin`/`host`
    (`node_modules/inngest/hono.js:37-50`). It reads env through `hono/adapter`'s `env(c)`
    (line 60). **verified**. No `serveOrigin` is needed unless sync shows the wrong host.
    **inferred**
  - The adapter defines **no `transformStreamingResponse`**, so `INNGEST_STREAMING=true`
    would throw at serve time (`components/InngestCommHandler.js:280-285`). **verified**.
    Leave streaming off. Each step is then one normal invocation bounded by `maxDuration`
    (300 s). **inferred**
  - The path stays `/api/inngest` (`server/index.ts:116-117`), which is the integration's
    default (https://www.inngest.com/docs/deploy/vercel). **verified**
- **Integration vs manual sync** (https://www.inngest.com/docs/deploy/vercel). **verified**
  - The **Vercel integration** sets `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` and
    re-syncs on every deploy.
  - **Manual:** set both keys yourself (Production scope), then sync
    `https://<prod-domain>/api/inngest` from the Inngest UI or with a `curl`.
  - **Deployment Protection** blocks Inngest unless it is disabled or a "Protection Bypass
    for Automation" secret is given to the integration. Under Standard protection the
    integration notes production *and* branch environments are affected.
  - Recommendation for one prod environment: manual sync against the production domain is
    enough, and the integration adds preview syncs that protection will block. **inferred**

## Q6. @sentry/node on Vercel functions

- Sentry's Node SDK sends events asynchronously, and `captureException` returns before the
  HTTP send. `Sentry.flush(timeout)` drains the queue and keeps the client usable
  (https://docs.sentry.io/platforms/javascript/guides/node/configuration/draining/). **verified**.
  That page says nothing about serverless suspension. **unverified** from Sentry.
- Vercel: `waitUntil(promise)` from `@vercel/functions` "extends the lifetime of the request
  handler for the lifetime of the given Promise", is available on Node, and shares the
  function timeout (https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil).
  The cancellation docs add that work not in `waitUntil` "will be lost". **verified**.
  So an event captured right before the response ends can be lost when the instance
  suspends. **inferred**
- **Sentry will not do this for us on Node.** `@sentry/core` 10.70.0 has a `vercelWaitUntil`
  helper, but it returns early unless `typeof EdgeRuntime === "string"`
  (`node_modules/@sentry/node/node_modules/@sentry/core/build/cjs/utils/vercelWaitUntil.js`).
  `flushIfServerless` routes Vercel to that helper, so on the Node runtime it would flush
  nothing (`.../utils/flushIfServerless.js`). **verified**
- **Fix:** add `@vercel/functions` (not an Expo package, so plain `npm install` is right per
  AGENTS.md) and call `waitUntil(Sentry.flush(2000))` after each capture:
  `captureRouteError`, `captureChatFallback`, and after the `traceLabelRead` /
  `traceChatTurn` spans end. Guard it with `Sentry.isInitialized()`. **inferred** (from the
  two verified facts above)
- Sentry's Hono guide now recommends `@sentry/hono/node`, which uses a `dataCollection`
  option rather than `sendDefaultPii` (https://docs.sentry.io/platforms/javascript/guides/hono/).
  **verified**. It does not mention Vercel. Staying on `@sentry/node` keeps
  `sendDefaultPii: false` (`server/observability/sentry.ts:68`) and the existing scrubbers
  exactly as AGENTS.md requires. **inferred**
- An ESM bundle without `node --import` gets no OpenTelemetry auto-instrumentation. The
  server does not use it: manual spans only, as the comment at `server/index.ts:24-35` says.
  **inferred**

## Q7. Other things that would break or change

- **dotenv with no `.env`:**
  - dotenv 17.4.2 catches the read error, returns `{ error }` and does not throw. It still
    logs `injected env (0) from .env // tip: ...` unless `quiet`
    (`node_modules/dotenv/lib/main.js:240-317`). **verified**. Harmless, but noisy on every
    cold start.
  - dotenv is a **dev**Dependency. It is installed at build time and traced from there.
    **inferred**
  - nft is unlikely to ship `.env`, because `config({ path })` is not an `fs` call it
    evaluates. **inferred**. Do not rely on that: use `.vercelignore` (Contradiction 3) and
    skip `config()` when `process.env.VERCEL` is set.
- **`env.ts` `required()` throws at import** (`server/env.ts:7-13`). A missing
  `DATABASE_URL`, `CLERK_SECRET_KEY` or `CLERK_WEBHOOK_SIGNING_SECRET` in the Vercel
  Production environment makes every cold start fail. **inferred**
- **`process.env.PORT`:** used only by `honoServe` (`server/env.ts:32`, `server/index.ts:186`),
  which the deployed entry no longer calls. **inferred**
- **Clerk webhook raw body:**
  - `verifyWebhook(request)` reads `request.text()` and the `svix-*` headers itself, and
    reads `CLERK_WEBHOOK_SIGNING_SECRET` from env
    (`node_modules/@clerk/backend/dist/webhooks.mjs:31-58`). **verified**
  - With `export default app`, the function gets a standard Web `Request`, so `c.req.raw`
    holds the untouched body. **inferred** (from https://vercel.com/docs/functions/functions-api-reference#fetch-web-standard).
    Vercel's `req.body` parsing helpers belong to the `(req, res)` signature only, and they
    are lazy getters (https://vercel.com/docs/functions/runtimes/node-js#request-body).
    **verified**
  - The Clerk endpoint URL must move from ngrok to the production domain. A new Svix
    endpoint has its own signing secret. **unverified** (Clerk docs not read)
  - Deployment Protection must not cover that domain. **inferred**
- **In-memory rate-limit Maps under Fluid** (`server/http/limits.ts`):
  - Fluid lets "multiple invocations ... share the same physical instance (a global
    state/process) concurrently" (https://vercel.com/docs/fluid-compute#isolation-boundaries-and-global-state).
    **verified**. So module-level Maps **are** shared across concurrent requests in one
    instance, and **not** across instances. Effective cap ≈ 60 writes/min × warm instances;
    auto-scaling goes up to 30,000 concurrency on Hobby/Pro (limitations page). **verified**
    for scale; **inferred** for the multiplication.
  - Instances are recycled, so windows reset and `CALLER_SALT` (`limits.ts:249`) is re-drawn
    per instance. Unauthenticated "distinct caller" counts are per instance and not additive.
    **inferred**
  - `x-forwarded-for` is overwritten by Vercel and external IPs are not forwarded, so the
    first value is the real client IP and cannot be spoofed
    (https://vercel.com/docs/headers/request-headers#x-forwarded-for). **verified**
- **Neon over HTTP** (`server/db/index.ts`, `drizzle-orm/neon-http`) holds no pooled
  sockets, so `attachDatabasePool` (which is for TCP pools) does not apply
  (https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool).
  **inferred**
- **File descriptors:** 1,024 shared across concurrent executions in an instance
  (limitations page). This is irrelevant at this scale. **verified**
- **The `GET /` route** (`server/index.ts:50-67`) lists every route publicly. That is fine
  on ngrok, but worth a thought once the URL is permanent. **inferred**
- **The client URL:** `EXPO_PUBLIC_API_URL` must point at the Vercel domain, and Metro must
  be restarted to pick it up (`.env.example`). **verified**

---

## Recommended shape (sketch; nothing here has been created)

```
server/app.ts        NEW   - moved from index.ts: initSentry(), the Hono<AppEnv> app, routes,
                             onError; ends with `export default app`. No serve().
server/index.ts      EDIT  - local only: `import app from "./app"`, then honoServe({ fetch: app.fetch, port: env.PORT }).
                             `npm run server` unchanged.
server/env.ts        EDIT  - `if (!process.env.VERCEL) config({ path: ".env", quiet: true })`
server/observability/sentry.ts  EDIT - after each capture/span: if Sentry.isInitialized(),
                             waitUntil(Sentry.flush(2000)) via @vercel/functions.
server/inngest/client.ts  EDIT - fix the comment: v4 defaults to cloud; dev mode is INNGEST_DEV.
vercel.json          NEW
.vercelignore        NEW
package.json         EDIT  - devDependency esbuild (pin), dependency @vercel/functions,
                             script "build:server"; optionally "engines": { "node": "22.x" }.
.gitignore           EDIT  - add dist-server/ and .vercel
```

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "hono",
  "buildCommand": "npm run build:server",
  "outputDirectory": "dist-server",
  "regions": ["cle1"],
  "fluid": true
}
```

`package.json` script (esbuild resolves `@engine` / `@shared` from tsconfig; deps stay external
and are traced by nft from `node_modules`):

```json
"build:server": "esbuild server/app.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=dist-server/index.mjs"
```

`.vercelignore` (CLI uploads ignore `.gitignore`; this keeps secrets off Vercel):

```
.env
.env.*
!.env.example
.expo
.scratch
android
ios
```

Vercel project env (Production): `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SIGNING_SECRET` (new endpoint's), `ANTHROPIC_API_KEY`, `OFF_USER_AGENT`,
`SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`.
**Not** `INNGEST_DEV`. **Not** `INNGEST_STREAMING`.

Why this shape:
- `framework: "hono"` stops Vercel from guessing ("Other" would serve the repo root).
- The build command produces `dist-server/index.mjs`, which still contains `from "hono"`.
  The Hono builder finds it in the output directory after the build, `@vercel/node` traces
  it as native ESM with no TS step, and the result is one function in `cle1` serving every
  path.
- Default 300 s covers the 45 s chat turn and every Inngest step.

**Unverified until the first real build:**
1. That the remote builder version behaves like CLI 54.17.3's `@vercel/hono` 0.2.100 for the
   `outputDirectory` entry search.
2. That the runtime loads `default.fetch` from an `.mjs` produced this way. This is
   documented for `api/` and Hono, but not tested here.
3. That nothing in the Expo install fails on Linux.

If (1) fails, fall back to option B (`VERCEL_EXPERIMENTAL_BACKENDS=1` with a root
`server.ts` that does `import type {} from "hono"; export { default } from "./server/app"`),
or to the Build Output API.

Smoke test after deploy:
- `GET /health`
- `POST /api/webhooks/clerk` from Clerk's "send test event"
- Inngest sync showing three functions
- One chat turn on the phone, watching that the SSE arrives incrementally

Open decisions for Sriman:
- `supportsCancellation` for the chat route (Q3).
- Whether to keep in-memory limits for now. plan.md already defers shared state to Phase 12.
- Inngest Vercel integration vs manual sync.
