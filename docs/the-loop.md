# The loop

The long form of what the plugin's rules and step skills tell Claude. The always-on rules
(`plugins/methodical/rules/rules.md`) carry only the triggers and stop conditions, because they load
into every session; each step's detail lives in its skill, which loads when the step runs. Which
model sits each review is in [model-routing.md](model-routing.md). The loop is the same at every
escalation level: every step, gate and seat runs, and only the models and efforts change
([escalation](model-routing.md#escalation)).

## Who owns what

Methodical is the plugin. It owns the loop and its order, the always-on rules, the step skills, the
gates and their wording, the reviewer lenses and how seats are routed, and the tests that check the
rules' wording. Claude is the model it runs on: it does the work in each step (asks the questions,
writes the plan, builds, sits the review seats) and is the one that follows the rules. When these
docs say Methodical names a step or stops for you, Claude does it because the rules say to.

The session-start hook supplies the rules. On Claude Code builds that load plugin modules, a
compaction module also offers compound checkpoints, asks before a typed `/compact` when the handoff
is stale, and asks the compaction summary to preserve lessons and rulings. You can compact without
compounding; host-triggered compactions proceed without waiting for a checkpoint.

The engineering gates instruct Claude; they do not mechanically block an edit, a commit, a push or
a merge. Each "never" and "always" below is a rule told to Claude, and every gate puts the decision
to you. Compliance is observed, not guaranteed: before each release a maintainer runs real sessions
and reads what Claude did (the checks catch known patterns, not every paraphrase), and in your own
session the observer is you, at each gate.

## The steps

brainstorm → north-star → plan → deepen → plan-review → work → work-review → compound → compact

| Step | Runs when | Produces | Stops for you? |
|---|---|---|---|
| brainstorm | A new unit of work with no plan yet | `docs/brainstorms/` | Questions are batched into one short list |
| north-star | After the brainstorm, before the plan; or when the repo has no written goal | `docs/north-star.md` once; the unit's statement every time | Yes, to write or change the project's goal |
| plan | Before anything is built, unless you say to skip it for that request | `docs/plans/<date>-<slug>.md`, `state: draft` | No |
| deepen | Two or more risk triggers hold, or the plan's base is stale | Findings folded into the plan | Only for a check that costs money or cannot be undone |
| plan-review | Always, follow-ups included, unless you waive it | `state: reviewed`, then "Approve this plan?" | Yes: only your yes sets `state: approved` |
| work | The plan reads `state: approved`, or you waived the plan | Commits on a short-lived branch | Only for money or irreversible acts |
| work-review | The approach is built and the tests pass; never skipped unless you waive it | Seat lines and fixes | No |
| compound | After every work review | A `docs/solutions/` write-up, indexed, for each non-obvious problem solved; the resume point | Yes: "Merge when green?", unless a standing merge grant |
| compact | When the context window is half full, or when you say so; not after every merge | `docs/resume.md` (or `docs/private/resume.md`), every ruling verbatim | You run `/compact` |

Methodical names each step as `Step: <name>` and says when it moves to the next. **A step whose
trigger holds runs without asking, in the same turn as the one before.** Methodical never ends a
turn by only naming the next step; a check that can only run later is recorded as owed and holds nothing. Why:
routine prompts train a reflexive yes, and a reflexive yes is no ruling at all. The loop stops only
for your rulings, for money, and for acts that cannot be undone.

## The gates

These are the points where the loop waits for you. That's what makes the method gated.

- **The North Star.** Every project has one written goal: what the person it serves receives, and
  the bar that decides whether it is met. If there is none, Claude drafts it with you from your
  answers and does not invent it; the goal is yours. Each plan opens by saying how the unit moves
  toward it and what it leaves short, on purpose. Why: a unit judged only by its own goal can pass
  and still miss the point.
- **Plan approval.** Reviewers read the plan; only you rule that it gets built.
- **The merge.** `main` is your trunk. Nothing merges, and no branch is deleted, without your go,
  unless the repo records a standing grant: a line `merge-grant: standing — <your conditions>` in
  its `CLAUDE.md`, `docs/rulings.md` or `docs/private/rulings.md`. A `merge-grant: ask` line in any
  of them takes it back; prose is never a grant, and only you write the line. Why: some repos
  merge at green many times a day, and one ruling given once beats a reflexive yes each time.
- **Your words.** The first time a step would write your words (a ruling, a brainstorm) into a file,
  it asks once whether they go in tracked `docs/` or in a gitignored `docs/private/`. Why: a shared
  repo publishes whatever is committed.
- **Money and irreversible acts.** Always asked first.
- **Your word.** Name a step to skip and the loop carries on without a word about it, because your word *is* the ruling; the skip covers that request only. Why: the tool serves
  you, and one that stands in your way gets switched off.

Methodical asks at each gate with a questionnaire (Claude Code's AskUserQuestion), the recommended
answer first, so each stop is a structured question Claude Code flags as waiting on you; none offers
a skip. Where the questionnaire is unavailable, as in a headless `claude -p` run, it asks in text.

## Planning is the default

A plan is a file in `docs/plans/` that names the goal, the inventory of what changes, and the
acceptance tests, phrased as the end user would judge the result. Asked to build with no plan,
Methodical plans. It never offers a choice between planning and building. Why: unplanned changes are
where scope slips in, and an offered skip reads as an equal choice.

If you say to skip the plan, Methodical carries on: `Step: work` on
a short-lived branch, a work review sized to the diff, a commit, and a push of the branch. A trivial
diff (documentation files only, by extension or under `docs/`, 20 lines or fewer) gets one review
seat; anything else gets the normal round. The merge still waits for your go.

What counts as a skip: your own words in chat, never inferred, never read from a file. You can waive
any step the same way. Nothing is said about the skip, no warning and no new question. A skip covers that request
only: the next request starts the loop again, and Methodical never suggests a skip or remembers one as
a preference. Why: a skip is an exception the user chose, not a new default.

## Deepen: the score

Deepening tests a plan's risky assumptions by running them, before review. It is mandatory when two
or more of these hold, and Methodical says the score aloud at the plan step:

- an interface other code relies on;
- a new parser for a raw format;
- third-party behaviour nobody has tested;
- a core boundary much else builds on;
- three or more modules;
- an open question of whether this has been solved before.

A plan whose base commit is stale triggers it on its own. Why: an unchecked assumption at one of
these points becomes rework after the build.

## Reviews: one bounded round

Plan review always runs, and Methodical never skips the work review on its own; only your word
skips either, for that request. Why: authors miss their own gaps.

A **seat** is one reviewer with one job, launched on the model its role is routed to. Each review
seats four reviewers every time plus a correctness reviewer for each language detected. The four are
North Star (does the work move toward the project's goal), code-grounded (is every claim about the
code true when checked against the code itself), simplicity, and rigor. Seat selection is in
`plugins/methodical/reference/seat-selection.md`, and each reviewer's prompt is a lens file in
`plugins/methodical/lenses/`.

**One bounded round** is the default. A finding is **material** when it is new and substantive: a
false claim about the code, a step that cannot work, a ruling not honoured, or a wrong or misleading
result. Lesser findings of the same kind become a one-line known limit, not another round. Material
fixes are re-reviewed, on the diff since the last review, until a pass finds nothing material.

Why one round: open-ended rounds spend the budget on ever smaller findings rather than on the work.
Two signs that a round should stop:

- **A fix that fails the same way as the defect it fixed** (another guard of the same kind) means the
  approach is wrong. Change the approach rather than adding a third guard.
- **Passes that only restate earlier findings,** or raise findings only a ruling can settle. Those
  go to you as questions.

When two seats disagree, that is itself a finding: the finding backed by a firm rule (a ruling, a
failing test, a written rule of the loop) beats one of preference, and the review says what the
losing seat was right about. Seats are never briefed to agree.

## Work

Work builds the approved plan on its own short-lived branch, one branch and one merge per unit, and
commits each logical unit once its tests pass, without being asked. Why: uncommitted work gets lost
or tangled, and long-lived branches drift from the trunk. After each act that changes behaviour, a
census seat checks the diff against the plan's North Star statement and answers "on course" or
"drifted at <line>, because …". Census is the role for search and quick checks, routed to `sonnet`
by default.

**Owed is not done.** A check that needs real hardware, a live session or a time not yet come goes
into the repo's `docs/device-verification-queue.md` with the exact protocol, what a pass proves,
what a fail proves, and the cost. The unit ships, but it is not done until the entry clears. Why: a note in a random file
is never found again, and a cheap, exact protocol is one that gets run.

## Compound

Compound runs after every work review, and always when you say "compound". It writes up each
non-obvious problem the unit solved, in `docs/solutions/<category>/`, with its symptoms, root cause,
the evidence for the fix, and a Reuse section, adds an index line, and updates the resume point. It
also supports a checkpoint when you ask to compound and compact together. The checkpoint saves the
handoff on the current branch and leaves the unit open. The ordinary closure step still asks before
merging unless a standing grant applies.

**Checkpoint mode.** `/methodical:compound checkpoint` does the write-up and the resume point
without merging or pushing, and verifies the project records before treating the handoff as current. The compaction mod (below) offers it; you can also run it yourself at any time.

Why: only written-up solutions are what a later session finds before solving a familiar problem
again; the [failure modes page](failure-modes.md) shows what happens when the step is skipped. A memory pointer
alone is not the compound step.

## Compact

Compact runs when the context window is half full, or when you say so, not after every merge. It
writes the resume point (`docs/resume.md`) first: where things are, the next action, every ruling
still in force verbatim, and what is open or owed. Rulings are written there the moment they are
given, not only at this step. Then you run `/compact`. Why: a compaction's summary is a paraphrase,
and a paraphrased ruling is a lost ruling.

**Compound before compact.** On a Claude Code build that loads plugin modules, methodical's
compaction mod offers the checkpoint before a compaction and never blocks one. If the handoff is not
current, you get one offer (a toast, and the model says in one sentence that a checkpoint is a good
move) when the conversation reaches 45% of the model's context window, a little before the half window
that is the target for compacting; if you take it and carry on it is not repeated, and one more comes
shortly before Claude Code's own compaction threshold if the handoff is not current by then (and again after new work makes it stale). When you say “compact” or type
`/compact` with a stale handoff, you get one question: *Compound first* or *Compound first, then compact
for me*. Say “compound, then compact” to request the same pair from chat. A current handoff lets a plain
compact request go straight through. Esc or “just compact” takes you directly to native compaction. After a
compaction that was not declined and not preceded by the second offer, the model is told to mention the
checkpoint in one sentence if the summary lists lessons not yet written up. Threshold compactions are
never held. The handoff counts as current only until something changes after it: any non-read-only
call, a prompt that adds new input, a compaction or the end of the session. Options: `offer` (`off` turns the
offers, the question and the note off), `nudgePercent` (where the first offer comes) and `nudgeReserve`
(tokens before the host's threshold at which the second comes).


## Shared native execution

Both production adapters use the canonical method under `packages/methodical-core/method/`. The native overlay translates structured questions, child invocation and lifecycle controls. A platform name is not a support claim; consult [platform support](platform-support.md).

A routed child uses an approved, candidate-bound intent, not a hand-selected stronger model. Fresh deterministic feedback can justify a bounded policy adjustment. The checkpoint carries pending routing state and selected evidence; resuming does not reset counters or erase unresolved reviews.
