---
title: "Proof scoring must keep candidate code outside the result channel"
category: testing-patterns
date: 2026-10-15
symptoms:
  - "A broken candidate could print a passing score and terminate the scorer."
root_cause: "Executing candidate code inside the trusted scoring process exposed its output channel and exit status."
tags: [evaluation, oracle, adversarial-testing, evidence]
---

# Proof scoring must keep candidate code outside the result channel

## Symptoms

A synthetic Python candidate used `os.write` to forge a passing JSON result and
`os._exit` to terminate before the independent checks ran. Freezing the scorer file
outside the actor repository did not protect the scorer's runtime authority.

## Root cause

The grader treated execution of arbitrary candidate Python as ordinary fixture evaluation.
A trusted file location and unchanged hashes did not make the executed candidate trustworthy.

## Fix and evidence

The trusted grader validates a restricted AST and evaluates only the small synthetic
language with restricted builtins. It rejects imports and unsupported syntax before execution.
This is a fixture-specific evaluator, not a general Python sandbox.

`bash tests/portable-core-proof.sh` passed 22 of 22 offline tests during proof verification.
The adversarial oracle test rejects forged stdout, modified public smoke checks and altered
trusted scorer files. Integrated report tests require complete run records, independent code
results, current candidate reviews and all-role measurements before reporting success.
Native host execution remains owed; these tests establish grader behavior only.

## Reuse

When an evaluator imports actor-controlled code, test whether that code can print the verdict,
exit the process or mutate the scorer. Constrain the evaluated language or establish real
process isolation, then test the complete report path as well as individual assertions.
