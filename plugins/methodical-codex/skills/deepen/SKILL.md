---
name: deepen
description: "Test a plan's risky assumptions by executing them, and fold the findings into the plan before review. Use when a plan in docs/plans/ meets the deepen triggers, its base commit is stale, or the user asks to deepen it. Deepen step of the methodical loop. Not for writing a plan or reviewing code."
---

# Deepen

Say `Step: deepen` before anything else, with the score that triggered it.

If the user skips it, go to plan-review.

## What it produces

One findings file per question, in `docs/plans/<plan-file-name-without-.md>/deepen/<question>.md`,
and a revised plan that folds them in. Each finding says whether it was **executed** (a command
was run, its output quoted) or only **read** (from docs or code). Why: a claim read from
documentation is a hypothesis; the point of deepening is to turn the ones the plan depends on into
facts.

## How

1. **List the questions.** Each trigger that scored becomes one or more questions the plan's
   correctness depends on: "does the parser see X?", "does the library behave like Y when Z?",
   "has this been solved in docs/solutions/?".
2. **Seat them.** Research seats run on the worker's row, or on the decider's row when the plan's
   `escalation:` is `lean` or `full` (Escalation in
   `${PLUGIN_ROOT}/reference/seat-selection.md`); the code-grounded and rigor seats that
   check the plan's claims against the code run on the decider's row. Each seat names its row's
   model and effort. Give each seat the plan's
   base commit, the sections it rules on, and what not to read whole; never forbid a seat from
   opening a file it needs. Why: a scoped brief spends judgment on the question, not on rereading
   the repo.
3. **Execute where you can**, in a scratch directory, never against the user's real configuration
   or data. If a check would cost money or cannot be undone, stop and ask with the native structured-question tool.
4. **Fold the findings into the plan** as a new revision: update the inventory, approach and tests;
   record what changed and why at the top. Update `base:` if the code moved; the plan stays
   `state: draft`.

## When it hands on

Say `Step: plan-review` and run `/methodical:plan-review` on the revised plan in the same turn.
