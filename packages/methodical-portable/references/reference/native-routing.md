# Native routing and durable work records

The adapter overlay supplies the runtime command and native argument names. Resolve its package root from this reference path. The parent session stays on the user's chosen model and effort.

Before storing work records, add `.methodical/` to the project's ignore rules as an explicit setup change; never stage or publish this metadata. Startup never edits those rules.

Before routed work, prepare an intent with the approved unit/plan reference, scope, role, risk, detected stack, exact candidate, profile, method/lenses and complete sealed brief. This is a cooperative record of an existing human ruling; it cannot create approval. Follow the qualified host overlay: Claude uses the returned marker with its native Agent tool, whose hook revalidates the candidate and reserves the intent before replacing supported arguments. Managed Codex CLI workers use the packaged `dispatch-cli ROOT INTENT-ID` command, whose core validates and reserves the bound intent before launching the CLI with selected settings and exact sealed stdin. Both routes use the shared decision under normal host trust and permissions. Codex native child-hook rewriting remains suspended. Unknown or reserved intents stop; never retry an uncertain dispatch by making another intent.

Run deterministic checks as tools. An adaptive adjustment needs a fresh reproduction bound to the current candidate and exact checker. Environment, delivery or format failures do not establish a model reasoning failure. Record accepted material review findings and keep required review debt until the exact candidate receives its required reviews. A completed child is not a review pass.

The runtime distinguishes requested, routed and observed settings. Missing native observations stay unknown. Callback correlation must bind the intent, host session, tool call and child. Parent statements and runtime rewrite logs alone do not establish native consumption. Normal host permissions and project trust remain active.

## Checkpoint finalization

Compound checkpoint and compact use this same protocol. Finish indexed lessons, the resume point,
verbatim rulings, relevant-state records, tests and commits before publishing. Keep a private resume and
rulings in their chosen location; never force-add them. A direct decline of compounding proceeds to the
host's compact action immediately, without forcing this protocol or another user exchange.

The parent authors one bounded Work JSON file at `<git-root>/.methodical/evidence/checkpoint-work.json`.
Its fields describe the completed semantic work; runtime hooks cannot infer them from a transcript:

```json
{
  "planHash": "<active plan SHA-256>",
  "step": "<current method step>",
  "nextAction": "<exact first action on resuming>",
  "rulings": "<chosen project-relative rulings file>",
  "lessons": ["<indexed solution path, if any>"],
  "findings": ["<open finding reference, if any>"],
  "reviewDebt": ["<required review still outstanding, if any>"],
  "evidence": ["<opaque evidence label, if any>"],
  "binding": {
    "schemaVersion": 1,
    "identityAlgorithm": "git-root-lineage-sha256-v1",
    "repositoryIdentity": "<validated repository lineage identity>",
    "plan": {"path": "<approved active plan path>", "sha256": "<active plan SHA-256>"},
    "scope": "<existing approved unit scope>",
    "policyHash": "<approved policy SHA-256>",
    "profileHash": "<approved profile SHA-256>",
    "routing": {"path": ".methodical/routing-state.json", "sha256": "<current routing-state SHA-256>"}
  },
  "captures": [
    {"kind": "local", "ref": "methodical:resume", "source": "docs/resume.md", "archive": "evidence/resume.md", "required": true}
  ]
}
```

Replace placeholders with current values and use empty arrays where there are no items. Set the resume
source to the actual chosen path, including `docs/private/resume.md` when applicable. Declare additional
required local support with distinct references and archive paths under `evidence/`; ignored support belongs
under `.methodical/evidence/`. The runtime captures the selected rulings, lessons, resume and active reference at their original paths
and modes, including ignored private locations; it never scans a private directory. Never capture
credentials or raw transcripts. Local captures are bounded and required;
external or unavailable records remain explicit limitations.

Derive the binding with the overlay's read-only `checkpoint-binding` helper. For a routed unit, use
`checkpoint-binding "<git-root>" "<intent-id>"`; it retains that unit's recorded profile and policy.
For ordinary work with no intent, use
`checkpoint-binding "<git-root>" <host> "<active-reference-relative-path>" "<existing-unit-scope>"`.
The active reference is the current approved plan, or the existing scoped work/waiver record when a plan
was explicitly waived. The wire field `plan.path` names this active reference; do not fabricate a plan,
change a waiver into approval or ask for another ruling. The helper hashes the current reference and
routing state and uses `routing: null` only when no state exists. Copy its result into Work.binding and
use its plan hash for Work.planHash; retain the current semantic step and unresolved debt in Work.
An unavailable or stale active reference leaves publication incomplete and is reported plainly.

The final tool invocation is exactly the overlay's Node helper, with absolute package, repository and Work
input paths, the host `claude-code` or `codex`, and no chained shell commands:

```sh
node "<package-root>/runtime/src/cli.js" checkpoint-finalize "<git-root>" <host> "<git-root>/.methodical/evidence/checkpoint-work.json"
```

This command publishes the selected records and current routing state, then runs read-only freshness
verification in the same process. Only a successful `methodical-checkpoint-finalized` receipt with
`current: true` completes finalization. It is current at that read; any later semantic write, commit,
ruling, routing transition or relevant event needs another publication. Make no later tool call before
handing control back for compact. Do not write a special resume marker afterward or treat chat text as
success. Claude's mod corroborates the successful native finalizer result against its on-disk generation,
checkpoint hash, active plan binding and captured resume; it preserves the existing offer and decline choices.
Codex relies on the same runtime result and its supported manual compact action.

## Recovery

An interrupted or stale checkpoint is not current. Read the resume records, inspect the bundle and run read-only pre/post verification on a compatible destination. Restore the declared local captures to their original `source` paths and apply the exact modes in `evidence/dispatch-dependency-modes.json` after copying; this map covers selected work records and active routing dependencies. Verify semantics against current work before continuing. No checkpoint preserves the full conversation.

Why: preserving selected records keeps the next action, unresolved findings and resource decisions usable after a context boundary without requiring the original chat.
