---
name: work
description: "Build an approved plan from docs/plans/ on its own short-lived branch, or a change the user said to make without a plan. Use when a plan reads state: approved and the user wants it built, when resuming such a build, or when the user has waived the plan for a named change. Work step of the methodical loop. Not when no approved plan exists and the user has not waived one (run the plan step), and not for reviewing finished work."
---

# Work

Say `Step: work` before anything else, and name the plan file being built (or "plan waived").

Build from a plan in `docs/plans/` whose front matter reads `state: approved`, or from the user's
own words in chat to build this change without one. Otherwise do not build: no plan, run the plan
step in the same turn; not yet reviewed, deepen if its triggers hold, then run plan-review; awaiting approval, ask "Approve this plan?"
with AskUserQuestion, as its own final call after the open-question answers are written into the plan, and stop. None of these is offered as a choice. Why: approval is the user's ruling that this plan gets built, and a waiver is the same ruling
given without a plan; only the user gives either.

**Plan waived.** No plan file; go straight to work. Branch as usual (branch hygiene is not waived unless the user says
so); the user's request, verbatim, is the approach and the acceptance test.

## The escalation line

The first `Step: work` of a unit says the level from the approved plan's `escalation:` line, with
the deepen score when the plan records it: `escalation: lean (deepen 3 of 6)`. It reads three cases
as `none`, each said as such: `escalation: none (plan waived)`, which gives no recommendation;
`escalation: none (no line)`, for a plan written before the line existed; and `escalation: none
(unknown value 'x')`.

At `lean` or `full` the same line gives one nonblocking recommendation, the first time in a session only:
"Session for this build: use the resolved host decider model and effort, if not already."
Read the actual values from the host profile; never copy a provider-specific alias into this common skill.
Model and effort are stated apart. The user's own settings win: never repeat it, block on it or force a change.
Keep it nonblocking; a later unit in the same session says nothing about it. It replaces the startup Offer in that line.
The build runs in the session, whatever it is; the worker row sets only the effort of worker seats.
Why: the session's model and effort stay the user's.

## Branch hygiene

`main` is the single trunk. Each unit gets one short-lived branch off `main`, named for the actual
work (not an aspirational end-state), and merged back and deleted once its work review clears, its
tests are green and the user says go. Never commit to `main` directly while a branch for the same
work is open; do not base a branch on another unmerged branch, or keep a long-lived integration
branch. Why: a branch that outlives its unit drifts from `main`, and the merge then hides what
changed.

## How

1. **Follow the plan's approach in order.** If the plan turns out to be wrong, make the smallest
   change faithful to its goal, record it as a deviation in the plan, and carry on; ask with AskUserQuestion only if the deviation
   would change what the user ruled. Why: small deviations are normal; silent ones are
   how a reviewed plan stops describing the code.
2. **Check the North Star after each act that changes behaviour**: a census seat (the census row's
   model and effort) compares the diff, the plan's rulings and its North Star statement, and answers "on course" or "drifted at <line>,
   because ...", quoting the statement line it measured against. Docs-only fixes skip it. Why:
   drift is cheap to correct one act in, and expensive after the review.
3. **Test, then commit.** Before every commit run all of the project's tests, unless you have read
   `${CLAUDE_PLUGIN_ROOT}/reference/narrow-checks.md` and followed it for this commit, printing each path beside the
   `narrow-check:` line it matched; a run without that printout is a full run. Then commit, then `git push -u origin <branch>`:
   the unit's branch, never `main`. A red test is fixed, not skipped. Red CI after the push: read the log, decide flake or
   real, fix, push again. Why: each
   commit is a point a later session or reviewer trusts as working; a skipped red test hides a break
   inside history that looks finished; a pushed branch survives the machine, so a unit whose review
   the user skips is still pushed.

## Owed verification

If an acceptance test needs real hardware, an environment this machine does not have (a phone, a
device, a cloud account), a live session or a time not yet come, do not leave a note in whatever file is open. Add an entry to the repo's
`docs/device-verification-queue.md`, creating it from
`${CLAUDE_PLUGIN_ROOT}/templates/device-verification-queue.md` if it is missing: the exact protocol
in order, what a pass proves, what a fail proves, and the cost. The unit is then **done,
owed**: it ships, but it is not done until the entry clears. Drain the queue at the next
natural moment the hardware is to hand, and before any archive or store build; a fail turns the
entry into a todo. Why: a note in a random file is never found again, and a cheap exact protocol
is one that actually gets run.

## When it hands on

When the plan's approach is done and the checks that ran pass, say `Step: work-review` and run
`/methodical:work-review` in the same turn. A test that can only run later (hardware, a live
session, a time not yet come) is recorded as owed (above) and does not hold the review. Never skip the work review on your own. Why: the author is the one person who cannot
see their own gaps, however careful the work. Never merge to `main` or delete a branch without the
user's go — compound asks for it once the write-up is on the branch, or a standing merge grant
(compound skill) gives it, and any merge first runs compound's full run of all of the project's tests. Why: `main` is the
user's trunk, and merging is their ruling point.
