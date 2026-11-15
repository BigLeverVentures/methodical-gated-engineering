---
name: compact
description: "Write the resume point, including each active ruling verbatim, before native compaction. Use when the user asks to compact or for a resume point. Proactive checkpoints follow the host adapter’s measured-window policy. Last step of the methodical loop. Not for the compound write-up."
---

# Compact

Say `Step: compact` before anything else.

## First, the compound check

If the host handles this request through its native compaction adapter, let the adapter own the action.
Otherwise, check whether this stretch solved anything non-obvious that is not yet written up. Say in one sentence what you will do, never ask, and do it: if something is outstanding,
run `/methodical:compound checkpoint` (it writes the write-ups and resume point and attempts portable
checkpoint finalization); if nothing is, say so in one line and run it anyway, because it writes no write-up and still
finishes the handoff. Either way, checkpoint performs this skill's "How", so skip its duplicate writes.
"Just compact" or another direct decline skips compounding and proceeds to the host's compact action;
never force a replacement checkpoint, approval question or new user exchange after a decline.

When the Claude Code adapter handles `/compact`, it compacts directly with a verified current
handoff. Otherwise, it offers **Skip and compact** or **Compound first**. A dismissed or unanswered
menu leaves the window open. An explicit request to compound and compact starts the same checkpoint
as **Compound first**, then the user runs `/compact` when ready. The adapter can reuse a resume save
it verified in the same session, including when portable finalization could not be verified. It
rechecks the saved file before proceeding. A new ruling, a meaningful change to the work, or changed
resume bytes can make the handoff stale. The `offer` plugin option turns the question and offers off.

## What it produces

`docs/resume.md` (or `docs/private/resume.md`; read `${METHODICAL_ROOT}/rules/user-words.md` and follow it), overwritten each
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

Read `${METHODICAL_ROOT}/rules/user-words.md` and follow it before writing the user's words to any file.


## How

1. If a unit is in flight (not yet merged), record its in-flight state and commit it on the
   current branch.
2. Write the resume point and commit its tracked files, honoring the private-location rule.
3. Attempt compound checkpoint's final publication using
   `${METHODICAL_ROOT}/reference/native-routing.md`: prepare the explicit Work input and use the overlay's
   `checkpoint-finalize` as the final tool call. Only a successful runtime finalizer establishes
   portable checkpoint currency.
4. Report whether the resume point was saved and whether portable finalization was verified. If the
   resume point was saved, tell the user how to run the host's manual compact action.
   Why: the resume point preserves decisions the host summary may omit.

On resuming in a new or compacted session, read the resume point at the chosen path before any work,
then announce the step it names.

## When it hands on

The user runs the host's compact action from the composer, using `/compact` where supported. The
loop starts again at `Step: brainstorm` with the next unit, or at the step the resume point names.
