# NutriSA

A personal nutrition and weight tracker for South Africa. Dark only, iPhone first, run
through Expo Go during development. Log food by search, barcode or quick add, track a
smoothed weight trend, and (later) talk to an assistant that is grounded in your own data
and never does maths itself.

This README is the map. It tells you what you need to run the project, how to run it, and
how each new feature gets from idea to merged. The detail lives in the files it points to.

---

## Coming back after a break? Start here

Do these four things, in order, before writing or asking for any code.

1. **Read the newest handoff** in `.scratch/handoffs/`. The last session left a note named
   after its branch: what it finished, what it could not verify, the exact next action, and
   the open questions waiting for you. (This folder is gitignored and does not exist on a
   fresh clone. That is normal.)
2. **Read the status block at the top of `plan.md`.** It says which phases are done, which
   are half done, and what has and has not been seen on the phone.
3. **Check where git is:**
   ```powershell
   git status
   git log --oneline -5
   ```
   Uncommitted work from the last session should be committed before anything new starts.
4. **Start the dev loop** (below) and look at the app on the phone before changing it.

### Where everything lives

| File / folder | What it is | Read it when |
|---|---|---|
| `plan.md` | The living checklist: every phase, every branch, every decision and why. The single source of truth. | Every session |
| `.scratch/handoffs/<branch>.md` | The last session's note to the next one. Not committed. | Every session, first |
| `AGENTS.md` | The rules every Claude session follows (`CLAUDE.md` just points to it). Stack, SDK pin, non-negotiables. | When a rule is in question |
| `~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md` | The original full spec, with the reasoning behind each decision. | Rarely; `plan.md` has superseded parts of it |
| `server/README.md` | The API: every route, what it returns, what it answers on failure. | Touching the server |
| `docs/research/` | Version-pinned research notes (for example, the SDK 57 upgrade). | Before touching that area again |
| `src/design/` | Reference images and the design tokens (`tokens.ts`). | UI work |
| `research designs/` | Other apps' screens, notes per app, and the food logger prototype. | Designing a screen |

---

## What you need to run it

- **Windows with PowerShell 5.1.** Every command in this file is PowerShell. There is no
  `&&`: run commands one per line, or use `;`.
- **Node 22 and npm.**
- **An iPhone with Expo Go from the App Store.** Expo Go supports exactly one SDK at a time,
  and **this project is pinned to SDK 58** because that is what the App Store build runs
  (React Native 0.88.0). Do not upgrade the SDK until Expo Go on the phone reports a newer
  one. `tests/expo-sdk-pin.test.ts` enforces the pin. Full history in `AGENTS.md`.
- **Accounts:** Neon (database), Clerk (sign-in), ngrok (free plan, with its one permanent
  domain), Sentry (optional). Open Food Facts needs no account.
- **A `.env` file** at the project root. Copy `.env.example` and fill it in:

| Variable | What it is for |
|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk key the app uses to sign in |
| `EXPO_PUBLIC_API_URL` | The ngrok URL the phone calls. Baked into the app bundle when Metro starts |
| `CLERK_SECRET_KEY` | Server-side session verification |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Verifies Clerk's user-created / user-deleted webhooks |
| `DATABASE_URL` | Neon, the real database |
| `TEST_DATABASE_URL` | A separate Neon **branch** for the security tests. Never the real database |
| `SEED_GOAL_WEIGHT_KG` | Used once by `npm run seed:profile` |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` | Error reporting. Leave the DSN empty to keep Sentry off |
| `OFF_USER_AGENT` | How the server identifies itself to Open Food Facts: `NutriSA/0.1 (your-email)` |
| `INNGEST_DEV` | Points background jobs at the local Inngest dev server |

First time only:

```powershell
npm install
```

---

## Running it day to day

**You run the app. Claude never does.** A second Metro or server instance fights yours for
the port and the cache. Claude edits files and Metro hot-reloads them into your phone.

Open three terminals in the project folder:

```powershell
# Terminal 1: the API server (restarts itself when server code changes)
npm run server
```
```powershell
# Terminal 2: the tunnel that lets the phone reach your PC. Always this exact URL.
ngrok http 3000 --url https://headroom-stimulant-judiciary.ngrok-free.dev
```
```powershell
# Terminal 3: Metro, the bundler that serves the app to Expo Go
npx expo start
```

A fourth, only when testing sign-up (Clerk's webhook creates the user row through Inngest):

```powershell
npm run inngest:dev
```

Then:

1. Check the server is reachable: open
   `https://headroom-stimulant-judiciary.ngrok-free.dev/health` in the phone's browser. It
   should say `{"ok":true}`. The first request after a quiet spell can be slow while Neon
   wakes up.
2. On the iPhone, open Expo Go and tap NutriSA under "Recently opened" (or scan the QR code
   in Terminal 3).

### When to restart what

| You changed | Do this |
|---|---|
| App code (`src/`, `packages/`) | Nothing. Metro hot-reloads. Press `r` in Terminal 3 to force a reload |
| Server code (`server/`, `packages/`) | Nothing. `tsx watch` restarts the server |
| `.env` | Restart Terminal 1. If an `EXPO_PUBLIC_` value changed, also restart Metro with `--clear` |
| Added a package (`npx expo install ...`) | Ctrl+C Terminal 3, then `npx expo start --clear`, then fully close and reopen Expo Go |
| The Expo SDK | `npx expo start --clear`. A stale cache after an SDK jump breaks everything |

**The phone is the source of truth.** The web preview and the simulator have each looked
right while the phone was wrong: comma decimals on the SA keyboard, a keyboard gap, an image
at zero size. Sign-in does not work on the web build at all.

---

## How a feature gets built

### The branch lifecycle

Every feature goes through the same eight steps.

1. **Pick the feature.** It is the next unticked phase in `plan.md`, or the "Next branch"
   the last handoff suggested.
2. **Commit what came before.** Nothing new starts on top of uncommitted work.
3. **Create the branch yourself.** Name it after the feature (`saved-meals`,
   `targets-and-profile`).
   ```powershell
   git switch main
   git pull
   git switch -c targets-and-profile
   ```
   If the previous branch's PR has not merged yet and the new work depends on it, branch
   from that branch instead of `main` (a "stacked" branch).
4. **Open a fresh Claude session.** One feature per branch, one fresh session per branch.
   A long session that does three features loses track of the first, and its review is
   three reviews in one. The session's first job is to read the handoff and `plan.md`.
5. **Build it,** in the order below.
6. **Look at it on the phone.** Nothing is done until it has been seen on the iPhone.
7. **Pass the merge gate** (below), then commit, push, open a PR and **squash-merge** it.
8. **End the session with `/handoff`.** It writes `.scratch/handoffs/<branch>.md` and
   suggests the next branch name. It does not create it. That is step 3 of the next loop.

### Inside a branch: logic first, UI on top, polish last

Each feature is built from the bottom up:

1. **The contract.** Zod schemas in `packages/shared/`, imported by both the app and the
   server. One definition per shape, never redeclared on either side.
2. **The maths.** Any number a user will read is computed in `packages/engine/`: pure
   TypeScript with tests, no dependencies. No screen, route or AI model ever does
   arithmetic itself.
3. **The server route.** Under `server/routes/`, reading and writing only through the
   scoped query layer (`server/data/scoped.ts`), which stamps the signed-in user on every
   query. Isolation tests go in `tests/security/`.
4. **The screen,** wired to the real route, with all four states: empty, loading, error
   and happy.
5. **The device pass.** Bugs found here are the ones no test can find.
6. **Design polish** against a reference image, on the device.

UI first was tried once. The dashboard was built on fake numbers in August, looked
finished, and was not. `plan.md` keeps that as a lesson: a screen showing fake data reads
as done.

### Design references

Put reference images in `src/design/` and point the session at them. Research on other
apps lives in `research designs/` at the repo root: App Store screenshots of eight food
loggers, a `notes.md` per app, the ranking, and `prototype.html`, a clickable mockup of
the food logger (open it in a browser or the Mobile Preview extension). Start with its
`README.md`.

All of these are **evidence, not instructions**. Where a mock disagrees with a standing
rule, the rule wins:

- **Colours come only from the token table** in `plan.md` (mirrored in `src/design/tokens.ts`
  and `tailwind.config.js`; a test keeps them in sync). A colour that is not in the table,
  like a mock's orange, becomes the nearest token with the same meaning, usually `primary`.
- **Macro colours are fixed:** protein purple, carbs yellow, fat teal. Order is always
  protein, carbs, fat.
- **The tab bar is always the native one** (`NativeTabs`). A mock's own tab bar is not drawn.
- **Dark only,** 44 by 44 point minimum touch targets, no em dashes in user-facing copy.

### The merge gate

Before a branch merges, all of these must hold:

```powershell
npx tsc --noEmit          # typecheck: must be clean
npx vitest run            # the main suite: must be green
npm run test:security     # isolation tests against a real Neon branch: must be green
```

Then, in a Claude session: **`/nutrisa-review since main`**. It reviews the branch three
ways at once (standards, spec, privacy) and its findings get fixed or recorded in `plan.md`.

> As of 2026-10-19 the security suite has never run, because `TEST_DATABASE_URL` in `.env`
> has stale credentials. Fix it with a fresh pooled connection string for the `test` branch
> from the Neon console. Several branches' isolation tests are waiting on it.

### Git: who does what

**You run every git command. Claude never commits, pushes or creates branches.** It tells
you what changed and gives you the command. A typical commit:

```powershell
git add -A
git status
git commit -F - @'
feat: the food logger - search, plate, barcode scan

Co-Authored-By: Claude <noreply@anthropic.com>
'@
git push
```

The closing `'@` must sit at the very start of its line. Run `git status` before committing
to check nothing unexpected is staged.

**The squash-merge trap.** PRs here are squash-merged, which puts the branch's changes on
`main` as one brand-new commit. A stacked branch then **must not** be updated with
`git rebase main`: every file conflicts with itself and deleted files come back. Replay only
the new commits instead:

```powershell
git rebase --onto main <last-commit-of-the-merged-branch> <your-branch>
git push --force-with-lease
```

If a rebase goes wrong, `git rebase --abort` always puts things back.

---

## Rules that never bend

The full list is "Standing rules" in `plan.md`. The ones that matter most day to day:

- **Zero arithmetic outside the engine.** Every computed number comes from
  `packages/engine/`.
- **Four states on every surface:** empty, loading, error, happy.
- **The user id never comes from the client.** The server takes it from the verified Clerk
  token.
- **One time authority.** Every date comes from `currentLoggingDay()` (Africa/Johannesburg).
  The phone's clock is never trusted for which day it is.
- **A new user-scoped table** joins the POPIA deletion cascade and the data export in the
  same branch.
- **Real bodyweights** get 9.0 kg subtracted before they go into a committed test fixture.
- **Install Expo packages with `npx expo install`,** never plain `npm install`.
- **Never edit `android/` or `ios/` by hand.** Change `app.json` instead.

---

## Command reference

| Command | What it does |
|---|---|
| `npm run server` | Starts the API on port 3000, restarting on change |
| `npx expo start` | Starts Metro. Add `--clear` after installs or SDK changes |
| `npm run inngest:dev` | Local background-job runner (sign-up webhooks) |
| `npx tsc --noEmit` | Typecheck |
| `npx vitest run` | Main test suite |
| `npm run test:security` | Isolation tests against the `TEST_DATABASE_URL` Neon branch |
| `npx expo install <pkg>` | Adds an Expo-compatible package |
| `npx drizzle-kit generate` | Generates a migration after a schema change |
| `npm run db:migrate` | Applies migrations to the database in `DATABASE_URL` |
| `npm run db:studio` | Browse the database in a web UI |
| `npm run seed:profile` | One-off: seeds the goal weight |

## Claude skills in this repo

Type these as slash commands in a Claude Code session.

| Skill | Use it to |
|---|---|
| `/handoff` | End a session: write the branch's handoff note for the next session |
| `/nutrisa-review since main` | Review a branch on standards, spec and privacy before merging |
| `/diagnosing-bugs` | Work through a bug found on the device, step by step |
| `/versioned-research` | Check an Expo, Clerk, Drizzle, Hono or NativeWind API against the pinned version's docs |
| `/grilling` | Stress-test a plan before building it |
| `/domain-modeling` | Name a new concept or record a decision consistently |
| `/doc-drift` | Check that `AGENTS.md`, `plan.md` and the code still agree, and fix the contradictions. Worth running before starting a branch |

---

## When something goes wrong

| Symptom | Usual cause |
|---|---|
| Every card says "Can't reach the server" | ngrok or the server is down. Check `/health`. On the web preview this is expected: browsers block the request |
| "App isn't configured" | `EXPO_PUBLIC_API_URL` missing from the bundle. Fix `.env`, then `npx expo start --clear` |
| ngrok says `ERR_NGROK_334` | A leftover cloud endpoint holds the domain. Delete it in the ngrok dashboard; do not change the URL |
| Sign-up works but no user row appears | Inngest is not running, or ngrok was started without `--url` |
| `tsc` errors on `href="/"` right after files were added | Metro's typed-routes file went stale, not your code. Restarting Metro regenerates it |
| An image or gradient is invisible on the phone only | A third-party component needs registering in `src/components/nativewind-interop.ts` |
| A decimal will not type, or comes out as zero | The SA keyboard types a comma. Parse with `parseDecimal` / `parseKg` from `src/lib/format.ts` |
| "Project is incompatible with this version of Expo Go" | The SDK pin and Expo Go disagree. Check what Expo Go reports before changing anything |
| `npm run test:security` fails before any test runs | `TEST_DATABASE_URL` credentials are stale |
