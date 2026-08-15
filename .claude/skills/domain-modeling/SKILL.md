---
name: domain-modeling
description: Build and sharpen this project's domain model. Use when discussing codebase terminology, naming a new concept, writing or editing CONTEXT.md, or recording an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design — challenge terms,
invent edge-case scenarios, and write the glossary and the decisions down the moment they
crystallise. Merely *reading* `CONTEXT.md` for vocabulary is not this skill; any skill can
do that in one line. This is for when you are **changing** the model.

## Why this repo needs it

The repo snapshot found the model drifting in two directions at once. `plan.md` calls the
design tokens Background, Green and Red; `tailwind.config.js` implements `ground`, `ok`
and `danger`. `macros.ts` documents keys — `pro`, `carb`, `fat` — that the type it
describes does not have. Neither is a bug in code; both are the same bug in language, and
they cost every session the time it takes to work out which word means which thing.

## File structure

```
/
├── CONTEXT.md              ← the glossary. One file. Nothing else lives here.
├── docs/
│   └── adr/
│       ├── 0001-expo-sdk-pinned-to-54.md
│       └── 0002-engine-holds-all-arithmetic.md
├── packages/engine/
└── src/
```

Create both lazily — `CONTEXT.md` when the first term resolves, `docs/adr/` when the first
ADR is needed.

## During a session

**Challenge against the glossary.** When a term conflicts with what `CONTEXT.md` already
says, call it out immediately: "the glossary defines *logging day* as the
Africa/Johannesburg calendar day from `currentLoggingDay()`, but you seem to mean the
device's local day — which is it?"

**Sharpen fuzzy language.** Propose a canonical term for anything overloaded. *Target*,
*goal* and *macro target* are three words in this codebase; find out whether they are one
concept or three, and if one, pick the word and list the others under `_Avoid_`.

**Stress-test with scenarios.** When a relationship is under discussion, invent the
concrete edge case that forces precision. "A meal logged at 00:30 on a seitan day — which
logging day does it belong to, and which day's sodium flag does it trip?"

**Cross-reference with code.** When Sriman states how something works, check whether the
code agrees, and surface the contradiction when it doesn't. This is the check that would
have caught the `macros.ts` docblock.

**Update `CONTEXT.md` inline.** The moment a term resolves — not batched at the end. Use
[CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` is a glossary and nothing else. No implementation detail, no spec, no scratch
notes, no roadmap. Those have homes already — `plan.md` and `docs/adr/`.

## Offer ADRs sparingly

Only when all three hold:

1. **Hard to reverse** — changing your mind later costs real work.
2. **Surprising without context** — a future reader will ask "why on earth this way?"
3. **The result of a real trade-off** — there were genuine alternatives.

Miss any one, skip it. Format in [ADR-FORMAT.md](./ADR-FORMAT.md).

Decisions in this repo that already meet all three, and that currently exist only as
prose buried in a 39,000-word plan: the SDK 54 pin (and the SDK 57 revert that proved it),
zero arithmetic outside the engine, Native Tabs over JS tabs, `user_id` derived
server-side only, Neon over the previous Supabase, and OCR photos never touching
ImageKit. Each is one paragraph in `docs/adr/` and one line in `AGENTS.md` — which is a
strictly cheaper way to hold them than the paragraphs they occupy today.
