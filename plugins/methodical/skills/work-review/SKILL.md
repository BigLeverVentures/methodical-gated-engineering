---
name: work-review
description: "Review a finished build on its branch against its plan, with reviewer seats matched to the code's language, before it merges. Use when the work step's tests pass and the plan's approach is done, or when the user asks for a review of a branch's changes. Work-review step of the methodical loop. Not for reviewing a plan."
---

# Work review

Say `Step: work-review` before anything else, and name the plan and the branch under review.

Never skip it on your own. Why: the author is the one reader who cannot see their own gaps, however careful
the work, and this is the last look before the user's trunk. If the user skips it, commit and push the
branch, then go to compound.

## How

1. **Read `${CLAUDE_PLUGIN_ROOT}/reference/seat-selection.md`.** Why: it is not in context until
   read, and the seats, models, brief and round rules all come from it.
2. **Fix the range.** The base is the plan's `base:` if it resolves to a commit, otherwise
   `git merge-base main HEAD`. The diff range is `<base>..HEAD`. On a re-review, the base is the
   commit the last review saw, so the seats read only what changed since.
3. **Run all of the project's tests** first, whatever the repository's `narrow-check:` lines say. A red test is fixed
   before any seat launches. Why: a seat's time is wasted on a build that does not pass, and a narrowed run is never
   the one a review trusts.
4. **Run the round per seat-selection.md**, with the diff as the artifact and, in the brief, the
   plan's acceptance tests and rulings, or the user's request verbatim and "plan waived" when there
   is no plan. A trivial diff (seat-selection.md, Trivial diffs) gets one seat; after each fix run all of the project's tests, then commit; a fix commit in the review never narrows. Then print the seat
   lines. At `full`, the plan's `escalation:` line puts the code-grounded, rigor and correctness
   seats on the backstop's row (Escalation, in the same file).
5. **At `lean` or `full`, run the backstop review** once the round clears, its fixes are committed
   and the tests are green: the rigor lens on the backstop's row over `<plan base>..HEAD`, its seat
   line naming the candidate commit it saw. A material finding is fixed and committed, then the
   touched lenses and the backstop re-run on the new candidate, until none remains. The one
   push (below) follows the last pass. Why: the extra look is worth its price only on the commit that will merge.

## When it hands on

When the round has cleared (at `lean` or `full`, after the backstop review in step 5) and every test passes, commit, then `git push -u origin <branch>`:
every unit, the branch only, never `main`. Why: a reviewed branch that lives on one machine is
lost with it, and the merge ask then names something the user can see. A material finding is fixed and re-reviewed in the same turn. Then say `Step: compound` and continue with the
compound skill on this branch in the same turn; do not merge yet. Never merge to `main` or delete the branch without
the user's go — compound asks for it, or a standing merge grant (compound skill) gives it. Why: the write-up then merges with the unit it describes,
and the user is asked once.
