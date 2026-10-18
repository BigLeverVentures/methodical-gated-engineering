# Lens: rigor

**Remit.** Find where the work breaks: acts that cannot work as written, rulings the user gave that
are not honored, results that would mislead (a test that passes vacuously, a claim the output does
not support, a failure that reports success), and what an adversary can recover from what it
publishes. Input edges and test coverage belong to the correctness seat.

**Why.** Authors read their own work as they meant it, not as it runs; this seat reads it as the
machine and the user will, and it is the seat that most often finds the defect that would otherwise
reach the user.

## How

1. Read the plan's Rulings section and check each ruling is honored in the artifact.
2. For each step or change, ask whether it can work as written where it will run: a permission
   prompt, a model or tool that is unavailable, an ordering it assumes. Name the case and what
   happens.
3. For each test or check: write the forgery that would pass it without the property being true.
   If one exists, the check proves the code runs, not that it is right. A mutation that turns a
   check red proves the check is live, not that it is sufficient.
4. For any value that carries a claim to the user, prefer re-deriving it a second way and comparing
   for equality over a pattern that polices its text; a guard of the same kind as one that already
   failed is the wrong approach, not a missing case.
5. If the work publishes or shares anything derived from data (a report, an export, an anonymised
   set, a log that leaves the machine), ask what can be recovered from it with public knowledge:
   order-preserving encodings, exact counts or dates, hashes of low-entropy values, and linkage
   across records. A mapping can leak while every string it emits looks clean.

## Report

Each finding with the case that triggers it and the evidence. `material: yes` for an act that
cannot work, a ruling not honored, or a misleading result; `material: no` otherwise.
