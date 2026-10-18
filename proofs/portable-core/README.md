# Portable Methodical first proof

Status: offline implementation; native live acceptance pending. This is an isolated proof,
not a replacement release of the production Claude Code plugin.

One shared core defines gated engineering, guidance-based adaptive allocation and compound/compact
recovery. Adapters supply host manifests, invocation instructions, hooks and receipt normalization.
Both native packages contain identical core content and canonical reviewer lenses. The same builder
also emits portable/methodical/, an instruction-only Agent Skill using the identical canonical method. Published
platform guidance is the baseline; the dated profiles distinguish quotations/paraphrases from
our role mappings. Aliases must be frozen to available, accepted settings before live work.

## Offline commands

From the repository root, with Node 22.13 or newer, Python 3, Git, npm and the Claude Code CLI:

```sh
npm ci --prefix proofs/portable-core --ignore-scripts --no-audit --no-fund
bash proofs/portable-core/scripts/run-local.sh
bash proofs/portable-core/scripts/package.sh /tmp/methodical-proof-packages
bash proofs/portable-core/scripts/preflight.sh /tmp/methodical-proof-preflight.json
```

The package destination must be empty or absent. Packaging neither installs nor activates a plugin.
The preflight reads tool availability/version; the offline suite validates source profiles; it does not
read account credentials, run a model, install a plugin or certify desktop capabilities. The
Claude native validator and module tests use local mocked APIs; they require the Claude Code CLI; an absent binary fails the package check. TypeScript and core
assertions remain mandatory.

Generated Claude Code artifacts use its native plugin/mod shape. Generated Codex artifacts use
the native `.codex-plugin/plugin.json` compatibility entrypoint with explicit skills and hooks.
The package omits a root manifest that can shadow native hook discovery. SessionStart declares
a finite context allowance; the offline size smoke is approximate and needs native truncation checks. Codex role TOML examples are
operator configuration resources, not assumed autodiscovered agents. Follow each overlay for
invocation. The proof activates only in a marked synthetic fixture. Do not install in a real
project or modify user-wide plugin configuration for this proof.

## Portable skill checkpoint

The generated `portable/methodical/` folder is relocatable and has no runtime, host configuration,
fixture, model profile or installation action. Its shared references declare capability limits and
manual work-record semantics. Native packages retain the synthetic protocol and existing helpers.
This is a distribution prototype, not third-host execution qualification or a production replacement.
See [portability findings and retest rules](portability.md).

## Operator protocol and evidence boundary

1. Freeze source commit, generated package hashes, both profiles, exact host surface/version,
   accepted models/efforts, trusted operator evidence directory and isolated installation route.
2. Run the independent scorer and adversarial tests before admitting an actor. Freeze the oracle
   outside the actor repository; do not give the actor evaluation sources, expected discovery
   answer or original chat. This path boundary is not an operating-system security sandbox.
   The operator must deny oracle access via host isolation or keep it on a separate evaluator.
3. Approve the exact live manifest hash and capability-set hash (SHA-256 of `JSON.stringify` of the parsed objects) only after native isolation, setting control, all-agent
   limits/cancellation and finite overshoot have evidence. `run-live.sh` checks these records and
   requires an authenticated runtime guard connection; mock receipts keep it closed. It does not launch sessions. See `guard/README.md` for the offline reservation boundary and owed native qualification.
4. Install into the verified disposable host environment. Capture native activation and trust
   evidence. Present the synthetic plan without approval; compare files before/after. Supply
   scoped operator approval, then change the plan and verify fresh authority is required.
5. Run both fixtures under both policies on each host. Log every request, acceptance outcome,
   finding/fix, touched-lens re-review and current-candidate backstop. Preserve review floors.
   Count parent, children, retries, reviewers and compaction against one allowance. Stop on the
   first exhausted cap; stopped runs remain in the denominator.
6. For each host, run manual compact, native automatic compact, fresh-session recovery,
   cross-host destination recovery, stale/dirty recovery and decline/interrupt lifecycle cases.
   Automatic compaction must actually occur; an injected event cannot pass that cell. A failed
   automatic trigger consumes its allowance and remains pending; do not expand context for free.
7. Validate dirty bytes/rulings, recover the next action and independently probe lesson use.
   Uninstall only within the disposable environment; verify restoration and retained project
   state. Stop/cancel parent and every child in the cancellation session and record overshoot.
8. Score with `scripts/evaluate.sh` (run without arguments for syntax). A trusted operator must
   supply a semantically reviewed evidence catalog, cell decisions and complete run bundles. The CLI syntax is
   `report BATCH CELLS RUN_BUNDLES TRUSTED_SOURCES`. Every manifest run must have a bundle;
   unstarted runs are explicit pending/null measurements. Completed runs must match every
   planned role, including unavailable usage. Passing work runs invoke the external oracle and
   current clean-candidate review checks; passing recovery cells require current checkpoints
   and new-lesson assessments. Lifecycle semantics remain operator-reviewed.
   This is an evidence validator/report assembler, not an automated grader of every live action.

Synthetic hook stdin, mocked APIs and helper-created events are offline evidence only. Native
pass requires correlated runtime or dated operator evidence from a trusted catalog. A catalog
hash authenticates the supplied bytes, not their truth; it must never be actor-controlled.
Record requested, configured and observed settings separately; Codex configured effort is not
execution telemetry. Unknown effort, usage and billing stay explicitly unknown. Each measurement
must cover orchestration, workers, every reviewer/backstop, retries, compound and recovery,
including explicit unavailable records for unused/unobserved roles. Each role has a `settings`
array of requested/configured/observed receipts and their provenance; an empty array requires
an explicit unavailable/unused explanation in its basis. Observed fields require runtime
provenance and independent session/turn/agent correlation by the operator. The report checks the complete role list against the manifest; the operator verifies each
record against its source evidence.

The helper approval file is a cooperative scoped gate, not tamper-proof human authentication.
The actor can write files and execute arbitrary code. Independent filesystem/operator checks
must detect bypass; do not claim security enforcement from the hook. Compact hooks observe;
they do not write a semantic lesson or silently block an explicit compact/decline. That work is
the native agent's responsibility under the shared method. Receipt bridges require independent
session/turn/agent correlation before certification; standalone normalized objects are not proof.

## Verification and release boundary

See `evaluation/cases.json` and the live verification queue for the two-host acceptance matrix.
All F1/G1–G3/A1–A3/C1–C6/E1 cells must pass on both hosts for the full native claim. Missing
surfaces, automatic compaction or telemetry limit the claim. No live cells have passed yet.
Eight paired work runs establish feasibility, not statistical superiority or cost savings.

The Python scorer intentionally accepts a narrow synthetic subset: exactly `total` and `mean`
functions, arithmetic/conditionals/assignment/raise, and calls to sum/len/list/ValueError. It
rejects imports, attributes, decorators, defaults and executable top-level code before running
the candidate with restricted builtins. This prevents fixture code from forging scorer output;
it is not a general Python evaluator. Lesson assessment requires a trusted operator semantic
verdict bound to exact lesson/probe/index hashes; keyword matching is not semantic grading.

Checkpoint publication locks cooperating writers, preserves staged/dirty/untracked bytes and
uses hashed generations plus an atomic pointer. Readers recheck repository/journal freshness.
Abrupt machine power loss durability is not certified. An abandoned lock requires operator
inspection/removal; never assume a lock is stale. A post-validation concurrent change can make
any snapshot stale, so re-read immediately before recovery. Host transcripts are unnecessary.

This proof carries no publisher installation or Hugging Face distribution step. Its common
skill payload and host boundaries are intended to inform that later packaging decision.

Semantic freshness is cooperative: PostToolUse appends a relevant-event journal record; chat-only
facts require an explicit record helper call. Exact standalone helper commands are exempt so
publication/status do not immediately stale themselves. Hosts that do not provide these native
observations cannot claim complete automatic invalidation. The live operator must test coverage.


## Offline reservation guard

`bash proofs/portable-core/scripts/qualify-guard.sh` runs synthetic ledger/protocol/control tests.
The guard supports only fixed numeric-loopback mock upstreams and synthetic model tariffs.
It reserves worst-case exposure before forwarding, preserves uncertain holds and enforces scoped
request/cost/generated-token caps. Operator state is challenge-signed over a separate Unix socket.
It is excluded from both actor packages. No native protected installation or real-provider mode
exists yet; `launch-isolated.sh --describe` reports the owed setup protocol without changing state.
The financial/native prerequisite is distinct from proving the three Methodical pillars.

## Native bootstrap qualification

`bash proofs/portable-core/scripts/native-bootstrap.sh --describe` describes the separate
zero-provider observer and staged preflight. It has no native launch or UI-input implementation,
upstream transport or native permit issuer. Both native surfaces remain unqualified.

The first required task-port control uses a new owned synthetic Node process and a stdlib Python
Mach API probe. A denied unrestricted control is inconclusive, never proof of sandbox protection.
Preflight stops there; later filesystem/network/IPC/descendant/PTY/native-instance checks are not
run. Even if that baseline starts succeeding, the missing exact-policy checks keep launch closed.
The stronger proposed policy and native payload JSON files are inert, unqualified resources.

An operator-owned frozen manifest pins the clean source commit, approved plan hash, exact
probe runtimes and declared native binaries. `native-bootstrap.sh --preflight MANIFEST OUTPUT`
requires a new canonical private output directory; it reports each host sequentially, reaps only
its own synthetic process and removes only its exclusive scratch root after confirmed cleanup.
Incomplete cleanup stops the second host and retains scratch. Exit status two means no native
admission, including an orderly preflight no-go. No raw transcript, request body or credential
is retained. The observer separately tests bounded shape capture and always denies requests.

Positive launch and all three-pillar native acceptance stay on the verification queue. This
experiment cannot turn the conditional paid proposal into an executable budget.

## Evidence capture and recovery verification

Schema-v2 checkpoints add explicit bounded support capture; `work.evidence` remains opaque.
See [record semantics](core/records.md) and each native overlay for descriptors and standalone commands.

The synthetic identity encoding is SHA-256 of raw UTF-8 `methodical-proof-fixture.json` bytes
concatenated with `git rev-list --max-parents=0 HEAD` text after trimming only its complete leading
and trailing whitespace. Multiple root commits retain their internal newline bytes. Saved tree hashes
use decimal `(mode & 0777)`, a colon, then raw file bytes; saved index hashes use raw
`git ls-files --stage -z` bytes. The same helper computes these identities for publication and recovery.
The pre-restore verifier checks bundle integrity and clean destination identity/HEAD/branch/index/tree
without requiring yet-to-be-restored plan bytes. Post-restore separately checks saved dirty state,
plan/ruling/lesson references and required archived support. Neither verification mode writes any file
or metadata, including on failure; it cannot certify unseen chat facts or prevent later concurrent edits.

New package qualification must name its exact source and artifact hashes. Historical native results
remain bound to their original package; this source change does not upgrade those results.
