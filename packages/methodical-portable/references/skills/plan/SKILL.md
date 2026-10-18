---
name: plan
description: "Write the plan file in docs/plans/ that code changes get before building, unless the user has said to build without one. Use when the user asks to build, fix, edit or change code and docs/plans/ has no approved plan for it, or when a plan must be revised after review. Plan step of the methodical loop. Not for questions or reading code, and not when the user has waived the plan for this change (go to work)."
---

# Plan

Say `Step: plan` before anything else.

## What it produces

`docs/plans/<YYYY-MM-DD>-<slug>.md`, made from `${METHODICAL_ROOT}/templates/plan.md`, with every
section filled or explicitly marked "none".

The plan's `base:` is the commit it was written against. Why: a reviewer can only check a plan
against the code it was written for, and a stale base is itself a reason to deepen.

The plan is a deciding seat, written on the decider's row, which stays the decider's row at every
escalation level. If this session runs on another model, launch a `general-purpose` Agent with the
decider's model and effort to draft it, and give that seat the base commit and the brainstorm. If that launch fails, follow the re-seat ladder in
`${METHODICAL_ROOT}/reference/seat-selection.md`.

## How

1. **Take the inventory from the code, not from memory.** Every file, module, interface and
   document the unit touches, with what changes.
2. **Look for prior art** in `docs/solutions/` and name what applies.
3. **Score deepen against the always-on rules' triggers**, fill the Deepen score section, and say
   the score aloud ("Deepen score: 3 of 6, deepening; escalation: lean"). Below 2, run it anyway
   if it would help, and say why. Why: saying the score lets the user overrule it.

   **Set the escalation level.** This step computes the line once and writes it as `escalation:` in
   the front matter: `full` at a score of 4 or more, `lean` at 3 or at a named trigger
   (Escalation in `${METHODICAL_ROOT}/reference/seat-selection.md`), otherwise `none`. The
   Deepen score section records which trigger set the level, with its evidence. If the user edits
   the line before approving, the user's edit stands and is recorded as a ruling; a deepen or
   review revision recomputes only when no such edit is recorded. Work reads the approved plan's
   line. Why: the level is decided where the risk is known, and the user's edit outranks the
   computation.
4. **Write acceptance tests the person served would recognise**, each with how it is run and what
   counts as a pass.
5. **Record rulings** in the Rulings section as they are given, after you read
   `${METHODICAL_ROOT}/rules/user-words.md` and follow it.
6. **Commit the plan.** If the repo is on `main`, first create the unit's branch (see the work
   skill), so the plan and its work merge together.

## When it hands on

- Score 2 or more, or a stale base: say `Step: deepen` and continue with the deepen skill in the same turn.
- Otherwise: say `Step: plan-review` and run `/methodical:plan-review` in the same turn.

Leave the plan at `state: draft`. Plan review sets `reviewed`. The question
"Approve this plan?" comes next: plan-review asks it with AskUserQuestion, as its own final call
after the open-question answers are in the plan; record their answer in Rulings, and set `state: approved` only on their yes. Why: the user,
not a reviewer, rules that a plan gets built; that stop is what makes the method gated. Open
questions wait for their ruling while everything that does not depend on them continues.
