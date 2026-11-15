For a coordinated build, start the lead with
`codex --model gpt-6-astra -c 'model_reasoning_effort="medium"'`.
Use approved task IDs as worker names. Bind the worker guard to this session with
`"launch":"codex-hook"` in its `coordinator` object. Prepare the safe ready group's
scratch scopes and issue its claims through `worker-guard`. Yield the turn so Methodical's
Stop hook starts the issued claims together. Check receipts after continuation.
The profile routes routine work to Luna and demanding work to Sol. Feedback that requires
executing a repo checker uses the authorized manual dispatch path.

The installed plugin requires ordinary hook trust. The launcher uses the managed Codex
CLI with workspace-write and non-interactive approval settings. The session's model and
effort remain the user's choice. Native Agent/spawn_agent rewriting is unqualified.

Helper: `node "<package-root>/runtime/src/cli.js" <command> [arguments]`.
Use `profile codex` for resolved settings and
`support "<git-root>" "<package-root>" lenses/<name>.md ...` to import canonical support.
`approval-template "<git-root>" "<intent-input.json>"` supplies hashes with `approved: false`.
Record the user’s ruling and allowed operations before approval.
Prepare an approved unit with
`prepare "<git-root>" "<intent-input.json>"`. Supply the explicit unit/plan/scope/approval
binding, operationId, profile (or host/profilePath), candidate task and stack, returned method/lens
paths, bounded task brief, available native settings and any accepted feedback. Preparation binds current project
bytes and reproduces feedback; a list of evidence IDs is insufficient.

The following describes the suspended native-child integration contract for inspection. Do not use it as a qualified dispatch route.

Pass the returned `nativeReference` string unchanged as the native tool's `task_name`, and
retain the returned `[methodical-intent:<id>]` marker in `message` where visible. The exact
`methodical_intent_<32 lowercase hex>` task name supports a callback whose message marker is
absent. It grants no authority; the current intent and all its bindings still require validation.
Malformed, repeated or conflicting references stop before reservation. The PreToolUse hook reserves that intent and applies its exact brief, `model`, `reasoning_effort`
and `fork_turns: "none"`, preserving all other arguments. For this validated Agent call only,
Codex requires the hook's PreToolUse allow value to apply updatedInput. This does not handle
PermissionRequest, shell/sandbox approvals or child permission decisions. Unbound calls pass
through. A malformed/stale intent or unavailable runtime stops the bound call. Unsupported
native schemas stop explicitly. Do not improvise a fallback. The only separately implemented CLI route is the packaged `dispatch-cli` protocol described below.

## Worker guard

For an approved plan with a `workerGuard` policy, use `worker-guard ROOT INPUT.json`
before dispatch. Pass the exact approved policy as `configure` and bind the coordinator
as `"coordinator": {"host":"codex","sessionId":"<host session ID>","launch":"codex-hook"}` using the
ID supplied at session start. Run the same command with an empty JSON object for later
checks. Prepare the safe ready group before yielding to Stop. The hook starts issued claims together. Refill available slots
while you work through stalled assignments. The owning session's Stop hook can continue an
active turn and surface due recovery. After the turn ends, continue in the owning session.

Have the worker stage its patch at `.methodical/worker-output/<intent-id>.patch`
and run `worker-guard-progress ROOT INTENT-ID` while its dispatch is still active.
Changed patch bytes written after the stall can verify progress for the reserved attempt. The coordinator can accept output only
after known successful completion using `worker-guard` with `accepted` evidence
including the claim's intent ID, base, inputs and the patch's SHA-256. For ambiguous
termination, hold the slot for reconciliation and continue independent work where capacity allows.

Use `dispatch-status "<git-root>"` to inspect pending dispatch. Uncorrelated reservations
stay unresolved; reconcile them before retry. Settings are requested, and missing backend
observations remain unknown. A task path is not an `agent_id`. Automatic routing requires
qualification of the exact installed route.

Use `record "<git-root>" finding <reference>` for chat-only decisions/findings, then
`checkpoint "<git-root>" codex "<work.json>"` with explicit project binding and required
support. `status "<git-root>"` reports freshness. Before restoring, run
`verify "<git-root>" "<bundle>" pre-restore`; stop on failure. Restore saved patches,
index/worktree/untracked bytes and modes, retaining captured support. Then independently run
`verify "<git-root>" "<bundle>" post-restore`. Verification is read-only. Hooks cannot do the
semantic compound step. Use native compact. Context status reports measured use when available.


For a manual managed batch, use the packaged `dispatch-cli ROOT INTENT-ID [INTENT-ID...]` command after preparing the intent. The core owns reservation and fixed CLI settings; native child-message rewriting is not a qualified dispatch route. Preserve unknown process claims and explicitly capture `.methodical/evidence/cli/<intent>/{manifest.json,stdout.jsonl,stderr.txt}` with resume evidence at checkpoint finalization. POSIX only. Native authentication and trust apply. Manual batches inherit the native sandbox. Both multi-agent feature overrides are configured false; delivery has been observed on the exact tested CLI runtime and isolated project configuration; independent feature-disable enforcement, backend telemetry and broader native lifecycle qualification remain unestablished. See `docs/platform-support.md` in the source checkout for version and qualification limits. Offline passing tests do not qualify native dispatch or establish review quality.

Owned process-group cleanup does not contain descendants that escape into another group. After the deadline and bounded TERM/KILL grace, held output pipes are forcibly closed and recorded incomplete; unconfirmed leader reaping remains explicit unknown debt. Clean completion requires genuine output EOF and confirmed zero leader exit. Escaped descendants and backend termination remain unobserved.
