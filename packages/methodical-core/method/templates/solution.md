---
title: "<the lesson, stated as a claim>"
category: <folder under docs/solutions/, e.g. testing-patterns>
date: <YYYY-MM-DD>
symptoms:
  - "<what was seen first, as it appeared: an error line, a wrong number, a behaviour>"
root_cause: "<one sentence: why it happened>"
tags: [<searchable words>]
---

# <the lesson, stated as a claim>

## Symptoms

<What was observed, before anything was understood. Write it as someone would search for it later:
the exact error text, the command, the wrong output.>

## Root cause

<Why it happened. Name the mechanism, not just the line that changed.>

## Fix and evidence

<What was changed, and the executed evidence that it works: the command run, its output, the test
that now passes or the check that would have caught it. A claim that was only read, not run, says
so.>

## What did not work

<Approaches tried and dropped, each with the reason. Optional; skip it if nothing was tried.>

## Reuse

<When this applies again: the signs that a new problem is the same kind, and the first thing to do
when they appear.>

## Index line

Add this line under `## <category>/` in `docs/solutions/README.md`:

- [<slug>](<category>/<slug>.md) — <the lesson in one line, with the sign that it applies>
