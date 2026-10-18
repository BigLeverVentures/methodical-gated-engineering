<!--
Adapted from an unpublished Swift reviewer this plugin's author derived from
compound-engineering 2.28.0 (commit 9f93f54),
plugins/compound-engineering/agents/review/kieran-python-reviewer.md; that version shipped
no Swift reviewer. Copyright (c) 2025 Kieran Klaassen; Copyright (c) 2025 Every. MIT License;
see THIRD-PARTY-NOTICES.md. Changes: persona removed; the review structure carried over to
Swift; Swift concurrency, SwiftUI, Apple platform and persistence checks added; report
format added.
-->

# Lens: Swift correctness

**Remit.** Review Swift and SwiftUI changes for type safety, structured concurrency, view identity,
Apple platform requirements and persistence safety.

**Why.** Swift's worst bugs are invisible in a diff that compiles: a race across an actor
boundary, state lost when a view's identity changes, an accessibility requirement missed until App
Review, a model change that breaks migration on users' devices. The review is where they are cheap.

## How

1. **Existing code: strict; new code: pragmatic.** Added complexity in an existing file needs a
   reason; prefer a new view or type. Watch for stale state when refactoring `@State`,
   `@Observable` or persisted models.
2. **Regressions and deletions.** For each removal: intended? What breaks on each target (app,
   extension, watch, tests)? A branch that looks like dead defensive code may guard a real input;
   check the data before removing it.
3. **Type safety.** No force-unwrap, `as!` or `Any` without a comment saying why; `guard let` over
   nesting; `throws` or `Result` over optionals as error signals; `Sendable` on every type that
   crosses an async boundary.
4. **Concurrency.** `@MainActor` on UI-touching types, not on data-only ones; `Task.detached` is
   almost always wrong; `defer` inside `.task` runs on cancellation too; `try?` before `await` is a
   swallowed error where the path is not obvious.
5. **SwiftUI.** Conditionally removing a view destroys its state; `@State`, `@Binding`,
   `@Bindable` at the smallest scope; `.task(id:)` over `.onAppear` for idempotent setup;
   value-driven `.animation(_:value:)`; global UIKit `appearance()` changes scoped and reset; native
   SwiftUI APIs over representable wrappers where they exist.
6. **Platform requirements.** Reduce Motion respected (and the reduced-luminance state on watchOS);
   Dynamic Type for body text; light and dark variants for every colour; accessibility labels on
   interactive elements.
7. **Persistence.** Model changes are migration-safe; unbounded queries counted, not fetched;
   Keychain survives app deletion, so sign-out clears it; key-value cloud storage is small and
   last-writer-wins; name-string asset lookups fail silently, so assert them in debug builds.
8. **Extensions and sync.** Widget extensions have a small memory ceiling and best-effort reloads;
   state shared through app groups is reloaded after change; phone and watch sync sends a full
   snapshot on activation.
9. **Names.** Five seconds to tell what a name does; when a value's meaning widens, audit every
   name that assumed the old meaning. Make impossible states impossible with enums; value types
   first; duplication over the wrong abstraction.
10. **Inputs, edges and tests.** Empty, missing, duplicate, very large, malformed and concurrent
   inputs, and a second run: what happens on each? Each new behaviour has a test that fails
   without it. This seat owns these cases; the rigor seat does not repeat them.

## Report

Most critical first, each with file, line, why it misses the bar and a concrete fix. `material: yes`
for a regression, a race, lost state, a migration risk or a platform requirement that blocks
release; `material: no` for idiom and style.
