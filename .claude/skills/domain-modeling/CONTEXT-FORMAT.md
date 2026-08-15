# CONTEXT.md format

## Structure

```md
# NutriSA

A nutrition tracker for one user today and the South African market later. This file is
the project's glossary — the canonical word for each concept, and the words to avoid.

## Language

**Logging day**:
The Africa/Johannesburg calendar day a log entry belongs to, produced by
`currentLoggingDay()`. The only day authority in the system.
_Avoid_: date, today, day key

**Engine**:
The pure-TypeScript module under `packages/engine/` holding every computed number.
_Avoid_: calculator, core, lib, utils

**Target**:
The macro or calorie number the user is aiming at for a logging day.
_Avoid_: goal, macro goal
```

## Rules

- **Be opinionated.** Where several words exist for one concept, pick one and list the
  rest under `_Avoid_`. That list is what makes the file bite — it is the thing an agent
  checks a new name against.
- **Keep definitions tight.** One or two sentences. Define what it *is*, not what it does.
- **Only project-specific terms.** General programming concepts do not belong here even
  where the project leans on them heavily. Before adding a term, ask whether it is unique
  to NutriSA or just unique to software.
- **Group under subheadings** when clusters emerge — Nutrition, Time, Data, Design. A flat
  list is fine while the file is short.
- **Names in the code win ties.** Where `plan.md` and the implementation disagree on a
  name, the implementation is the fact and the plan is the stale copy. Record the code's
  name, put the plan's under `_Avoid_`, and fix the plan in the same session.
