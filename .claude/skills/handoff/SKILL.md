---
name: handoff
description: Compact the current session into a branch handoff document so the next session picks up cold without re-reading plan.md.
disable-model-invocation: true
argument-hint: "What will the next session work on?"
---

# Handoff

`AGENTS.md` says: *one feature per branch, one fresh session per branch. At the end of a
session, stop and hand off.* This skill is the artifact that instruction assumes.

Write the handoff to `.scratch/handoffs/<branch-name>.md`. That directory is gitignored —
a handoff is session state, not repo state, and it must never reach a commit.

## What goes in it

```md
# Handoff — <branch-name>

## Where this stopped
<Two or three sentences. The last thing that worked, the last thing that didn't.>

## Files touched
<Path, and one line on what changed in it. No diffs — the working tree holds those.>

## The next concrete action
<One action, specific enough to start on without a decision. Not "continue the feature".>

## Decisions made this session
<Only decisions that are not yet written down anywhere. A decision already in an ADR,
CONTEXT.md, or plan.md gets a path, not a restatement.>

## Open questions for Sriman
<Questions only he can answer — device behaviour, design calls, anything needing the
running app. Number them.>

## Verification state
- [ ] `npx tsc --noEmit` — <pass / fail / not run>
- [ ] `npx vitest` — <pass / fail / not run>
- [ ] Seen on device — <what he confirmed, or "not confirmed">

## Suggested skills for the next session
<Which of the repo's skills the next agent should invoke first, and why.>
```

## Rules

- **Reference, never restate.** A spec, an ADR, `plan.md` phase, a commit — link the path.
  A handoff that duplicates `plan.md` goes stale against it within a day, and then there
  are two contradicting sources of truth instead of one.
- **Redact.** No `.env` values, no Clerk keys, no Neon connection strings, no Sentry DSN,
  no weight or macro values from real data. The handoff becomes the next agent's prompt.
- **Suggest the next branch name, do not create it.** Git is Sriman's to run.
- **Verification state is honest.** "Not run" is a valid answer and a useful one. A handoff
  that claims green when the suite was never run costs the next session an hour.

## Done when

The file exists at `.scratch/handoffs/<branch-name>.md`, the next concrete action is
specific enough to begin without asking anything, and every open question is one only
Sriman can answer.
