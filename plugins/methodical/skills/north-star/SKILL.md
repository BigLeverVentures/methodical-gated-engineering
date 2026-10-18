---
name: north-star
description: "Make sure the project has a written goal in docs/north-star.md, then state how the current unit moves toward it. Use after a brainstorm and before a plan, or when substantial work is requested in a repo with no docs/north-star.md. North-star step of the methodical loop. Not to rewrite an existing one unasked."
---

# North Star

Say `Step: north-star` before anything else.

Use the North Star at the start of every unit, not only at review. Why: units judged only against
their own goal can each pass while the project drifts; stating the goal up front steers each plan
before work is spent on it.

## Mode 1 — the project has no `docs/north-star.md`

Write it **with the user**, before any plan.

1. Start from `${CLAUDE_PLUGIN_ROOT}/templates/north-star.md`.
2. Draft only what the repo and the conversation already show, mark every guess as a guess, and ask
   the user to rule on who it serves, what they receive and the bar. Batch the questions into one AskUserQuestion call (at most 4; the rest in a
   second call), with a recommended answer first for each. Why: a goal the user did not choose will be overruled later,
   after work has been built on it.
3. Write `docs/north-star.md` once the user has ruled, link it from the repo's `CLAUDE.md` (create a
   one-line one if there is none), and commit. Why: a North Star nobody's session can find does not
   steer anything.

This is a stop for the user's ruling, by design. If they decline to write one now:
record that in the plan's "Left short, on
purpose" and continue.

## Mode 2 — `docs/north-star.md` exists

Write the unit's statement in the shape of the plan template's North Star section. Do not interrupt: ask with AskUserQuestion only if the statement would change what the North Star means. Why: that is their goal to
change, not the unit's.

When a design choice comes up anywhere in the loop, prefer the option that moves toward the North
Star, and say so. A unit that meets its own goal but not the North Star is not done; say that
plainly rather than reporting success.

## When it hands on

Say `Step: plan` and continue with the plan skill in the same turn, carrying the statement into
the plan.
