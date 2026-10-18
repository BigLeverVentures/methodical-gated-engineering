Apply core/proof-protocol.md for this synthetic native proof, alongside the shared method.

Use Claude Code's native Agent facility and the requested model/effort from the policy result.
Use the native question interface for human rulings. The proof package's role agents provide
bounded contexts; pass the canonical lens and candidate scope explicitly. Central native hooks
observe spawn/step/stop receipts. Debug records are candidate evidence requiring correlation
and observed runtime qualification; tests with supplied values are simulations.

Helper: node "${CLAUDE_PLUGIN_ROOT}/runtime/scripts/cli.js" <command> [arguments]
Commands: policy <profile-json> <input-json>, status <fixture-root>, checkpoint <fixture-root> claude-code
with work JSON on stdin. Runtime profile: core/profiles/claude-code.json. For checkpoint JSON,
use the plan hash, step, nextAction, rulings path, lessons, findings, reviewDebt and evidence.
Do not run a model CLI or live evaluation through this helper. Native /compact remains separate.

For freshness-safe standalone Bash helper calls, quote the executable and repository paths:
`node "<package-root>/runtime/scripts/cli.js" status "<fixture-root>"`.
Publish using `node "<package-root>/runtime/scripts/cli.js" checkpoint "<fixture-root>" claude-code "<work-json-file>"`.
Record chat-only decisions/findings before checkpoints with
`node "<package-root>/runtime/scripts/cli.js" record "<fixture-root>" finding evidence-id`.
Do not combine these with other shell commands. The work JSON file is fixture input; file-based
publication avoids stdin shell wrappers. Tool observations invalidate semantic freshness except
these exact helper calls. Prompt-only coverage remains cooperative and must be qualified live.

For records-only recovery, run this exact standalone command before writing any restored bytes:
`node "<package-root>/runtime/scripts/cli.js" verify "<fixture-root>" "<bundle-directory>" pre-restore`.
Stop on a nonzero exit or `pass: false`. A successful guard checks the clean destination identity,
HEAD, branch, index and worktree; the destination need not yet contain saved dirty plan/ruling/lesson bytes.
Restore the saved patches, worktree/untracked bytes and file modes, and retain the bundle's immutable
captured support files. Resolve required logical references through `capture.records[].archive` under
the bundle directory; their original source paths need not exist after relocation. Then independently run
`node "<package-root>/runtime/scripts/cli.js" verify "<fixture-root>" "<bundle-directory>" post-restore`.
Both commands report separate checks as JSON and return nonzero on failure. They do not restore files,
create metadata, acquire locks or append journal events. Keep them standalone with these exact quotes;
compound commands and lookalikes do not receive the observation exemption. PreToolUse still requires
the existing scoped approval; verification is no authorization bypass. Post-restore equality does not
prove that unrecorded conversation facts are current.
