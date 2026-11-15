---
name: compound
description: "Write up each non-obvious problem a unit solved in docs/solutions/, index it, and update the resume point. Use after every unit's work review clears (it writes up what was non-obvious, if anything, then asks before merging unless the repo records a standing merge grant), and always when the user says \"compound\". With the argument checkpoint it writes up what is outstanding and the handoff without merging, so a compaction loses nothing. Compound step of the methodical loop. Not the same as compacting the context."
---

# Compound

Say `Step: compound` before anything else.

Compound writes down what was learned so the next unit starts ahead. An explicit request to compound
and compact uses checkpoint mode on the current branch, followed by the host's compact action.
Why: only a written-up solution is found by a later session before it re-solves a familiar problem;
a memory pointer alone is not the compound step.

## Two modes

- **Closure** is the default, a bare `/methodical:compound`, and the step after work review clears:
  everything under "What it produces" and "The merge ask", ending at the merge ask or a standing grant.
- **Checkpoint** uses the argument `checkpoint` or the adapter’s `checkpoint then compact` prefix. It is run from the offers before a compaction,
  from the question at a typed `/compact`, and by the compact skill. It writes up what is outstanding
  and the handoff on the current branch and stops: it never merges, never asks about a merge, never
  uses a standing grant and never closes the unit. Why: a compaction can come at any moment, and the
  unit is not finished then.

## Checkpoint

Do this instead of the rest of the skill for either checkpoint argument or an explicit request to
compound and compact together. It is one turn: it says what it did and never ends with a question.

1. **The counterfactual.** Could a later engineer redo this stretch's work from the final code, tests
   and docs alone? If so for all of it, write no solution file and say why in one line.
2. **Otherwise one write-up for each outstanding non-obvious problem of the stretch**, made and indexed
   as under "What it produces". Near the context limit write each concisely, and carry any lesson that
   cannot be written in full in the handoff. A worker may write the solution files; this thread reads
   their results and writes the handoff and the production checkpoint.
3. **Run all of the project's tests** now, before the handoff, unless you have read
   `${METHODICAL_ROOT}/reference/narrow-checks.md` and followed it for the checkpoint's files, printing each path beside the
   `narrow-check:` line it matched; a run without that printout is a full run. Why: finish verification before publication so its results are in the handoff.
4. **The handoff**: the compact skill's resume point (its shape, every ruling verbatim), in the place the
   user chose (`docs/resume.md`, or `docs/private/resume.md`, which stays uncommitted and is never
   force-added). Name that location in the handoff so recovery reads the right one. Commit the tracked
   files (write-ups, index, resume point) on the current branch; no push, no merge.
5. **Publish and verify, last.** Follow the finalization protocol and parent-authored Work template in
   `${METHODICAL_ROOT}/reference/native-routing.md`. Finish the resume point, verbatim rulings, lesson index,
   tests, commits and all relevant-state records first. Include the chosen resume file as the required
   `methodical:resume` capture; include required support at its original path. Derive the binding from the
   existing approved unit and current routing state. Write the Work input under `.methodical/evidence/`.
   The final tool call is the overlay's `checkpoint-finalize` runtime command. It publishes the production
   bundle and performs a read-only freshness check in that same invocation. Only its successful
   `methodical-checkpoint-finalized` receipt with `current: true` completes the handoff. A missing binding,
   unsupported runtime, failed command or stale result is an explicit unfinished checkpoint; never claim a pass.
   Make no tool call of any kind after successful finalization, chapter and task tools included.
   When the host adapter started this checkpoint with the `checkpoint then compact` prefix, say the handoff is written
   and end the turn. The adapter owns the requested compaction. For a standalone checkpoint or a host
   without automatic chaining, tell the user they can run the host's manual compact action.
   Why: a later write, commit, new ruling or routing transition makes the portable record stale.

If a compaction lands during a checkpoint, re-read the resume point, note "resumed after a compaction
boundary" in the handoff, and finish. If the unit solved nothing non-obvious, the checkpoint is still the
handoff and a verified production checkpoint.

## What it produces (closure)

1. **One write-up per non-obvious problem solved**, made from
   `${METHODICAL_ROOT}/templates/solution.md` into `docs/solutions/<category>/<slug>.md`. Reuse a
   category folder that already exists before making a new one.
2. **Its index line** in `docs/solutions/README.md`, as the template's last section gives it.
   Create the README with a one-line header and `## Index` if it is missing. Why: an unindexed
   write-up is not found.
3. **The resume point updated**, with this unit's rulings and the state in flight (the compact
   skill gives its shape). Before quoting the user, read
   `${METHODICAL_ROOT}/rules/user-words.md` and follow it.

Commit these on the unit's branch, which work-review left unmerged (or a short docs branch if the
unit is already merged), and run the tests as step 3 says. If the unit solved nothing non-obvious, say so in one
line and only update the resume point. After a waived plan, compound runs as usual; one line
saying nothing non-obvious was solved is the normal outcome.

Compound never offers to skip itself. If the user skips it, go to the merge ask.

## The merge ask, or a standing grant

Before any merge, whether the user's go or a standing grant gives it, run all of the project's tests on the branch's
HEAD, unless you ran all of them on that exact HEAD in this session. Why: a merge should rest on a full run of what
merges, and narrowing is for commits, not for merges; you cannot tell from memory whether an earlier commit was
narrowed.

Then look for a standing merge grant. From the repo root (`cd "$(git rev-parse --show-toplevel)"`),
run exactly:

```sh
grep -nE '^[[:space:]>*-]*(\*\*)?merge-grant: (standing|ask)\b' CLAUDE.md docs/rulings.md docs/private/rulings.md 2>/dev/null
```

It checks the repo's root `CLAUDE.md`, `docs/rulings.md` and `docs/private/rulings.md` for a line
that, after any list, quote or bold opener, starts `merge-grant: standing` (optionally followed by
` — <conditions>`) or `merge-grant: ask`. Read its printed lines, never its exit status: a missing
file makes grep exit non-zero even when another file matched.

- **Any `merge-grant: ask` line** → ask, as below. `ask` wins, so the user can take a grant back
  in their rulings file without editing `CLAUDE.md`.
- **Otherwise any `merge-grant: standing` line** → do not ask. Say
  "Merging on the standing grant at `<file>:<line>`: <the line>", honor every condition written
  after the dash as written, then merge and delete the branch. If you cannot verify a condition the
  line names (a check not completed and passing, a kind of session the line excludes), ask instead.
- **No line printed** → ask. Prose such as "merging at green is Claude's job" is never a grant.

Only the user writes a `merge-grant:` line. Never add, edit or infer one, and never turn their prose
into one, even when tidying a file. Why: a grant you wrote is a ruling they never gave.

A grant is written as a plain line or list item. The grep cannot see code fences, so these three
files never show the form inside one.

To ask, ask "Merge when green?" with AskUserQuestion and stop; this is the unit's one merge ask:
`options: "Merge when green (Recommended)" / "Hold"`. If you
record their answer, first read `${METHODICAL_ROOT}/rules/user-words.md` and follow it. Never
merge to `main` or delete the branch without their go or a standing grant; "merge it" in the
user's own words is the go. The grant covers this
merge ask only: plan approval, the North Star, money and irreversible acts still stop. Why: `main`
is the user's trunk; a standing grant is their ruling given once, and `ask` is how they take it
back. The write-up lands in the same merge as its unit.

The write-up is worker work: write it on the worker's row, or the decider's row when the plan's
`escalation:` is `lean` or `full` (Escalation in
`${METHODICAL_ROOT}/reference/seat-selection.md`), with that row's model and effort, or launch
it on one.

## When it hands on

Once merged, by the user's go or a standing grant, delete the branch in the same turn and return to
the user's next request; the loop starts again there. If the user requests compaction, say
`Step: compact` and run it in the same turn. The host owns automatic compaction and its
qualified Methodical adapter owns any proactive checkpoint offer. Why: a merge alone
does not establish that the session needs compaction.
