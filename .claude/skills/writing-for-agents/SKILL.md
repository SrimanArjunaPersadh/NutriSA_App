---
name: writing-for-agents
description: Reference for writing any document an agent reads. Use when creating or editing a skill, or modifying AGENTS.md, CLAUDE.md, plan.md, or a doc reached by a pointer.
---

# Writing for Agents

Adapted from Matt Pocock's `writing-for-agents` (MIT). The packaging differs between a
skill, an `AGENTS.md` and a pointed-at doc; the writing does not. The same levers make
each one predictable — the agent taking the same *process* every run, not producing the
same output.

## The two loads

Every document and pointer spends one of two budgets:

- **Context load** — always-loaded material: an `AGENTS.md` line, a model-invoked skill's
  description. It spends tokens and attention on **every turn**, whether or not it fires.
- **Cognitive load** — the cost on Sriman: knowing which documents exist and when to reach
  for each. Not a cost to minimise to zero — it is the price of human agency. Spend it
  where his judgement matters, remove it where it does not.

Material behind a pointer escapes context load at the price of the pointer's own line.
`AGENTS.md` is the most expensive document in this repo by this measure, because it is
loaded in full on every turn of every session. Everything in it should be either a rule
that changes behaviour or a pointer — never a paragraph of reasoning.

## Context pointers

A **context pointer** names out-of-context material and encodes the condition for reaching
it. A skill's description is one; a line in `AGENTS.md` naming a doc is the same object.
The pointer's *wording*, not its target, decides when the agent reaches the material. A
must-have target behind a weakly worded pointer is a variance bug — sharpen the wording
first, and inline the material only if sharpening fails.

- **Front-load the leading word.** The pointer is where the triggering happens.
- **One trigger per branch.** Synonyms renaming one branch are one branch written twice.
- **Cut identity the body already carries.**

## Prompt the positive, not the negative

This is the lever with the most room in this repo. Steering by prohibition drags the
forbidden behaviour into context and makes it **more** available, not less — *don't think
of an elephant*, and the elephant is all there is. The negation is a weak modifier that the
strongly-activated concept overruns, so half the time the ban reads as an instruction.

`AGENTS.md` currently has a section titled "Do not, by default" containing ten
prohibitions. Every one of them names the banned thing and most name it more vividly than
the permitted alternative. Rewrite each as its target behaviour, and let the ban ride as a
short clause rather than the headline:

| Prohibition-first | Positive-first |
|---|---|
| "Do not `npm install` an Expo package" | "Install Expo packages with `npx expo install` — it holds versions to the SDK pin." |
| "Do not edit `android/` or `ios/` by hand" | "Native config changes go in `app.json` and config plugins; CNG regenerates the native folders." |
| "Do not use `StyleSheet.create` or inline style objects" | "Style with NativeWind `className`. Where a platform prop takes a value, read it from `src/design/tokens.ts`." |
| "Never run the app" | "Sriman runs Expo; Metro hot-reloads your edits into it. When you need to see a result, describe what to look at and ask." |
| "Do not run git" | "Report what changed and name the command; Sriman runs git." |

Keep a bare prohibition only as a hard guardrail you genuinely cannot phrase positively —
and even then pair it with the positive target so attention lands on what to do.

## Information hierarchy

A document is **steps** (ordered actions) and **reference** (facts consulted on demand),
mixed freely. The decision is where each piece sits on a ladder ranked by how immediately
the agent needs it:

1. **In-file step** — what the agent does, in order.
2. **In-file reference** — consulted on demand. A flat peer-set of rules on one rung is a
   fine arrangement, not a smell.
3. **Disclosed reference** — pushed into a separate file behind a pointer, loaded only
   when the pointer fires.

**Progressive disclosure** is the move down the ladder. The cleanest test is branching:
inline what every branch needs, push behind a pointer what only some branches reach.

**Sprawl** is the failure mode — a document too long even when every line is live. Attention
thins across the excess. `plan.md` at 39,000 words is past this line: it holds phases 0–12,
the standing rules, the design tokens, the open questions and the deferred backlog, and no
session needs more than one of those. Split by phase, keep the standing rules where they
are pointed at, and move the reasoning to ADRs.

## Steps and completion criteria

Every step ends on a **completion criterion** — the condition that says the work is done.
Two properties make it a lever:

- **Clarity.** Can the agent tell done from not-done? A vague bound invites **premature
  completion** — attention slipping to *being done*. Sharpen the bound first; only split
  the sequence if the bound is irreducibly fuzzy and you observe the rush.
- **Demand.** How much it requires. "Every modified surface has all four states" forces
  thorough work where "handle the states" does not.

The strongest criteria are both checkable and exhaustive.

## Leading words

A **leading word** is a compact concept already in the model's pretraining that the agent
thinks with while running the document — *tight*, *red*, *seam*, *tracer bullet*. Repeated
as a token, never as a sentence, it anchors a whole region of behaviour cheaply by
recruiting priors the model already holds. Coining your own works if you define it, but a
made-up word recruits nothing — you pay in definition tokens what a pretrained word gives
free.

Hunt for restatements a leading word retires: "fast, deterministic, low-overhead" → a
**tight** loop. "A loop you believe in" → the loop goes **red**.

This repo already has good ones worth using consistently everywhere: **engine**, **logging
day**, **the pin**, **the cascade**, **four states**.

## Pruning

- **Single source of truth.** One authoritative place per meaning, so a behaviour change is
  a one-place edit. Duplication costs maintenance and tokens and inflates a meaning's rank.
- **The environment is a source of truth too** — `package.json` scripts, `tsconfig.json`
  paths, the directory layout. A document restating it is a **cache**, and it earns its
  load only when the lookup is expensive. Cache the unwritten convention, the reason
  behind a choice, the gotcha no config confesses. Leave one-command lookups to the
  environment, where they cannot go stale.
- **Relevance.** Does the line still bear on what the document does? Without a pruning
  discipline the default fate is **sediment** — stale layers that settle because adding
  feels safe and removing feels risky.
- **Hunt no-ops.** An instruction the model already obeys by default pays load to say
  nothing. The test is model-relative: does it change behaviour versus the default? Settle
  disagreements by running the document, not by debate. When a sentence fails, delete the
  whole sentence rather than trimming words.

## Invocation, for skills

- **Model-invoked** — keeps a `description`, so the agent can fire it and other skills can
  reach it. Permanent context load, bought for discoverability. Write the description
  model-facing, carrying the trigger branches.
- **User-invoked** — `disable-model-invocation: true`. Only Sriman typing its name reaches
  it, and no other skill can. Zero context load, paid for in cognitive load — he becomes
  the index that must remember it exists. The `description` becomes human-facing: a
  one-line summary, trigger list stripped.

Pick model-invocation only when the agent must reach the skill on its own, or another
skill must. If it only ever fires by hand, make it user-invoked and pay nothing.
