---
name: compact
description: "Write the resume point in docs/resume.md, every ruling verbatim, so the context can be compacted without losing anything. Use when the user asks to compact or for a resume point. Proactive checkpoints follow the host adapter’s measured-window policy. Last step of the methodical loop. Not for the compound write-up."
---

# Compact

Say `Step: compact` before anything else.

## First, the compound check

If the host handles this request through its native compaction adapter, let the adapter own the action.
Otherwise, check whether this stretch solved anything non-obvious that is not yet written up. Say in one sentence what you will do, never ask, and do it: if something is outstanding,
run `/methodical:compound checkpoint` (it writes the write-ups, resume point and verified production
checkpoint); if nothing is, say so in one line and run it anyway, because it writes no write-up and still
finishes the handoff. Either way, checkpoint performs this skill's "How", so skip its duplicate writes.
"Just compact" or another direct decline skips compounding and proceeds to the host's compact action;
never force a replacement checkpoint, approval question or new user exchange after a decline.

Where the adapter intercepts `compact` or `/compact`, it uses a verified current handoff immediately
or asks one question if the handoff is stale. It is not an offered skip: the user's own words or Esc
compact as is, without another question. A menu choice or explicit request to compound and compact
runs the checkpoint and then native compaction. The `offer` plugin option turns the question and offers off.
Only a successful runtime finalizer with matching on-disk records establishes currency. Hosts without
chaining use their supported manual compact action as described in the overlay.

## What it produces

`docs/resume.md` (or `docs/private/resume.md`; read `${PLUGIN_ROOT}/rules/user-words.md` and follow it), overwritten each
time with the current state:

- **Where things are**: the branch, the base commit, the last commit, what is merged.
- **Next action**: the step the loop is on and the first thing to do on resuming.
- **Rulings**: every ruling the user has given that is still in force, **verbatim**, with its date
  and what it rules on. Why: the summary a compaction writes is a paraphrase.
- **Open findings and owed items**: review findings not yet fixed, open questions waiting on a
  ruling, entries in `docs/device-verification-queue.md`.

Write rulings into the resume point the moment they are given, not only at this step. Why: a
compaction can happen before this step runs, and anything only in the chat is gone after it.

## Where the user's words go

Read `${PLUGIN_ROOT}/rules/user-words.md` and follow it before writing the user's words to any file.


## How

1. If a unit is in flight (not yet merged), record its in-flight state and commit it on the
   current branch.
2. Write the resume point and commit its tracked files, honoring the private-location rule.
3. Complete compound checkpoint's final publication using
   `${PLUGIN_ROOT}/reference/native-routing.md`: prepare the explicit Work input and use the overlay's
   `checkpoint-finalize` as the final tool call. Proceed only on its successful current receipt.
4. Tell the user the resume point is written and that they can run the host's manual compact action now. Only an already-requested
   the native client chain may run `/compact` for them. Why: compacting at half the window keeps headroom for the summary, and the
   resume point means nothing depends on what the summary keeps.

On resuming in a new or compacted session, read `docs/resume.md` before anything else, then
announce the step it names.

## When it hands on

The host owns the compact action. An already-requested native chain runs it after finalization.
On hosts that require a manual action, the user runs it from the composer, using `/compact` where supported. The loop starts again at `Step: brainstorm` with the next unit, or at the step the resume point
names.
