---
title: "Recovery identity and evidence need separate contracts"
category: testing-patterns
date: 2026-10-16
symptoms:
  - "An opaque support label survived while its ignored bytes did not."
  - "A recovery status read created metadata before destination verification."
root_cause: "Repository equality, carried evidence, and pre-write eligibility were conflated."
tags: [checkpoint, evidence, identity, recovery, hooks]
---

# Recovery identity and evidence need separate contracts

An evidence label records a reference, not the referenced bytes. Preserve legacy labels as opaque
strings and require explicit, bounded local capture descriptors to claim portable support. Map each
logical reference to an immutable archive path and verify complete descriptor/hash/byte correspondence.
Relocation must not depend on the original source path still existing. External and unavailable
records remain limitations.

A destination starts clean even when the saved work was dirty. Validate archive shape and integrity
without reading destination work records; then check fixture identity, HEAD, branch, clean index and
worktree before any restoration write. After restoration, independently compare the saved bytes,
modes, deletions, index and record references. Use one identity encoding in both phases.

A read-only CLI is insufficient if its surrounding hook creates metadata first. Route only exact
standalone verification calls before mutating status reads, retain scoped authorization, and leave
compound/lookalike commands subject to ordinary observation. Test success and failure with complete
byte/mode/existence inventories, including an initially absent metadata directory.

The portable-core checkpoint and packaging suites exercise these offline invariants. Native ordering
and observer dispatch still require evidence tied to the exact package and surface. State equality
never establishes unrecorded conversational freshness.
