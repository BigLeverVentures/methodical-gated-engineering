# Failure modes: what each rule answers

This loop was not designed up front. It grew on one long-running, multi-module project, worked
across many sessions, where the output is read by people outside the team. Each rule in it answers
a failure that happened there. This page gives the shapes of those failures, not the figures, and
nothing about the project or the people it serves.

That project's North Star is a short written bar for what its readers receive. Everything below is
measured against it.

## The loop drifted back to its defaults

**Shape.** The project started from Every's compound-engineering loop and changed it: different
review seats, a written goal, bounded review rounds. While those changes lived in scattered
paragraphs, sessions slid back to the original plugin's defaults. A review seat that was required on
paper turned out, when launches were counted, to sit in only a minority of reviews.

**What the loop does now.** One written loop is the source, and everything else points at it. Every
review prints one line per seat (reviewer, role, model and effort, material yes or no), so a seat that slipped
is visible in the review itself.

## The goal was restated many times before it shaped the work

**Shape.** The project's bar was stated again and again across sessions, and each unit was still
judged against its own goal. Units passed their own tests and missed the point.

**What the loop does now.** The North Star is a step before the plan, every plan opens with how the
unit moves toward it and what it leaves short, and every review has a seat that judges against it.
A unit that meets its own goal but not the North Star is reported as not done.

## The write-ups stopped

**Shape.** The step that writes solved problems up lapsed quietly. A pointer in memory felt like
enough, and later sessions solved familiar problems again.

**What the loop does now.** Compound runs after every work review and before the merge, and writes
each non-obvious solution up with a Reuse section and an index line.

## A merge happened before the checks ran

**Shape.** A "merge when the checks pass" command merged at once, because the repository had no
required checks to wait for, with every check still queued.

**What the loop does now.** The merge is the user's ruling. The loop asks "Merge when green?" and
never merges on its own.

## A cost table argued for the wrong routing

**Shape.** A session proposed moving reviewer seats to a cheaper model on the strength of a price
table, and had to retract it: the binding limit was the strongest model's share of a subscription,
not the token count, and the cheaper model used more tokens per seat.

**What the loop does now.** Routing is by role, framed as rationing the strongest model rather than
saving tokens. At the base routing, no token saving is claimed; escalation spends the strongest
model's share only on the backstop's seats, and the cheaper models cost less only because they are
cheaper.

## A model's account of itself was wrong

**Shape.** A session keeps the model it started with, even after the default changes underneath it,
so a session's own account of which model it is can be wrong. Only the recorded launch said which
model actually ran.

**What the loop does now.** Every agent launch names its model explicitly, and nothing is inherited.
The release checks read the model from the recorded stream, never from the model's own answer.

## A dependency renamed everything, unnoticed

**Shape.** A third-party plugin the workflow called by name had renamed its commands and removed its
agents upstream, long before anyone noticed, because third-party plugins do not update on their own.

**What the loop does now.** The reviewer prompts are files this plugin owns, credited under their
license. No step depends on another plugin's names at run time.

## A shared rule was not in context

**Shape.** A rule several steps relied on was written inside one step's skill, and the others said
"see that skill". A skill's body loads only when that skill runs, so the rule was absent whenever
another step ran first. The tests passed and the text read well.

**What the loop does now.** Text that more than one step needs lives in its own file, and each step
says "read this file" at the moment of use. A test fails if any such path does not exist.

## A stubbed check passed for the wrong reason

**Shape.** A release check that needs a paid run was tested against a stub. The stub reproduced the
output, but not the files the real tool writes, so a script that overwrote those files passed against
the stub and would have failed on the first real run.

**What the loop does now.** Stubs write what the real tool writes, scripts merge configuration
rather than overwrite it, and a stubbed check is trusted only after the bug it guards against has
been reintroduced on purpose and seen to fail.


## Native routing and recovery

A routing recommendation can look automatic even when the parent chose the setting. Require evidence that the shared decision reached the native child. An unknown receipt stays unresolved; retrying can duplicate work.

A valid archive can still omit the record needed to continue. Declare required local evidence and routing state, verify the destination before and after restoration, and reconcile semantic freshness before resuming.
