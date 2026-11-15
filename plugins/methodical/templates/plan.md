---
title: "<plan title>"
date: <YYYY-MM-DD>
state: draft            # draft → reviewed (plan review) → approved (only the user's yes)
base: <commit the plan was written against>
escalation: <none, lean or full>   # set once by the plan step from the deepen score and the named triggers
brainstorm: <path in docs/brainstorms/, or none>
---

# Plan — <plan title>

## North Star

<Quote the line of docs/north-star.md this unit serves. Then: how this unit moves toward it, in one
or two sentences.>

**Left short, on purpose:** <each gap this unit leaves, named, and why it is acceptable now.>

## Goal

<What is true when this unit is done, from the user's side.>

## Inventory

<Everything the unit touches or produces: each file, module, interface and document, with what
changes in it. A count or a "none found" that the plan relies on says how it was obtained.>

| Item | Change | Notes |
|---|---|---|
| <path or surface> | <new / changed / removed> | <why, risk> |

## Deepen score

<One line per deepen trigger from the always-on rules that holds, then the total.>

**Score:** <n> of 6 → <deepen / no deepen> <, plus "stale base" if it applies>

## Approach

<The steps of the work in order, each small enough to commit on its own once its checks pass.>

1. <step>

## Worker assignments

<For substantial implementation, name each worker by stable task ID. Record its routine
or demanding allocation, dependencies, isolated write scope, and acceptance check. State
the maximum safe parallelism and any concrete reasons for serial execution.>

| Worker | Allocation | Depends on | Writable paths | Acceptance |
|---|---|---|---|---|
| <task ID> | <routine / demanding> | <task IDs> | <scope> | <check> |

## Acceptance tests

Phrased as the person served would judge the result, not as "the machinery ran".

1. <test> — <how it is run, and what counts as a pass>

## Rulings

<Every ruling the user gives on this plan, verbatim, with its date.>

## Open questions

<Questions waiting on a ruling. Work continues on everything that does not depend on them.>
