---
name: context-status
description: Show the active session’s measured context window and remaining runway in the full window when explicitly requested.
disable-model-invocation: true
---

# Context status

Say `Step: context-status` when the host delegates this read-only diagnostic to the agent.

- On the Anthropic host, the Methodical compaction mod answers `/methodical:context-status` directly where loaded. If the mod is not loaded, report Methodical measurements as unknown and point to the host's `/context`.
- In Codex, use the package root and session ID supplied by this chat's native Methodical startup hook. Run `node "<package-root>/runtime/src/cli.js" context-status "<host-session-id>" "<session-cwd>"`. Use the session's initial working directory. If the binding or runtime is missing, report unknown. Do not look for other sessions or open a transcript yourself.

Report the measured usable window, occupied tokens, remaining runway in the full window, startup load and source, initial runway, and whether the window qualifies for early offers. A first-request input count includes the first prompt. An eligible window does not enable an offer on Codex. Never treat an unknown field as zero or compact as part of this diagnostic.

Why: the active window and real load matter more than a model's advertised maximum.


## When it hands on

Return the diagnostic in the same turn. It does not advance the engineering loop.
