---
title: "Choose a complete settlement transition before mutating the ledger"
category: testing-patterns
date: 2026-10-15
symptoms:
  - "A late excessive completion made a previously settled ledger unreadable."
  - "A branch-order fix then ignored an envelope breach after a timeout."
root_cause: "Settlement callbacks were handled as ordered guards instead of transitions over persisted state and incoming usage."
tags: [ledger, settlement, state-machine, asynchronous-callbacks, adversarial-testing]
---

# Choose a complete settlement transition before mutating the ledger

## Symptoms

An asynchronous completion could arrive after a timeout or an earlier success. Handling an
excessive callback first changed a settled attempt into an uncertain hold while leaving its
settled amounts, violating reload validation. Moving terminal/uncertain checks earlier repaired
that case but let a later envelope breach on an uncertain attempt bypass the admission stop.

## Root cause

Branch order encoded two different decisions: whether accounting could change and whether new
evidence required stopping admission. An early return could preserve one invariant and miss
the other. Local transport completion also did not prove the upstream attempt had stopped.

## Fix and evidence

A pure `settlementDecision` selects duplicate, conflict, exceeded, hold, apply or invalid before
the transaction mutates state. Identical terminal usage is idempotent; conflicting usage stops
admission without rewriting the settled record. Every nonterminal state checks envelope breaches
before preserving an uncertain hold. Valid dispatched settlement applies its fields together.
The ledger recomputes prices from its frozen tariff rather than accepting caller quotes.

Uncertain attempts retain both worst-case reservations and concurrency slots: upstream work may
still be running. Timeout, cancellation and a late callback cannot silently restore capacity.

The current `bash tests/portable-core-proof.sh` verification passed 46 of 46 offline tests.
The ledger suite crosses all four states with input/output envelope breaches, checks duplicate
and conflicting completions, preserves a readable stopped ledger across restart, and rejects
new admission while an uncertain attempt occupies the only slot. This is synthetic proof
evidence; native/provider cap verification remains owed.

## Reuse

When callbacks race with timeout, cancellation or success, enumerate state × event outcomes
before editing guards. Decide the full transition first, apply it atomically, then test every
state against invalid input and late evidence, including persistence reload and next admission.

