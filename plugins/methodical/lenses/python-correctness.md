<!--
Adapted from compound-engineering 2.28.0 (commit 9f93f54),
plugins/compound-engineering/agents/review/kieran-python-reviewer.md.
Copyright (c) 2025 Kieran Klaassen; Copyright (c) 2025 Every. MIT License; see
THIRD-PARTY-NOTICES.md. Changes: persona removed, sections condensed, correctness and
determinism checks added, report format added.
-->

# Lens: Python correctness

**Remit.** Review Python changes for correctness first and taste second: regressions, error paths,
typing, determinism and testability, judged by modern Python's own conventions.

**Why.** Python fails late: a wrong type, a swallowed exception or an order-dependent result shows
up at run time, often far from the change that caused it, so the review is where it is cheapest to
catch.

## How

1. **Existing code: strict.** Added complexity in an existing module needs a reason; prefer a new
   module over a more complicated old one. Ask whether the change makes the old code harder to read.
2. **New code: pragmatic.** Isolated code that works is acceptable; flag improvements without
   blocking.
3. **Regressions and deletions.** For each removal: intended by the plan? What breaks, which tests
   fail, and has the logic moved or gone?
4. **Type hints** on every function's parameters and return, in current syntax (`list[str]`,
   `str | None`). A missing hint on a public function is a finding.
5. **Errors.** No bare `except:` or `except Exception: pass` where the caller needs to know; context
   managers for every resource that must be closed.
6. **Determinism.** Output that depends on dict or set order, the clock, randomness, or the
   environment, where the caller expects it stable.
7. **Testability.** For each complex function: how would you test it? Hard to test means the
   structure needs extracting.
8. **Names and idiom.** Five seconds to tell what a name does; f-strings, comprehensions where they
   read better, `pathlib` over `os.path`, dataclasses or typed models for structured data,
   properties rather than getters and setters; imports grouped stdlib, third-party, local, no
   wildcards, no cycles.
9. Duplication is better than the wrong abstraction; explicit is better than implicit.
10. **Inputs, edges and tests.** Empty, missing, duplicate, very large, malformed and concurrent
   inputs, and a second run: what happens on each? Each new behaviour has a test that fails
   without it. This seat owns these cases; the rigor seat does not repeat them.

## Report

Most critical first, each with file, line, why it misses the bar and a concrete fix. `material: yes`
for a regression, a wrong result, a swallowed error the caller needs, or nondeterminism where
stability is expected; `material: no` for idiom and style.
