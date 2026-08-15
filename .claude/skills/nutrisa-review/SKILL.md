---
name: nutrisa-review
description: Review the changes since a fixed point along three axes — Standards (does it follow this repo's non-negotiables?), Spec (does it match the plan.md phase it claims?), and Privacy (does it hold the POPIA and data-boundary line?). Runs the axes as parallel sub-agents and reports them side by side. Use when reviewing a branch, work-in-progress changes, or "review since X".
---

# Code Review

Three-axis review of the diff between `HEAD` and a fixed point:

- **Standards** — does the code conform to the non-negotiables in `AGENTS.md` and the
  standing rules in `plan.md`?
- **Spec** — does the code faithfully implement the `plan.md` phase it belongs to?
- **Privacy** — does it hold the health-data and POPIA boundary?

Each axis runs as its **own sub-agent, in parallel**, so their contexts don't pollute each
other, then this skill aggregates. The third axis exists because this repo stores Special
Personal Information under POPIA, and a privacy finding buried under twelve style findings
is a privacy finding nobody acts on.

## Process

### 1. Pin the fixed point

Whatever Sriman named — a SHA, `main`, `HEAD~5`. If he didn't name one, ask.

Confirm it resolves (`git rev-parse <ref>`) and the diff is non-empty **before** spawning
anything. Capture `git diff <ref>...HEAD` (three-dot, against the merge-base) and
`git log <ref>..HEAD --oneline`. Reading git history is fine; **you never write git** —
no commit, no push, no branch. Report and let Sriman run the command.

### 2. Identify the spec source

In order: the `plan.md` phase named in the branch name or commit messages; a path Sriman
passed; the phase whose checklist the diff most closely matches. If none of those land,
ask which phase this is. If there is genuinely no spec, the Spec sub-agent reports "no
spec available" rather than inventing one.

### 3. Spawn the three sub-agents in parallel

Each gets the diff command, the commit list, and its own brief. Paste the checklist into
the prompt — a sub-agent has no other access to it.

**Standards sub-agent.** Brief: *"Report, per file and hunk, every place the diff breaks a
repo standard. Cite the rule. Distinguish hard violations from judgement calls. Skip
anything a test or the typechecker already enforces — say so instead of restating it.
Under 400 words."* Checklist:

- **Zero arithmetic outside `packages/engine/`.** Any computed number in a component, a
  route, or a model prompt is a hard violation.
- **Four states on every surface** — empty, loading, error, happy. A component with only
  the happy path is incomplete, not "to be finished later".
- **`user_id` never accepted from the client.** Derived server-side from the verified
  Clerk token, through the scoped query layer.
- **One time authority.** Every date from `currentLoggingDay()`. A bare `new Date()` in
  `src/` or in a day-key path is a hard violation; a row `updatedAt` is not.
- **Dark only.** No light theme, no `dark:` variant, no near-white.
- **No hex literal in `src/`** outside `src/design/tokens.ts` and `BrandIcons.tsx` — and
  no *new* colour that is not in the token table, even via a token.
- **NativeWind `className`** for layout. No `StyleSheet.create`, no inline style object.
  Where a platform prop takes a value rather than a class, it reads from `tokens.ts`.
- **Native Tabs only** — `expo-router/unstable-native-tabs`. Any `@react-navigation/*`
  import, or the JS `Tabs`, is a hard violation.
- **Expo SDK stays 54.** Any bump to `expo`, `react-native`, or an `expo-*` package
  version is a hard violation regardless of how clean it typechecks.
- **`npx expo install`, never `npm install`,** for Expo packages.
- **`packages/engine/` stays dependency-free** and imports nothing but itself.
- **44×44px minimum touch targets**, primary actions in thumb reach.
- **Aliases `@/*`, `@/assets/*`, `@engine`** — no relative import across features.
- **New user-scoped table?** It appears in the POPIA deletion cascade *and* the export, in
  this same diff. A table that escapes the cascade is a silent legal hole. (Also flag it
  to the Privacy axis.)

**Spec sub-agent.** Brief: *"Report (a) requirements the phase asked for that are missing
or partial; (b) behaviour in the diff nobody asked for — scope creep; (c) requirements
that look implemented but implemented wrong. Quote the plan.md line for each finding.
Under 400 words."*

**Privacy sub-agent.** Brief: *"Report every place the diff moves, stores, logs, or
exposes personal data in a way the boundaries forbid. Quote the hunk. Under 400 words."*
Checklist:

- No weight, macro value, meal content, or request body reaches a Sentry event, a
  console log, or a server log.
- `sendDefaultPii: false` still holds.
- OCR photos stay ephemeral — captured, sent to the model, discarded. **Never** through
  ImageKit. ImageKit is for stored, displayed images only.
- ImageKit private keys stay server-side; only the public URL endpoint may reach a client
  bundle.
- No secret hard-coded, no secret in a committed file, no secret in a URL parameter.
- Every new user-scoped table is in the deletion cascade and the export.
- Nothing sensitive lands in unencrypted device storage — tokens go through
  `expo-secure-store`.
- Any new third party: name it, and say exactly what user data it can see.

### 4. Aggregate

Present the three reports under `## Standards`, `## Spec`, and `## Privacy`, verbatim or
lightly cleaned. **Do not merge or re-rank across axes** — the separation is the point.
Close with one line: findings per axis, and the worst issue *within* each axis. Don't pick
a single winner across axes; that is exactly the re-ranking the split exists to prevent.

## Why three axes

Code can pass one and fail another. Perfectly conventional code that implements the wrong
phase passes Standards and fails Spec. Code that does exactly what Phase 8 asked and pipes
an OCR photo through ImageKit passes Spec and fails Privacy — and that one is a legal
exposure, not a style note. Reporting them separately stops any axis masking another.
