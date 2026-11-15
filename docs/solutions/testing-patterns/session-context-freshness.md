---
title: Tie context measurements to a fresh host request
tags: [context, compaction, telemetry, native-hooks]
---

A session's model limit, automatic compaction threshold, and occupied context answer different
questions. Never infer the active limit from a model name or use the native auto threshold as
the denominator for an early reminder.

A reading can survive the very event that makes it stale. Exercise a model switch, resume,
fork, and compaction while the host still reports the old sample. Require a new request or
same-epoch evidence before reusing the measurement. On Codex, a compacted-history estimate
with zero request input does not establish a fresh sample. Retain the original startup count
only when its first-request provenance is clear.

Check the installed path in an ordinary chat as well as mock state transitions. Match the
adapter's result to native counters. Then compact natively and verify the next turn recalls
an exact chat-only decision. A successful file replay establishes parser compatibility;
it does not establish that a Desktop hook ran.
