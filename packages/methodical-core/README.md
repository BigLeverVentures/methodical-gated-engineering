# Shared production core

Edit common workflow content in `method/`, policy/records in `src/`, platform profiles in `profiles/`, and native argument/lifecycle integration in the repository's `adapters/`. Build with `node packages/methodical-core/scripts/build.mjs`; validate with `bash tests/production-adapters.sh`. Both native packages include compiled runtime JavaScript and the same source hashes. The portable package includes instructions only.

The runtime has no model SDK or inference service. A native pre-tool hook consumes a prepared intent. The local approval record is a cooperative representation of an existing human ruling, not an authenticated permission boundary. Host trust and execution controls still apply.

## Reused proof behavior and production checks

| Historical source | Production regression |
|---|---|
| `proofs/portable-core/core/policy.ts` and profiles | `tests/routing.test.ts`: stack seats, separate guidance/overrides, fresh feedback, bounded durable operations |
| `proofs/portable-core/core/contracts.ts` | Strict production parsers; profile, input, correlation and malformed-state cases |
| `proofs/portable-core/core/checkpoint.ts` | `tests/checkpoint.test.ts` and `tests/project.test.ts`: v2 payload/capture, publication interruption, exact bytes/index/modes, compatible lineage and read-only recovery |
| Native hook packaging and bounded startup protocol | `tests/native.test.ts` and `tests/cli-native.test.ts`: actual compiled CLI/core path, complete context, trust fields, unknown and duplicate outcomes |

Historical proof source and packages remain unchanged. Production adds real-project bindings and active routing dependency capture. Checkpoints include the plan, declared evidence, routing state and every active intent dependency, including its original file mode. Inspect before restoring; after restoring original paths and modes, verify again. A semantic freshness check remains necessary.

See `docs/platform-support.md` for native qualification; offline correctness and integrity are separate from actual host execution. Development dependencies are pinned in this package. Runtime requirements are declared in package.json.


Managed Codex CLI dispatch uses `node runtime/src/cli.js dispatch-cli ROOT INTENT-ID` from an installed native package. Preparation and matching direct approval precede dispatch. The locked core reservation consumes the intent before any process exists; unknown or abandoned claims block replay and are never refunded. `METHODICAL_CODEX_EXECUTABLE` is an operator executable-path setting, not an intent field or freeform argument interface.

The POSIX launcher runs `exec --json --model <selected> -c model_reasoning_effort=<JSON effort> -c features.multi_agent=false -c features.multi_agent_v2=false -`, writes the exact sealed brief to stdin, and uses native authentication, repository trust and CLI approval behavior. No permission bypass or trust suppression is supplied. Both feature settings are configuration attempts; native enforcement remains unqualified. Windows is rejected before reservation.

One UUID `thread.started`, one `turn.started`, bounded item events, one `turn.completed` with valid nonnegative integer usage, complete UTF-8 JSONL and exit zero are required. Supported families are `thread.started`, `turn.started`, `item.started`, `item.updated`, `item.completed`, `turn.completed`, `turn.failed`, and `error`; unknown events and failures leave dispatch unknown. Item bodies are opaque bounded evidence. Success records transport completion, not review quality; backend model/effort stay null without observations. Wrapper run/session IDs are distinct from native thread UUIDs. Native stop receipts cannot settle process claims.

Limits: ten minutes, 256 KiB per line, 512 KiB combined retained stdout/stderr, 10,000 events. Abort, timeout, malformed output and I/O failure terminate the owned POSIX group with TERM then KILL. Local cleanup does not establish backend termination. Restrictive exclusive files in `.methodical/evidence/cli/<intent>/` retain the manifest and bounded streams. Checkpoint finalization remains explicit: include required local captures for `manifest.json`, `stdout.jsonl`, `stderr.txt`, plus the chosen resume evidence. Existing 1 MiB per-file and 8 MiB aggregate capture limits apply; no automatic semantic freshness is claimed. Native qualification remains owed; offline examples and tests use synthetic Node executables.

Owned process-group cleanup does not contain descendants that escape into another group. After the deadline and bounded TERM/KILL grace, held output pipes are forcibly closed and recorded incomplete; unconfirmed leader reaping remains explicit unknown debt. Clean completion requires genuine output EOF and confirmed zero leader exit. Escaped descendants and backend termination remain unobserved.

## Shared worker guard

Both runtime packages expose `worker-guard ROOT [INPUT-JSON]`. Input is a JSON object read from a file or stdin. A bound coordinator can receive checks through the host's synchronous Stop hook, which continues the active turn while it waits for workers or handles recovery.

- Initialize with `configure` containing `unitId`, `parallelism`, `quietMs`, `reportMs`, `claimMs` and `tasks`. Each task has an `id`, a list of approved `operations` in attempt order, and `dependsOn` task IDs. Include the same object as `workerGuard` in the approval-template input so the operation grouping and capacity are bound to the approval. Prepare the operations through the existing approval and dispatch path. A guard is scoped to one unit. To arm Stop continuation, include `coordinator` with the `host` and exact `sessionId` supplied by the host at startup.
- Check with an empty object or with correlated `progress` events. Each event has an `intentId`, `sessionId`, `workerId`, Unix millisecond `at`, and SHA-256 `ref` of fresh evidence. Use the native Claude child ID or the managed Codex run ID. Translate genuine work progress to this input and preserve its original event time. For a cooperating worker, `worker-guard-progress ROOT INTENT-ID` records the attempt's staged patch digest and modification time while the reservation is active. Changed bytes and a post-stall timestamp are required to clear a stall through this path. This path depends on worker-scoped staging and the worker reporting its own output.
- Accept a verified worker patch using an entry in `accepted` with `intentId`, the claim's `base` and `inputs`, and the patch `sha256`. The patch lives at `.methodical/worker-output/<intent-id>.patch`. Acceptance requires a correlated successful dispatch. The guard checks patch bytes and binds the inputs for dependents. The host must validate the patch scope and apply inputs in its isolated workspace.
- Read `reportDue`, `newRecovery`, `recovery`, `status` and `nextCheckAt`. A report does not clear recovery. Dispatch only returned `claims`, and hold the tracked tree fixed for the guarded unit. Reservation and guard checks share the dispatch lock. Expired claims may be reissued for the same intent. An unknown dispatch stays assigned until reconciliation.
- The guard record and verified staged artifacts live in `.methodical/`. The existing checkpoint API can capture these as explicitly declared local records. Continuation requires an active turn. After that turn ends, resume work in the owning host session. Retry saturation surfaces the blocker and keeps its recovery pending.
