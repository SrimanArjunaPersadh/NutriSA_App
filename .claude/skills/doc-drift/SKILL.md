---
name: doc-drift
description: Audit the repo's instruction documents against each other and against the code, and fix the contradictions. Use before starting a branch, after finishing a phase, or when two documents seem to disagree about the same fact.
disable-model-invocation: true
---

# Doc Drift

`AGENTS.md`, `plan.md`, `CONTEXT.md`, `docs/adr/`, the docblocks, and the code are six
places that describe one system. When two of them disagree, every session that reads the
wrong one wastes its work — and an agent that finds a contradiction will pick a side
silently, which is worse than being told nothing.

The last audit found twelve live contradictions, including `AGENTS.md` calling Native Tabs
"unverified" against a `plan.md` open question that closes it as verified, and `plan.md`
Phase 11 saying eleven tables do not exist while Phase 1 of the same file records them
live in Neon. Both were true when written. Neither was true when read.

Run this on a clean working tree, before a branch and after a phase.

## The precedence ladder

When two sources disagree, the lower-numbered one is the fact and the higher-numbered one
is the stale copy — **unless** the higher one names a decision the lower one has not
caught up to, which is the one case that goes to Sriman rather than being fixed in place.

1. **The code and its tests.** What runs is what is true.
2. **`docs/adr/`.** A recorded decision, with its reason.
3. **`CONTEXT.md`.** The canonical name for each concept.
4. **`AGENTS.md`.** Standing rules — always loaded, so always the most expensive to be
   wrong.
5. **`plan.md`.** The phase plan. Written ahead of the work, so the most likely to be
   stale.
6. **Docblocks and comments.** Written once, beside code that later moved.

## Process

### 1. Build the claim list

Extract every **checkable factual claim** from `AGENTS.md` and `plan.md` — a claim that a
command, a file read, or a grep can settle. Ignore intent and rationale; they are not
checkable and not what drifts.

Three kinds are worth extracting, because all three have drifted before:

| Claim kind | Example | How to check |
|---|---|---|
| **Existence** | "shared zod schemas live in `packages/shared/`" | does the path exist |
| **State** | "all 11 tables are live in Neon"; "Phase 3 shipped" | read the schema; read the checklist ticks |
| **Naming** | "the Background token"; "keys are `pro`, `carb`, `fat`" | grep the implementation |

### 2. Check each claim

Run the check. Record the verdict as **holds**, **stale**, or **unsettleable**. Do not fix
anything yet — a fix mid-sweep re-anchors the rest of the sweep on the thing you just
wrote.

Check claims against each other too, not only against code: a claim in `AGENTS.md` and its
counterpart in `plan.md` are two claims, and the interesting failure is when they differ.

### 3. Report before fixing

Present a table — claim, where it lives, what the check found, which source wins by the
ladder. Then stop. Sriman decides which are drift to correct and which are a decision the
docs have not caught up to; those two look identical from inside the repo and only he can
tell them apart.

### 4. Fix by removal first

For each confirmed drift, in this order of preference:

1. **Delete the duplicate.** Two documents stating one fact is the disease; correcting
   both is treating the symptom. Keep the copy that sits lower on the ladder, and replace
   the other with a pointer to it.
2. **Move the reasoning to an ADR** and leave one pointer line behind. A paragraph of
   justification in `AGENTS.md` is paid for on every single turn of every session; in
   `docs/adr/` it is paid for only when read.
3. **Convert the rule to a test** where it is mechanically checkable. `tests/` already
   holds three of these — `tokens.test.ts`, `no-hex-literals.test.ts`,
   `engine-purity.test.ts`. A rule with a failing test cannot drift; a rule in prose drifts
   the first time someone is in a hurry. This is the strongest fix available and should be
   reached for whenever the claim is checkable by a script.
4. **Correct the text** — last resort, because it will drift again.

### 5. Re-run the checks

Every claim you touched now holds, and `npx vitest` is green.

## Done when

- Every extracted claim has a verdict.
- Every confirmed drift is either deleted, moved behind a pointer, converted to a test, or
  corrected — and the choice is recorded in the report.
- No fact appears in two documents without one of them being a pointer.
- The claims that could not be settled from inside the repo are listed for Sriman, with
  what each would need to settle it.
