For a coordinated build, start the lead with `claude --model fable --effort high`.
Launch each approved worker as a native background Agent with its stable task ID as the
description and the prepared marker as the prompt. Send the full safe ready group together
before waiting. Methodical routes routine workers to Sonnet and demanding workers to Opus
through the resolved profile and preserves independent review seats.

Use Claude Code's native Agent tool for Methodical children. Your parent session model and
effort remain your choice. Role models saved in the plugin's /config are model-only overrides
of the shared profile; the profile resolves effort separately. Environment and host policy
may override requested settings; a configured setting does not prove backend execution.

Helper: `node "${CLAUDE_PLUGIN_ROOT}/runtime/src/cli.js" <command> [arguments]`.
Run `profile claude-code` to inspect the same resolved profile used by preparation. Import
exact canonical support with `support "<git-root>" "<package-root>" lenses/<name>.md ...`.
Use `approval-template "<git-root>" "<intent-input.json>"` to obtain hashes; it returns
`approved: false`. Record the actual direct ruling and allowed operations before approval.
Prepare an approved unit with `prepare "<git-root>" "<intent-input.json>"`. Supply the explicit
unit/plan/scope/approval binding, operationId, profile (or host/profilePath), candidate task and
stack, returned method/lens paths, bounded task brief, available native settings and accepted feedback. Preparation
binds current project bytes and reproduces feedback; a list of evidence IDs is insufficient.

Pass the returned `[methodical-intent:<id>]` marker in Agent's `prompt`. The native PreToolUse
hook reserves that intent and applies its exact prepared brief, `model` and `effort` while
retaining normal permission processing and all other Agent arguments. Unbound Agent calls
pass through. A malformed/stale intent or unavailable runtime stops the marked call.
Never launch a second model process or recopy settings in a private controller.

## Worker guard

For an approved plan with a `workerGuard` policy, use `worker-guard ROOT INPUT.json`
before dispatch. Pass the exact approved policy as `configure` and bind the coordinator
as `"coordinator": {"host":"claude-code","sessionId":"<host session ID>"}` using the
ID supplied at session start. Run the same command with an empty JSON object for later
checks. Launch every returned claim that can run safely in parallel. Refill available slots
while you work through stalled assignments. The owning session's Stop hook can continue an
active turn and surface due recovery. After the turn ends, continue in the owning session.

Have the worker stage its patch at `.methodical/worker-output/<intent-id>.patch`
and run `worker-guard-progress ROOT INTENT-ID` while its dispatch is still active.
Changed patch bytes written after the stall can verify progress for the reserved attempt. The coordinator can accept output only
after known successful completion using `worker-guard` with `accepted` evidence
including the claim's intent ID, base, inputs and the patch's SHA-256. For ambiguous
termination, hold the slot for reconciliation and continue independent work where capacity allows.
For Claude background Agents, the parent Stop hook checks for a matching host completion
notification after the worker stops. Keep a settled Agent closed and prepare a new intent
for follow-on work. If the host cannot confirm completion, retain the patch for reconciliation.

Use `dispatch-status "<git-root>"` to inspect pending state. Missing native correlation or a
crash after reservation is unresolved debt; do not retry the child blindly. Native receipts
record only IDs, explicit outcomes and supported observations. Missing observations remain
unknown. Hook rewriting and native correlation require qualification on the installed client.

Use `record "<git-root>" finding <reference>` for chat-only decisions/findings, then
`checkpoint "<git-root>" claude-code "<work.json>"` to publish a portable checkpoint with
explicit project binding and required support. `status "<git-root>"` reports freshness.
Before restoring, run `verify "<git-root>" "<bundle>" pre-restore`; stop on failure. Restore
the saved patches, index/worktree/untracked bytes and modes, retaining captured support.
Then run the independent `verify "<git-root>" "<bundle>" post-restore`. Verification is
read-only.

The local Claude mod handles native `/compact` and standalone chat requests such as “compact,”
“no, just compact,” and “compound, then compact.” A current handoff lets a plain compact request
proceed immediately. If it is stale, a plain request shows the compound menu when offers are enabled.
An explicit request for both steps starts `checkpoint then compact`, and the mod compacts after a
verified handoff and normal turn completion. Report the handoff in that turn and let the adapter
run the host action.
