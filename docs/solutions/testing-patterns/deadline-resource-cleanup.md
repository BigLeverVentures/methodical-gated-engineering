---
title: "A deadline must close the resource it bounds"
category: testing-patterns
date: 2026-10-15
symptoms:
  - "Dripping headers extended a request lifetime; expired work retained live sockets or child processes."
root_cause: "Timeouts reported cancellation without owning resource teardown and joining its completion."
tags: [deadlines, cancellation, sockets, child-processes, cleanup]
---

# A deadline must close the resource it bounds

## Symptoms

Dripping headers survived. A wall timer reported a stop without closing its socket. A helper that ignored SIGTERM survived its timeout, and interrupting the runner could orphan its synthetic target.

## Root cause

An idle timeout measures silence, so incoming bytes reset it. Resolving a stop promise or sending a signal proves neither socket closure nor process exit. Default signal termination can bypass asynchronous cleanup.

## Fix and evidence

Start an absolute acceptance deadline when the socket connects; destroy active sockets at read or wall expiry. Own helper and target handles, escalate TERM to KILL, and join exits. Propagate interruption through cancellation and use shell `exec` to preserve signal delivery.

The regression `absolute acceptance and wall deadlines close dripping or unfinished headers` observes actual socket closure. `timeout and cancellation reap a synthetic helper even when it ignores TERM` verifies process disappearance; preflight cancellation joins helper and target. Proof and repository tests passed. Staged host preflights remained inconclusive at the task-port positive control; they establish no native policy qualification.

## Reuse

Identify each deadline's resource and assert its disappearance after timeout and cancellation. Include activity that resets idle timers and a child that ignores graceful termination.
