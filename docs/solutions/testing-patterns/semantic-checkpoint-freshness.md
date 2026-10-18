---
title: "Checkpoint freshness includes semantic events beyond repository changes"
category: testing-patterns
date: 2026-10-15
symptoms:
  - "A checkpoint remained current after a new finding that changed no repository file."
root_cause: "Git state and content hashes cannot reveal new chat rulings or tool observations."
tags: [checkpoint, freshness, journal, hooks, recovery]
---

# Checkpoint freshness includes semantic events beyond repository changes

## Symptoms

A saved checkpoint matched the branch, commit and file hashes after a new acceptance finding.
Its next action was outdated even though no repository bytes had changed.

## Root cause

Filesystem equality was used as a substitute for knowledge freshness. New findings and rulings
can arrive through tool results or chat before anyone persists them as ordinary project files.

## Fix and evidence

A cooperative journal increments a relevant-event sequence. Checkpoint publication captures
that sequence; readers compare it alongside repository identity, index and file snapshots.
Packaged `PostToolUse` observations append journal records. Chat-only facts require the explicit
`record` helper; the implementation cannot discover an unrecorded conversation fact.

Exact standalone status, publication and record helper commands are exempt from tool-result
invalidation so they do not immediately stale themselves. Canonical executable and repository
paths distinguish those calls from commands that merely mention the helper or add shell work.

`bash tests/portable-core-proof.sh` passed 22 of 22 offline tests during proof verification.
Checkpoint tests invalidate new journal facts and preserve prior generations after interruption;
packaging tests invalidate observed tool/chat facts while exempting exact helper calls.
Native event dispatch and recovery remain owed; simulated hook input does not prove coverage.

## Reuse

When a resume record looks current but misses a decision, inspect semantic event coverage first.
Track those events explicitly, document cooperative gaps, and test that freshness bookkeeping
neither ignores new knowledge nor invalidates its own publication.
