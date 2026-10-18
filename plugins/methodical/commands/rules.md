---
description: Show the Methodical Adaptive Gated Engineering rules and the current model routing table.
disable-model-invocation: true
---

Show the user the always-on rules of Methodical Adaptive Gated Engineering.

1. Print the Methodical rules exactly as supplied to this session. If they are absent, read
   `${CLAUDE_PLUGIN_ROOT}/rules/rules.md` and print it verbatim, labeled "Installed rules; session
   activation unknown." If that file is unavailable, report that the rules are unavailable.
2. Print the "Routing" table exactly as the session-start rules supplied it. If it is absent,
   explicitly say "Session routing and activation are unknown." Read
   `${CLAUDE_PLUGIN_ROOT}/production-package.json` and check its exact `host` field. Only when it is
   `claude-code` or `codex` and the built CLI exists, run
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/src/cli.js" routing-table <host>` with that exact host value.
   Print its rows under `role | model | effort`, labeled "Configured defaults; hook activation
   unverified." These rows describe resolved configuration, not observed native execution. If the
   manifest, supported host, or CLI is unavailable, or the command fails, report configured routing
   as unknown; do not invent a table or infer the host from model names.
3. End with one line: this host's profile and `overlay.md` describe routing overrides; the parent
   model and effort remain host-controlled, and a plan's `escalation:` sets its assurance level.

Print only the rules, routing information and that final line. Use read-only file and CLI actions;
do not change settings or invoke another model. Why: this command exists so the user can see what
Methodical supplied to the model and distinguish it from configured defaults.
