# Seat selection

Read by plan-review and work-review before they launch anything: which seats sit, on which model,
with which brief, and how a round runs. The always-on rules define "material", the bounded round,
the re-review gate and the re-seat triggers; this file gives the re-seat order and says how a
review carries them out.

## Roles and the routing table

Every seat has a role: **decider**, **worker**, **census** or **backstop**. Each role's model and
effort are in the routing table the session-start hook printed under "## Routing"; a role set in
`/config` (plugin methodical) changes the row's model, never its effort. The table is the one base;
escalation (below) moves seats between its rows and adds no second table. Read it from context at
launch, never from memory; if it is not in context, run `/methodical:rules`.
Why: one place to change reaches every seat; a model written into a skill would ignore it.

## Every launch

Use the production runtime described in `reference/native-routing.md` to prepare a complete, bound dispatch intent, then invoke the host's native Agent tool with that intent marker. The native pre-tool hook calls the shared policy and supplies the chosen model, effort and exact brief. Never manually choose a stronger model to simulate automatic adaptation.

For hosts exposing `subagent_type: general-purpose`, use that generic native seat. Other hosts use the documented equivalent in their overlay.

Each seat receives a first line `Lens: ${CLAUDE_PLUGIN_ROOT}/lenses/<lens>.md`, the full lens, then the brief. The host overlay names its native argument fields and supported controls. A missing hook or unsupported field is a capability limit, not an automatic routing pass. Unrelated native tools keep their normal behavior.

Why: one policy decision must reach the actual invocation; a printed table or parent-selected setting cannot prove that it did.

**The brief** names the base commit and diff range (`<base>..HEAD`), the artifact (the plan file,
or the diff), the plan's North Star statement, which files not to read whole (generated, vendored,
large) and the stop rule below; it never forbids a seat from opening a file it needs. Seats are
read-only. A seat never asks the user (AskUserQuestion is not available inside subagents); it returns its questions as text to the orchestrator. Why: a scoped brief spends judgment on the question; two seats editing one tree collide.

## The universal seats — every review

| Seat | Lens | Role |
|---|---|---|
| North Star | `lenses/north-star.md` | census; decider when it rules on a claim the end user will read |
| Code-grounded | `lenses/code-grounded.md` | decider |
| Simplicity / taste | `lenses/simplicity.md` | worker |
| Rigor | `lenses/rigor.md` | decider |

Each lens file states its own remit and why it sits.

## Stack-matched seats

Detect stacks from marker files at the repo root (and one directory down for monorepos). A row
matches when any alternative matches; `+` means both files are needed.

| Stack | Markers | Lens |
|---|---|---|
| swift | `Package.swift`, `*.xcodeproj`, `*.xcworkspace` | `lenses/swift-correctness.md` |
| python | `pyproject.toml`, `setup.py`, `requirements*.txt` | `lenses/python-correctness.md` |
| typescript | `package.json` + `tsconfig.json` | `lenses/typescript-correctness.md` |
| ruby | `Gemfile` | generic |
| dart | `pubspec.yaml` | generic |

Launch each detected stack's lens on the decider. A `generic` row gets
`lenses/generic-correctness.md` with the stack named in the brief and `lens: generic (no <stack>
lens)` in its seat line; a repo with no marker gets one generic seat. Never launch a lens for an
undetected stack; two detected stacks get both. Why: a wrong-language reviewer spends the round on
advice that does not apply, and a missing reviewer should be visible, not silent.

## The extension point: `.claude/reviewer-roster.md`

A repo may add reviewers in `.claude/reviewer-roster.md`, one per line:

```
<stack or "any"> <prompt file> [worker|census] [when: <condition>]
```

e.g. `python docs/reviewers/data-contracts.md`, or `any docs/reviewers/determinism.md when: the plan
or diff adds a hashed output path`. Fields are separated by spaces; the third is a role only if it is
`worker` or `census` (otherwise the lens sits on the decider); everything after the token `when:` to
the end of the line is the condition, in the repo's own words, read against the artifact under
review (the plan in plan review, the diff in work review). Blank lines and lines starting `#` are
not entries. Launch each line whose stack was detected (or `any`) exactly like a lens; skip a line
whose file is missing and say so in its seat line. This is the only extension point. Why: users
wire in their own or another plugin's prompts without this plugin depending on their names.

**Deciding `when:`.** Before launching, the orchestrator decides each `when:` against the artifact
and prints the decision as the seat line: holds → launch and report as any seat; does not hold →
do not launch, and print `<reviewer> · skipped · when: <condition>`. A line with no `when:` always
launches. If the condition cannot be decided from the artifact, the lens SITS and its seat line ends
`· when: undecided`. The decision is the orchestrator's; never launch a lens to decide whether it
should sit. Why: a trigger lens launched every time spends the decider on a question that does not
apply, a missed review costs more than an extra seat, and a skip that is not printed is a seat that
silently vanished.

**A malformed line is skipped, with the reason**: `<line> · skipped · malformed: <reason>`. A line
is malformed when it has no prompt file, a third field that is neither `worker`, `census` nor
`when:`, more fields before `when:`, or an empty condition. Everything after `when:` is the
condition, so a role goes before it.

## The seat line

After the round, print `<reviewer> · <role> · <model> <effort> · material yes/no` per seat, with
the model that was requested, `re-seated` after the effort when the ladder moved it and the generic
note where it applies. The backstop's line adds the candidate commit it saw, `@<short sha>`, before
the material flag, for example `rigor (backstop) · backstop · fable high · @1a2b3c4 · material no`. A roster line that
did not launch prints `<reviewer> · skipped · when: <condition>` (or `· skipped · malformed:
<reason>`), and one that sat on an undecided condition ends `· when: undecided`. Why: the user rules
on the round, and these lines show who sat, on what, and what needs fixing.

## Escalation

The plan's front matter carries `escalation: none`, `lean` or `full`; the plan step computes it once
and review and work read it. An escalation is a remap of seats onto rows of the one routing table.
This section names rows, never models or efforts: a seat that moves takes the target row's model
and effort, so a role set in `/config` keeps working at every level. Read the level from the
approved plan; a missing line or an unknown value reads as `none`, and a waived plan has none.

| level | set when | seats that move |
|---|---|---|
| `none` | score 0 to 2 and no named trigger; plan waived; no line | nothing |
| `lean` | score 3, or a named trigger | the worker seats (deepen's research seats and compound's write-up) sit on the decider's row; work review adds the backstop review (below) on the backstop's row |
| `full` | score 4 or more | lean, and in plan review and work review the code-grounded seat, the rigor seat and every correctness seat sit on the backstop's row; the plan stays on the decider's row |

**The named triggers.** Any one sets `lean` at least:
- a core boundary: the unit changes an interface, format or contract that other code or users
  depend on;
- a release: the unit is, or ships in, a published version;
- an escaped defect in the same area since the last unit: a defect found after a merge, in files or
  modules this unit touches.

Why: a score counts what the plan already shows; each trigger is a risk the score can miss, and a
wrong call there costs most after the merge.

**What never moves.** The simplicity seat stays on the worker's row at every level, and so do roster
lenses (their line sets the role). The North Star seat keeps its own rule: census, and the decider
when it rules on a claim the end user will read. Escalation never adds a lens or drops a seat.
Why: the simplicity seat's job is taste, which stays on the worker's row; roster
lenses are the repo's own choice of reviewer; and a dropped seat would make a clean review look
complete when it is not.

**The backstop review, inside work review at `lean` or `full`.** It reviews the committed final
candidate, in this order:
1. The round clears. Its fixes are committed and the tests are green.
2. The backstop reviews `<plan base>..HEAD`: the rigor lens on the backstop's row. Its seat line
   records the candidate commit it saw.
3. A material backstop finding is fixed and committed. The lenses whose remit the fix touched
   re-run and the backstop re-runs, each on the new candidate commit, under the round's stop rule,
   until no material finding remains.
4. The branch is pushed once for this review, after the last backstop pass.

Its brief gives the artifact (the diff), the plan's acceptance tests and its rulings first. The
round's seat lines and the known limits it recorded come after, so earlier verdicts do not anchor
it. A trivial diff (below) keeps its one seat on the decider's row and escalation adds nothing to
it. Why: a trivial diff leaves a second model nothing the rigor seat cannot see.

## Trivial diffs

A diff is trivial when `git diff --numstat <base>..HEAD` lists only documentation files, by
extension (`*.md`, `*.txt`, `*.rst`) or by place (any path under `docs/`), and its insertions plus
deletions total 20 or fewer. A comment edit in a code file is not trivial. A trivial diff gets one
seat: the rigor lens on the decider, briefed with the user's request verbatim in place of acceptance
tests, and "plan waived" when it was. Anything else gets the normal round. Why: a two-line README
note needs a check, not a panel; and no line test tells a comment from code, so a wrong "trivial"
would drop seats on code.

## The re-seat ladder

The always-on rules give the triggers; this is the order.

- **The backstop is low.** The backstop's seats move to the decider's row, and the unit is tagged
  `needs-backstop-re-review`. If the decider's row is unavailable too, the rungs below follow.
- **The decider is low.** Move decider seats to the worker in this order: plan review, rigor seat,
  plan, North Star seat. Give each moved seat the base commit and tag the unit
  `needs-decider-re-review`. If the worker's model is rejected too, try census; if even census is
  unavailable, the orchestrator sits the seat itself and says so.
- **A worker or census seat whose row is unavailable.** It moves to the other of the two rows if
  that row's model is still available, and otherwise the orchestrator sits it and says so.
- **The lean gap.** At `lean` or `full`, when the decider is low, the worker seats that sat on the
  decider's row return to the worker's row, with the same `needs-decider-re-review` tag.

A row's model is low or unavailable when the user says so ("the backstop is low" is the user's
word), or when a launch is rejected: an input validation error on `model` or `effort`, or `Agent
type not found`. A setting that silently swaps a model is not caught at launch; compare each
seat's requested and actual model afterward. Mark each moved seat `re-seated` and put the
re-review tag in the plan.

Rules that hold at every rung:
- The walk skips any row whose model is already rejected or declared unavailable. Rows can share
  one model (the backstop and the decider both set to one model; the worker and census rows by
  default), and a rejected model is never retried under another row's name.
- If every distinct alternative is exhausted, the orchestrator sits the seat and says so, naming
  the model it sat on, even if the user declared that model unavailable.
- Every seat is kept and every re-review tag is kept.

Worked examples:
- The backstop and the decider are both set to `opus`, and the user says Opus is unavailable. The
  backstop's seats skip the decider's row (the same model) and go to the worker's row (`sonnet`);
  the unit is tagged `needs-backstop-re-review`.
- Opus and Sonnet are both unavailable, with the worker and census rows on `sonnet`. The
  alternatives are exhausted, so the orchestrator sits the seats on its own model and says so, and
  both re-review tags stay in the plan.

Why: a review with a missing seat looks complete and is not.

## The round

Launch all seats in parallel. Record each non-material finding in the plan's known limits. After a
material fix, re-run only the seats whose remit it touched, on the diff since the last review.

- **A fix that fails the same way as the defect it fixed** (another guard of the same kind) means
  the approach is wrong: change it, do not add a third guard. Another kind of defect is a bug.
- **Stop** when passes return only restatements, or findings only a ruling can settle (the
  underdetermined asymptote): bring those to the user as questions with AskUserQuestion, recommendation first.
- **Two seats disagreeing** is a finding: the hard rule wins; say what the losing seat was right
  about and whether it survives the fix. Never brief seats to agree.

Why: open-ended rounds spend the budget on fixes rather than the work, and seats that cannot
contradict each other are one seat at a higher price.
