---
title: "Live approval must freeze resource profiles and finite exposure evidence"
category: testing-patterns
date: 2026-10-15
symptoms:
  - "An approved batch could retain its identity while resource or overshoot assumptions changed."
root_cause: "Manifest approval alone did not bind the profile and native capability evidence used to justify exposure."
tags: [budget, approval, provenance, capabilities, native-verification]
---

# Live approval must freeze resource profiles and finite exposure evidence

## Symptoms

A batch manifest named request limits, but approval did not freeze all assumptions behind them.
Changed model profiles or cancellation overshoot could change exposure after approval.

## Root cause

The readiness decision depended on profile and cancellation evidence that could change
independently of the approved manifest. Configuration, limit enforcement and cancellation
are distinct capabilities requiring evidence.

## Fix and evidence

Strict validation checks capability flags, limit types, unique host records and trusted evidence.
The batch freezes each `profileHash`; approval binds the exact manifest and `capabilitiesHash`.
Each participating host must have verified isolation, settings control, qualified limits,
cancellation and a finite `maximumOvershootTokens`. Changed evidence requires new approval.

`bash tests/portable-core-proof.sh` passed 22 of 22 offline tests during proof verification.
Budget tests reject changed profiles, enlarged or unknown overshoot, string-valued flags,
untrusted evidence and stale approval. The live entry point validates readiness only;
it does not launch a model session. Native bounds and cancellation remain owed, so unknown
native exposure keeps live execution blocked despite the offline tests passing.

## Reuse

Before a paid or scarce-resource experiment, bind approval to the execution manifest and the
evidence establishing its bounds. Preserve unknowns explicitly. A proposed cap becomes usable
only when the selected native surface can enforce or qualify its finite exposure.
