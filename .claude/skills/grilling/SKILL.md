---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea until the design tree has no unvisited branches. Use when the user wants to stress-test their thinking, plan a feature before building it, or uses any 'grill' trigger phrase.
---

# Grilling

Interview relentlessly until you reach a shared understanding. Map it as a **design tree**:
every decision branches into the decisions hanging off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are
already settled — the questions you can ask *now* without guessing at answers you have not
heard yet. Ask the whole frontier in one round: number each question, and attach your
recommended answer to each. Then wait.

Format every question like this:

```
❓ **Q1** — **<question title>**: <body, possibly several paragraphs, possibly multiple choice>

➡️ <your recommended answer>
```

Each round of answers reshapes the tree: settled decisions push the frontier outward and
unblock what depended on them. Recompute the frontier, ask the next round. A question
whose answer depends on another question still open in *this* round belongs to a *later*
round.

**Finding facts is your job, never his.** When a frontier question needs a fact from the
environment — what a file contains, what version a package is on, what the SDK 54 docs
actually say — go and get it. Dispatch a sub-agent and don't block: a running exploration
is an unsettled prerequisite, so only the questions downstream of it wait. Ask the rest of
the frontier now. The **decisions** are his; put each one to him and wait.

## In this repo

- **Grilling produces plans, not code.** The house rule is that planning happens in
  conversation and building happens in Claude Code. A grilling session that starts editing
  files has stopped grilling.
- **Check each answer against the standing rules** in `AGENTS.md` and `plan.md` as it
  lands. When an answer would break a non-negotiable — arithmetic in the model, a JS tab
  bar, a light surface, an SDK bump — say so in the round it appears, not at the end.
- **Check each term against `CONTEXT.md`.** A frontier answer that uses a glossary word in
  a new sense is a domain question, not a design question — hand that branch to the
  `domain-modeling` skill and keep grilling the rest.
- **When the session settles something hard to reverse**, offer an ADR. Three tests, all
  of which must hold: hard to reverse, surprising without context, the result of a real
  trade-off.

The session is done when the frontier is empty — every branch visited, nothing silently
assumed. Do not act on the outcome until Sriman confirms you have reached shared
understanding.
