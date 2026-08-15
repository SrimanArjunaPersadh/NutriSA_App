---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions in this repo. Use when the user says "diagnose"/"debug this", or reports something broken, throwing, failing, wrong on device, or slow.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip a phase only with an explicit reason.

Read `CONTEXT.md` for the module vocabulary and check `docs/adr/` in the area you are
touching before exploring the code.

## The constraint that shapes every loop here

**You never run the app.** Sriman has Expo running in his own terminal; a second Metro
instance fights the first for the port and the cache. That means the ladder below is not
optional politeness — for anything above the engine layer, **the human is the loop**, and
your job is to structure his half of it so each round returns a clean signal.

## Redact

You will be showing commands and captured output. Write `<REDACTED>` over every secret
before it appears: Clerk keys, the Neon connection string, ImageKit private keys, the
Sentry auth token. Build loops against env vars so the credential stays in the
environment. Never paste a real weight, macro value, or request body — that is Special
Personal Information under POPIA and it does not belong in a transcript.

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. A **tight** pass/fail signal — one
that goes **red** on *this* bug — finds the cause for you. Without one, no amount of
reading code will save you.

### The ladder, in order of preference for this repo

1. **Vitest against `packages/engine/`.** The engine is pure TypeScript with zero runtime
   dependencies, node environment, no transform. If the bug is arithmetic, trend, targets,
   cost, macros, or day-key logic, the loop is a test file and it runs in under a second.
   Anything that *can* be pushed down to this rung should be — this is the one rung where
   you have a true tight loop.
2. **A repo-hygiene test under `tests/`.** If the bug is a rule violation rather than a
   runtime failure — a stray hex, a token mismatch, an engine import — the loop is an
   assertion over the file text, in the shape of `no-hex-literals.test.ts`.
3. **`npx tsc --noEmit`.** Fast, deterministic, and catches a large share of Expo-router
   and Drizzle-schema mistakes before the device ever sees them.
4. **A node script against the API.** Hono routes and the Drizzle query layer run in plain
   node. Hit them with `tsx` or `curl` against a local server *you may start* — the
   prohibition is on the Expo dev server, not on the API.
5. **A Neon branch.** For data-shaped bugs, cut a branch of the database and query it
   directly rather than reasoning about what the rows probably contain.
6. **HITL loop — `scripts/hitl-loop.template.sh`.** For anything that only reproduces on
   the device. Copy the template, write the steps, and ask Sriman to run one script that
   prompts him through the repro and prints captured values back for you to parse. One
   structured round beats six rounds of "can you check whether…".

Build the right loop and the bug is 90% fixed.

### Tighten it

Once you have *a* loop, treat it as a product: faster (narrower scope, less setup),
sharper (assert the exact symptom, not "didn't crash"), more deterministic (pin the clock
through `currentLoggingDay()`, seed any randomness, fix the fixture).

### Completion criterion

Phase 1 is done when you can name **one command** you have **already run at least once**
(show the invocation and its output, redacted) that is:

- [ ] **Red-capable** — drives the real code path and asserts Sriman's exact symptom.
- [ ] **Deterministic** — same verdict every run.
- [ ] **Fast** — seconds.
- [ ] **Runnable by the right party** — by you unattended, or by Sriman via one HITL script.

If you catch yourself building a theory before this command exists, stop. Jumping to a
hypothesis is the exact failure this skill prevents.

## Phase 2 — Reproduce and minimise

Run the loop, watch it go red, confirm the failure is the one Sriman described and not a
different one nearby. Then shrink: cut inputs, config, callers and steps **one at a
time**, re-running after each cut. Done when every remaining element is load-bearing.

## Phase 3 — Hypothesise

Generate **3–5 ranked, falsifiable hypotheses before testing any of them** — a single
hypothesis anchors on the first plausible idea. Each states its prediction: "if X is the
cause, changing Y makes it disappear." Show the ranked list to Sriman before testing; he
often re-ranks it instantly. Don't block on him if he's away.

### Suspect list specific to this stack

Weight these ahead of the generic ones, because they have already bitten:

- **SDK-version drift.** An API copied from `docs.expo.dev/versions/latest` rather than
  `v54.0.0`. Native Tabs in particular changed shape between 54 and 55.
- **Native Tabs vs JS tabs.** A prop that exists in `@react-navigation/bottom-tabs` and
  not in `expo-router/unstable-native-tabs`.
- **Time authority.** Any date not from `currentLoggingDay()` — a stray `new Date()`
  resolves to device local time, and Africa/Johannesburg is UTC+2, so the day key flips
  two hours early.
- **NativeWind class not applying.** A `className` on a component that does not forward
  `style`, or a platform prop that takes a value rather than a class.
- **`user_id` scoping.** A query that reached the DB without going through the scoped
  query layer returns another user's rows, or none.
- **Metro cache.** A change that is correct in the file and stale in the bundle.

## Phase 4 — Instrument

Each probe maps to one prediction from Phase 3. Change one variable at a time.

Tag every debug log with a unique prefix — `[DEBUG-a4f2]` — so cleanup is one grep.
Untagged logs survive forever; tagged logs die. Never log a weight, a macro value, or a
request body, in Sentry or in the console.

For performance work, measure before you fix: a baseline number, then bisect.

## Phase 5 — Fix and regression test

Write the regression test **before** the fix, but only if a **correct seam** exists — one
where the test exercises the real bug pattern as it occurs at the call site. If the only
available seam is too shallow, **that is itself the finding**: the architecture is
preventing the bug from being locked down. Say so.

Where a seam exists: turn the minimised repro into a failing test, watch it fail, apply
the fix, watch it pass, then re-run the Phase 1 loop against the original scenario.

## Phase 6 — Cleanup and post-mortem

- [ ] Original repro no longer reproduces
- [ ] Regression test passes, or the absence of a seam is written down
- [ ] Every `[DEBUG-...]` line removed (grep the prefix)
- [ ] `npx tsc --noEmit` and `npx vitest` both green
- [ ] The hypothesis that turned out correct is stated in the handoff, so the next
      session learns it

**Then ask: what would have prevented this?** If the answer is "a rule nobody enforced",
the fix is a test under `tests/`, in the shape of the three that already live there —
rules in an instructions file get violated by the next person in a hurry; rules with a
failing test do not. If the answer is architectural, write it into the handoff rather than
starting a refactor.
