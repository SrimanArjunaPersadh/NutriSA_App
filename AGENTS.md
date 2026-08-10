# NutriSA — Agent Instructions

## Before writing any code

**Expo has changed.** Read the exact versioned docs before writing Expo code:
https://docs.expo.dev/versions/v54.0.0/ — not blog posts, not memory, not `latest`.

⚠️ **`latest` in the Expo docs is not the version this project runs.** See the SDK pin below.

Then read `plan.md` for the current phase, the standing rules, and the design tokens.
The full spec, with the reasoning behind every decision, lives at:
`~/.claude/plans/plan-mode-prompt-you-replicated-whistle.md`

## Stack — decided, do not substitute

| Layer | Choice |
|---|---|
| App | Expo SDK **54**, React Native 0.81.5 — **pinned, see below** |
| Routing | expo-router — file-based, `typedRoutes`, React Compiler on |
| Navigation | **Native Tabs** — see the rule below. Never JS tabs. |
| Styling | NativeWind v4, `className` only |
| Server state | React Query + a typed client over shared zod schemas |
| API | Hono on Vercel |
| Database | **Neon** (serverless Postgres) |
| ORM | **Drizzle** + `drizzle-kit` for migrations |
| Auth | **Clerk** — skills in `.agents/skills/clerk-expo` |
| Background jobs | **Inngest** |
| Images | **ImageKit** — optimization and delivery |
| Errors & monitoring | **Sentry** — `sendDefaultPii: false` |
| Tests | Vitest |

Shared zod schemas live in `packages/shared/` and are imported by both client and server.
There is one source of truth per contract; never redeclare a shape on one side.

## The SDK is pinned to 54 — do not upgrade it

**Expo Go from the App Store supports exactly one SDK at a time, and right now that is 54.**
Newer SDKs exist in the docs and on npm long before the Expo Go binary clears Apple review.
Phase 3 runs on Expo Go because it is the only free path onto the iPhone, so **the App Store
Expo Go build — not the docs — decides this project's SDK.**

This has already been learned the hard way: an upgrade to SDK 57 typechecked clean and
passed `expo-doctor` 20/20, then failed on the device with *"Project is incompatible with
this version of Expo Go"* and had to be fully reverted.

- Do not run `npx expo install expo@^<newer> --fix`, and do not "helpfully" bump the SDK.
- `eas go` builds a personal Expo Go for a newer SDK, but **requires the paid Apple
  Developer account** — that is Phase 12, not now.
- The SDK moves only when Sriman confirms the Expo Go app on the iPhone reports a new
  number. Verify against the device, never against `docs.expo.dev/versions/latest`.

## Native tabs — always

The app's tab bar is **always** the platform-native tab bar:

```tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs';
```

- **Never** use the JavaScript `Tabs` from `expo-router`, and never
  `@react-navigation/bottom-tabs`. If you are reaching for either, stop and ask.
- The `unstable-` import path is correct and expected — Native Tabs is still alpha and the
  API is subject to change, and it changed between SDK 54 and 55. Check the **SDK 54** docs
  for the current shape before editing the tab layout; do not copy another SDK's API.
- Native Tabs under Expo Go on SDK 54 is **unverified** — see the open question in `plan.md`.
- If a design need appears to require a JS tab bar, that is a question for Sriman, not a
  decision to make in code.

## Non-negotiables

The complete list is in `plan.md` under "Standing rules" — copy that block into every
branch review. These are the ones that most often get violated by default:

- **Zero arithmetic in the model.** Every computed number comes from the deterministic
  engine in `packages/engine/`. The model transcribes, classifies and explains; it never
  calculates.
- **Four states on every surface**: empty, loading, error, happy. No exceptions.
- **`user_id` is never accepted from the client.** It is derived server-side from the
  verified Clerk token and injected through the scoped query layer.
- **One time authority.** All dates come from `currentLoggingDay()` (Africa/Johannesburg).
  No stray `new Date()`, no client-supplied day key.
- **Dark only.** No light theme, no toggle, no `dark:` variants. Tokens are fixed in `plan.md`.
- **44×44px minimum touch targets**, primary actions within thumb reach.
- **New user-scoped table?** Add it to the POPIA deletion cascade *and* the export in the
  same branch. A table that escapes the cascade is a silent legal hole.

## Data & privacy boundaries

- **ImageKit is for stored, displayed images only** — progress photos and food imagery.
  It is **never** in the label-OCR path. OCR photos are ephemeral: captured, sent to the
  model, discarded. Never uploaded, never retained.
- ImageKit private keys stay server-side. Only the public URL endpoint may reach the client.
- Never log weight, macro values, or request bodies to Sentry.
- Secrets come from `.env`, are never hard-coded, and are never committed.

## Do not, by default

- Do not `npm install` an Expo package — use `npx expo install` so versions stay aligned.
- Do not edit `android/` or `ios/` by hand. This project uses Continuous Native Generation:
  change `app.json` and config plugins instead.
- Do not import from `@react-navigation/*` directly — go through expo-router.
- Do not use `StyleSheet.create` or inline style objects for layout. NativeWind `className`.
- Do not use relative imports across features — use the `@/*` and `@/assets/*` aliases.
- Do not add a runtime dependency to `packages/engine/`. It stays pure TypeScript so it can
  be tested in isolation and shared by both sides.
- Do not write raw SQL where Drizzle expresses it; do not bypass the scoped query layer.
- **Never run the app.** Sriman always has it running in a separate terminal. Do not run
  `npm start`, `expo start`, `expo run:android`, `expo run:ios`, or any dev server — a
  second instance fights the first for the port and the Metro cache. Metro hot-reloads
  your edits into the running app on its own. When you need to see the result, describe
  what to look at and ask; do not start it yourself.
- **Do not run git.** Never commit, push, or create branches. Report what changed and let
  Sriman run the command.

## Workflow

One feature per branch, one fresh session per branch. At the end of a session, stop and
hand off — suggest the next branch name, don't create it.

## Commands

```bash
npx expo install <pkg>   # never plain npm install for Expo packages
npx tsc --noEmit         # typecheck
npx vitest               # engine suite — must be green before merge
npx drizzle-kit generate # after any schema change
```

`npm start` / `expo start` are **Sriman's to run**, never yours — see "Do not, by default".
