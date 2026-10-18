---
name: plan-review
description: "Review a plan in docs/plans/ with reviewer seats matched to the project's language, before the user approves it. Use when a plan has just been written or deepened, when a plan was revised after review, or when the user asks for a plan review. Plan-review step of the methodical loop. Not for reviewing built code."
---

# Plan review

Say `Step: plan-review` before anything else, and name the plan file under review.

Plan review always runs, follow-ups and small plans included, unless the user waives it. Why: the author is the one reader
who cannot see the plan's gaps, and a gap found in a plan costs a sentence; found in code, a rework. A waived
plan waives its review too. If the user skips only the review,
then ask "Approve this plan?" with AskUserQuestion, after any open questions, as below, unless approval is no longer owed: if the same words said to build it, ask once, with AskUserQuestion, only the unanswered open questions that change what gets built, record the rest in the plan as "unanswered, left short", record those words verbatim as the approval, set `state: approved`, commit, and go to `Step: work`.

## How

1. **Read `${METHODICAL_ROOT}/reference/seat-selection.md`.** Why: it is not in context until
   read, and the seats, models, brief and round rules all come from it.
2. **Fix the base.** The base commit is the plan's `base:`. If `HEAD` has moved past it on files
   the plan touches, say so: a stale base is a deepen trigger, so go back to `Step: deepen` first.
3. **Run the round per seat-selection.md**, with the plan file as the artifact under review and the
   plan's `escalation:` line selecting the seats (Escalation, in the same file), then print the seat
   lines.

## When it hands on

A material finding is fixed and re-reviewed in the same turn. When the round has cleared, set the plan's front matter to `state: reviewed` and commit it. Then
put the plan's open questions to the user with AskUserQuestion (at most 4 per call, highest impact
first, recommended answer first) and write every answer into the plan body, the non-recommended
ones included; if an answer changes the approach, revise and re-review first. Only then ask
"Approve this plan?" with AskUserQuestion, as its own final call, never in the same call as the open
questions:
`options: "Approve (Recommended)" / "Revise"`
and stop. Why: an approval clicked in the same call as the questions starts the build on
unresolved questions. Before writing their answer into the
plan's Rulings section, read `${METHODICAL_ROOT}/rules/user-words.md` and follow it. On their yes,
record it verbatim, set `state: approved`, commit, say `Step: work` and continue with the work
skill in the same turn. On anything else ("Revise" or typed text), record it verbatim and revise the plan. Why: a reviewer can say a plan is sound,
but only the user rules that it gets built; that stop is what makes the method gated.
