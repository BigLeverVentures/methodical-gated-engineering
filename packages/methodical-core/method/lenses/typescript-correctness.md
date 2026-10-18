<!--
Adapted from compound-engineering 2.28.0 (commit 9f93f54),
plugins/compound-engineering/agents/review/kieran-typescript-reviewer.md.
Copyright (c) 2025 Kieran Klaassen; Copyright (c) 2025 Every. MIT License; see
THIRD-PARTY-NOTICES.md. Changes: persona removed, sections condensed, async and
null-safety checks expanded, report format added.
-->

# Lens: TypeScript correctness

**Remit.** Review TypeScript changes for type safety, null-safety, async correctness and
maintainability, judged by modern TypeScript's own conventions.

**Why.** TypeScript's guarantees are only as strong as the escape hatches allow: one `any`, one
non-null assertion or one unawaited promise turns a compile-time error into a run-time one, and the
review is where those holes are visible.

## How

1. **Existing code: strict.** Added complexity in an existing module needs a reason; prefer a new
   module or component over a more complicated old one.
2. **New code: pragmatic.** Isolated code that works is acceptable; flag improvements without
   blocking.
3. **Regressions and deletions.** For each removal: intended by the plan? What breaks, which tests
   fail, and has the logic moved or gone?
4. **Type safety.** No `any` without a comment saying why; no `as` casts or `!` assertions that
   paper over a real possibility of `undefined`. Prefer inference where it is correct, discriminated
   unions and type guards for variants, `satisfies` to check without widening.
5. **Async.** Every promise awaited, returned or deliberately handled; no unhandled rejections; no
   race between a stale response and a newer one.
6. **Testability.** For each complex function: how would you test it? Hard to test means the
   structure needs extracting.
7. **Names and modules.** Five seconds to tell what a name does; named exports over default
   exports; imports grouped and explicit; immutable updates over mutation.
8. Duplication is better than the wrong abstraction; do not optimise before it is measured.
9. **Inputs, edges and tests.** Empty, missing, duplicate, very large, malformed and concurrent
   inputs, and a second run: what happens on each? Each new behaviour has a test that fails
   without it. This seat owns these cases; the rigor seat does not repeat them.

## Report

Most critical first, each with file, line, why it misses the bar and a concrete fix. `material: yes`
for a regression, a type hole that can reach run time, or an unhandled async path; `material: no`
for idiom and style.
