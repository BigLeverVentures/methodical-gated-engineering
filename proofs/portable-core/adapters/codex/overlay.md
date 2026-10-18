Apply core/proof-protocol.md for this synthetic native proof, alongside the shared method.

Use Codex's native subagents with an explicit supported model and reasoning effort, in a fresh
bounded context when independently selecting settings. Use the available human question interface;
record an actual operator decision, not a quoted file as approval. The packaged child definitions
are baseline examples; configured/requested effort cannot certify per-turn execution.

Resolve <package-root> from the loaded skill file, not an assumed shell environment variable.
Helper: node "<package-root>/runtime/scripts/cli.js" <command> [arguments]
Commands: policy <profile-json> <input-json>, status <fixture-root>, checkpoint <fixture-root> codex
with work JSON on stdin. Runtime profile: core/profiles/codex.json. Checkpoints use the common
schema; native tool names and instruction-loading syntax stay in this overlay.

This package targets manual local desktop installation with reviewed/trusted hooks. Installation,
trust and state isolation are separate prerequisites, not demonstrated by CLI help. Do not edit
the user's configuration or assume CODEX_HOME isolates desktop. The package adds no app-server
supervisor. PreCompact support does not mean a hook can perform the semantic compound step.

For freshness-safe standalone Bash helper calls, quote the executable and repository paths:
`node "<package-root>/runtime/scripts/cli.js" status "<fixture-root>"`.
Publish using `node "<package-root>/runtime/scripts/cli.js" checkpoint "<fixture-root>" codex "<work-json-file>"`.
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
