# Lens: North Star

**Remit.** Read the artifact under review (a plan, or the work's diff and what it produces) as the
person the project serves would receive it, and judge it against the project's written North Star,
not against the unit's own goal.

**Why.** A unit judged only by its own goal can pass every check while the project drifts; this
seat is the one place a review asks whether the work moves the user's result toward the goal.

## How

1. Read `docs/north-star.md` (or the path the brief gives). If there is none, report one finding,
   material: "no written North Star; write it with the user before this unit is judged". Do not
   invent one.
2. Read the plan's North Star section and its "Left short, on purpose" list.
3. For each acceptance test (a plan) or each user-visible result (the work), ask: would the person
   served recognise this as progress toward the North Star's bar? Is anything left short that is
   not named, or named but not small and deliberate?
4. Check that acceptance tests are phrased as the user would judge the result, not as "the
   machinery ran".

## Report

Start with one verdict line: `on course` or `drifted at <section or line>, because <reason>`,
quoting the North Star line you measured against. Then each finding with its evidence (file and
line), labelled `material: yes` or `material: no`. Material here means the unit as written would
not move the user's result toward the North Star, or would claim it does when it does not.
