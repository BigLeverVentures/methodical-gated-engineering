# Methodical Adaptive Gated Engineering

**An opinionated, human-gated engineering loop for Claude Code and Codex**

Coding agents generate code at a pace that can outstrip human judgment. Methodical keeps human-in-the-loop gates in place so review can keep pace as work accelerates.

Methodical is a standalone, MIT-licensed framework for working with coding agents. It uses a shared core with adapters for Claude Code and managed Codex CLI, organized around three connected practices:

* A North Star, with human judgment at the gates. Write down what the project is meant to achieve. Each plan explains how the change advances that goal and what it leaves short; reviews check against it. You choose the goal, approve the plan, and authorize the merge. The agent tests risky assumptions, then brings the work through separate model reviewers matched to its language and domain. Material findings are fixed and re-reviewed, with a stop rule to keep review from continuing for its own sake.
* Adaptive allocation. Match the task to the right tools, model capability, and reasoning effort. The aim is to achieve the required quality with the lowest practical token spend and cost. Deterministic tools handle routine checks, while model and effort choices start from published platform guidance. Task risk, verified failures, and review feedback guide when to increase capability or effort.
* Compound → compact → continue. Capture reusable lessons, current state, next actions, active rulings verbatim, open findings, and outstanding checks in project files. Then compact and continue with a focused working context. Repeat throughout a long workday: many successive contexts can carry one continuous piece of engineering work forward. This way, important decisions and learning have a durable place to live.

For someone learning to code, the loop provides structure around unfamiliar decisions. For someone working intensively on complex or security-sensitive systems, it provides regular opportunities to catch mistakes and check that the project still serves its purpose.

Try it on one bounded change in a repository you know. If you want to help, contribute by establishing and replicating [benchmarks](docs/testing-0.11.0.md), reporting failures, sharing model and effort profiles, or building an adapter for a new model. To get started, see [how to help](#help-build-the-next-version).

## Platforms in 0.11.0

One shared core defines the method. Each adapter connects it to the host's capabilities; the integrations have different strengths and limits.

| Platform | What it gives you | Release scope |
|---|---|---|
| **Claude Code** | The most complete native integration: Agent routing, workflow hooks and compound-before-compact reminders | Qualified capabilities on local macOS, Claude Code **2.1.302**. Normal plugin and project trust apply. |
| **Codex** | The same method, allocation policy and project records, with core-controlled **managed CLI** worker dispatch | Qualified capabilities on local macOS at the [recorded CLI version](docs/platform-support.md#client-and-runtime-versions), under the tested project configuration. Desktop/native-child-hook dispatch is **unsupported**. |
| **Portable Agent Skill** | Common instructions and references for an Agent Skills-compatible reader | Distributed as an instructional skill package for compatible readers, including Hugging Face distribution. It supplies no native hooks, routing or compaction runtime. |

Claude Code is the closest fit to the original plugin; managed Codex CLI is the second supported native route. This describes integration completeness, not comparative model quality. Native packages require **Node.js >=22.13**.

The release is **GO-WITH-LIMITS**: the documented checks passed within their stated scope. Four fresh same/cross-host recovery directions and both native source automatic boundaries passed. Recovery preserves selected captured records; automatic-boundary tests used process-local settings, so they do not prove default-window behavior or preservation of an entire conversation. Other client versions, native Linux execution, cloud/browser surfaces and arbitrary installed-plugin combinations remain unqualified. The [platform support matrix](docs/platform-support.md) records the exact controls and preservation exclusions.

The [testing appendix](docs/testing-0.11.0.md) records the 28 historical workflow observations, eight comparative work arms and affected production checks, including failures, fixes and the limits of each result. It provides an initial qualification baseline for contributors to reproduce and extend.

Gates and approval records are cooperative workflow controls, not a security or billing boundary. No general cost or quality advantage is established. The exercised Claude paths have no demonstrated quality regression, but performance parity with the older Claude-only release has not been measured.

## Install

Download the Claude Code or Codex archive from [release 0.11.0](https://github.com/BigLeverVentures/methodical-gated-engineering/releases/tag/v0.11.0), check its SHA256 against the release's `SHA256SUMS`, and extract it. Enter the extracted top-level directory containing its README and marketplace catalog, then use the commands for that host:

### Claude Code

```bash
claude plugin marketplace add .
claude plugin install methodical@methodical
```

### Codex

```bash
codex plugin marketplace add .
codex plugin add methodical@methodical-codex
```

Keep the extracted directory while its marketplace is registered. Accept normal trust prompts and start a fresh session to check activation; no app restart is required by the installer. Follow the archive's README and [setup guide](docs/setup.md) for the supported host route, update/removal details and recovery preparation. Codex workers use the packaged `dispatch-cli` protocol after approved intent preparation.

You can also install from a checkout pinned to `v0.11.0` using the same local marketplace commands. Retain the installed commit and package inventory: a displayed version alone does not prove byte identity. Preserve your project records before an update or rollback, and recheck activation in a fresh session.

Start with a request such as: “Add input validation to this function. Use Methodical; show me the plan before building.” The method calls for naming each step and bringing material decisions back to you. In Claude Code, `/methodical:rules` shows the rules and routing table; use the [activation checks](docs/setup.md) to verify that the integration loaded.

## Is it for you?

Methodical is for work you want to understand, review and continue. For a beginning coder, written plans and explicit decisions provide structure around unfamiliar choices and can help catch mistakes before they become costly. For an experienced developer working intensively on complex or security-sensitive code, assumption checks, separate review and recorded rulings provide another layer of safeguards. Your project's tests and security practices remain part of that work.

| Your starting point | What the loop gives you |
|---|---|
| You are new to coding | A clear goal, a plan you can judge, separate review and specific decisions before work reaches the main branch. |
| You work on complex or security-sensitive code | Checks against your intent and the code, verification of risky assumptions, stack-appropriate reviewers and a final backstop on escalated work. |
| Your work spans sessions or tools | Written rulings, indexed lessons and captured project records for a supported recovery path. |

You choose the goal, approve the plan and authorize the merge; the agent handles the work between those decisions. See [who owns what](docs/the-loop.md#who-owns-what).

## The idea

**The North Star guides what should be built. The backstop checks what was built on escalated units.** Between them, planning, verification, and review carry your intention through the work.

- **Keep the North Star in view.** Each plan states how the unit advances the project's goal and what it leaves short. Behavior changes get course checks, and standard reviews include a North Star seat. A unit is judged against the project's intent as well as its own acceptance tests.
- **Plan before execution.** Agree on what is being built before implementation starts.
- **Check assumptions before relying on them.** Plans with enough risk triggers are deepened by testing the behavior they depend on.
- **Review, fix, and review the fixes.** Separate seats examine the plan and finished work. Material findings are fixed and re-reviewed until a pass finds no material new findings. Lesser findings become known limits rather than extending review indefinitely.
- **Allocate tokens and models deliberately.** Models and effort are assigned by role. The plan's risk determines where stronger models and additional verification are needed, so the workflow adapts to the unit.
- **Give escalated work a final backstop.** After the review round clears and fixes are committed, the backstop checks the final candidate. Material backstop findings are fixed, and the affected reviews and backstop run again before the merge decision.
- **Use human judgment at material decisions.** Ask for your ruling on the project's goal, plan approval, money, irreversible actions, and merging to `main`. A recorded standing merge grant can authorize the merge in advance.
- **Carry learning across sessions.** Write down non-obvious solutions and preserve active rulings verbatim before compacting. The compound-before-compact offer brings that checkpoint to you near the boundary. See [Context travels with you](#context-travels-with-you).

## Context travels with you

**Compound → compact → continue is a working rhythm for the whole day.** A large context window gives you room for a difficult task; the method encourages deliberate resets before you fill it. The aim is to reduce the accumulated conversation carried into later calls, with decisions and reusable knowledge stored in project files.

For a million-token window, the intended working target is compaction around **50%**, or sooner at a completed work boundary. Before that reset, compound the lessons and save the resume point: current state, next action, active rulings verbatim, open findings and checks still owed. Then continue in the compacted conversation or a fresh session. A day with many such cycles can remain one continuous piece of engineering work.

In Claude Code, the context guard defaults to an early reminder at **45%**, leaving room to compound before the 50% working target. It also offers a reminder before the host's own compaction boundary. When a handoff needs updating and you type `/compact`, Methodical offers to compound first. You decide whether to accept; the reminder does not itself compact. The 50% target is a workflow recommendation, not the host's automatic threshold or a guarantee of unchanged reasoning. You can adjust the reminders in `/config`.

The native adapters also support explicitly captured project records and pre/post identity checks for recovery. Follow the [checkpoint protocol](docs/setup.md#preparing-routed-work) to prepare those records. Codex uses its documented checkpoint and managed CLI lifecycle; the Claude reminder and typed-command behavior below do not imply equivalent native Codex controls. The portable skill supplies instructions only. Qualification of automatic boundaries used the process-local settings in the [support matrix](docs/platform-support.md), rather than proving a default 50% boundary.

That checkpoint turns the work just completed into context the next session can use. Compounding writes non-obvious solutions into `docs/solutions/` and updates `docs/resume.md` with the current state, next action, open items, and active rulings verbatim.

Lessons held only in conversation context can be lost when it is compacted or a new session starts. Indexed solution files persist across sessions: they preserve the problem, its cause, the evidence for the fix, and how to reuse it. The next session can read that record alongside your rulings, instead of relying on what remained in conversation memory.

Compaction then frees context space for the next unit. **A completed work unit is a good time to compound and compact, even before the reminder.** If you finish a meaningful unit at 30% and expect to compact at 50%, starting the next unit leaves only 20% of the window before your intended boundary. Compound and compact at that work boundary instead, so the next unit starts with more room for its plan, implementation, and review.

In Claude Code, the handoff works across those moments:

- **As context grows.** When the handoff needs updating, the guard automatically offers a compound checkpoint. The checkpoint writes outstanding lessons and the resume point without merging or pushing.
- **When you type `/compact`.** With no current handoff, Methodical asks one question: *Compound first*, or *Compound first, then compact for me*. Esc compacts as is, and "just compact" skips the question without argument. Host-triggered compactions proceed without waiting for a checkpoint.
- **When work resumes.** The compacted session, or a new one, is instructed to read the resume point first. Indexed solution write-ups are available when related work needs them.

The guard is a reminder: you decide when to compound and compact, and you can always compact without compounding. The written handoff preserves the lessons and decisions it records; it does not preserve every detail of the conversation or guarantee unchanged reasoning after compaction. The compound and compact skills can also be invoked directly.

## Set up a repository

The shared method writes the project records below. The roster, native commands and load checks in this section describe Claude Code; see [Codex setup](docs/setup.md#codex-repository-marketplace) and the [support matrix](docs/platform-support.md) for its managed CLI route.

None of Methodical's files is needed up front. Each appears when its step first needs it, and each stays in your repository if you uninstall.

| File | Written by | Holds |
|---|---|---|
| `docs/north-star.md` | `north-star`, with you | The project's goal |
| `docs/brainstorms/` | `brainstorm` | The problem in your words, one file per unit |
| `docs/plans/` | `plan` | One plan per unit |
| `docs/solutions/README.md` | `compound` | The index of solution write-ups |
| `docs/resume.md` | `compact`, `compound` | Where the work stands, and every ruling in force, verbatim |
| `docs/rulings.md` | the first time your words are recorded | Your rulings, verbatim |
| `docs/device-verification-queue.md` | `work`, when a check needs hardware or a later time | Checks still owed |
| `.claude/reviewer-roster.md` | you, optional | Extra reviewers |

If your project's North Star already lives elsewhere, put a short `docs/north-star.md` in place: two or three lines on who the project serves, what they receive and the bar, with a link to the full text. The skills read that file and do not follow a link inside it.

Before Methodical first records your own words, it asks whether they go in tracked `docs/` or in gitignored `docs/private/`. If your `.gitignore` has `.claude/*`, add `!.claude/reviewer-roster.md` after it, or the roster is never committed.

**Which tests run.** Methodical runs all of your project's tests before every commit and before every review, and your repository defines what those are. To make commits cheaper, add lines to your root `CLAUDE.md` in the form `narrow-check: docs/briefs/ — make docs-check`, on their own lines and without backticks. When every path in a commit starts with a listed folder (ending in `/`) or is a listed file, Claude runs the commands of the lines it matched; anything else runs everything. The review and its fixes always run everything, and so does a merge, unless everything already ran on the commit being merged. Use this only where your CI runs everything on every push, and only you write the line ([details](docs/setup.md#which-checks-run-before-a-commit)).

**Check that it loaded.**

For an extracted or pinned release, check the installed package against that release's inventory and source commit; do not update it merely because `main` has moved. The update commands below describe a Git marketplace installation following `main`. All installations need a fresh-session activation check.

1. Run `claude plugin marketplace update methodical`, then `claude plugin list`. The version can stay the same across commits, so also compare `gitCommitSha` for `methodical@methodical` in `~/.claude/plugins/installed_plugins.json` with the newest commit on `main` of the marketplace repository. If it is behind, run `claude plugin update methodical@methodical`; if that says it is already at the latest version, see [the setup page](docs/setup.md#check-that-it-is-installed-and-loaded). The marketplace follows `main` unless it was added with a `#ref`, so a branch that is not merged to `main` cannot be installed from it.
2. A session keeps what it loaded when it started: one started after the installed commit last changed is current, and one opened before still runs the old copy. `/reload-plugins` loads an install into the session that is open, but we have not verified that it runs the session-start hook again.
3. Type `/methodical:rules`. You get the rules and the routing table. If it reports the table is missing and prints defaults, the plugin is installed but its session-start hook did not run; do not read the defaults as a pass. Only you can type it; a model cannot run it, and its description of its own context is not a check.

**Cloud sessions do not run Methodical.** Claude Code's documentation says a cloud session (claude.ai/code, the mobile app, or `claude --cloud`) does not install the plugins a repository turns on. Such a session reads your repository's files and `CLAUDE.md`, and gets none of the rules, step skills, routing, or gates. Do not assume you have Methodical everywhere. We have not tested this or the workarounds. To work with it, run the loop locally and use the cloud for the build only, put a line in `CLAUDE.md` that makes a cloud session say Methodical is missing, or keep the cloud for work that needs no gates. [Setup details](docs/setup.md).

## The loop

**brainstorm → North Star → plan → deepen → plan review → work → work review → compound → compact**

| Step | What it does |
|---|---|
| `brainstorm` | Explores what to build and why in `docs/brainstorms/` |
| `north-star` | Records the project's goal with you and anchors each unit to it, so plans and reviews can check that the work stays on course |
| `plan` | Writes `docs/plans/<date>-<slug>.md` before implementation; you can waive it |
| `deepen` | Tests risky assumptions when the plan crosses the risk threshold |
| `plan-review` | Independent reviewer seats check the plan before asking you to approve it |
| `work` | Builds the approved plan on a short-lived branch, committing as tests pass and pushing the branch—never `main` |
| `work-review` | Checks the finished diff against the plan and North Star; material fixes are re-reviewed, and escalated units receive the final backstop review |
| `compound` | Writes non-obvious solutions into `docs/solutions/`, then asks whether to merge unless you have granted standing authority; `compound checkpoint` writes up and saves the resume point without merging or pushing |
| `compact` | Writes the resume point and preserves every active ruling verbatim before context is compacted |

In Claude Code, each step is also callable directly as:

```text
/methodical:<step>
```

## The gates

A gate is a point where Methodical stops because proceeding requires a human ruling.

Methodical stops for:

- **The North Star.** Claude can help write the project's goal; choosing it is yours.
- **Plan approval.** Reviewers can judge a plan sound. Only you can authorize building it.
- **The merge.** `main` is your trunk. Nothing merges without your go unless you have explicitly recorded a standing merge grant.
  - To record one, put `merge-grant: standing — when CI is green on the pushed commit` on its own line, without backticks or numbering, in your repository's root `CLAUDE.md`, `docs/rulings.md`, or `docs/private/rulings.md`. A copy inside a code block there counts too, so never leave the example in one. If Claude cannot verify a condition after the dash, it asks. A `merge-grant: ask` line in any of them takes the grant back, and only you write the line ([details](docs/the-loop.md#the-gates)).
- **Your words.** Before the system first records your rulings or other words in the repository, you choose whether those records are tracked or private.
- **Money or irreversible actions.** These always require approval.

In Claude Code, Methodical asks each gate as a questionnaire, recommended answer first, which the client flags as waiting on you. Other hosts use their supported interaction surface; the underlying need for your ruling stays the same.

Your word also rules the process itself.

Say to skip the plan, in your own words, and it is waived for that request and Methodical carries on. It never offers the skip. Skip any step the same way and nothing is said about it. A waiver applies only to that request; the system does not turn it into a preference.

The point of a gate is not to make the human approve routine work. Routine approvals become reflexive, and a reflexive approval is not a decision.

## Reviews are bounded

The standard review includes four perspectives (trivial documentation diffs get one rigor seat):

- **North Star** — does the work advance the project's actual goal?
- **Code-grounded** — are claims about the existing code true when checked against the code?
- **Simplicity / taste** — is the change clear to use, and what can be removed or made simpler?
- **Rigor** — what cannot work, violates a ruling, or would produce a misleading result?

A correctness reviewer is also selected for each detected language. Swift, Python, and TypeScript have dedicated lenses; other stacks receive a named generic correctness review.

Repositories can add their own reviewers through `.claude/reviewer-roster.md`.

Review is a correction cycle: reviewers find material problems, the work is fixed, and the affected seats review the fixes. It ends when a pass finds no material new findings; lesser findings become named limits rather than reasons for an indefinitely expanding review cycle.

On an escalated unit, the backstop follows that cycle with a review of the committed candidate. If it finds a material problem, the fix goes back through the affected seats and the backstop before the merge decision. The backstop is part of work review when the plan calls for it; it is not a separate step you have to remember to invoke.

## Base routing and escalation

**Allocate resources to the decisions the work needs.** Methodical assigns models and effort by role, plan risk and verified feedback. Deterministic checks should use suitable tools; reasoning escalation needs evidence. Reviews, retries and context preservation also consume resources, so judging the allocation requires measuring the whole workflow. No fixed token saving or same-budget quality improvement is promised.

Simpler units can use shorter contexts and the lighter base orchestrator. Shorter contexts reduce the tokens carried through repeated calls, while lighter orchestration leaves the stronger-model allowance available for the work that needs it. Riskier units direct more of the budget to verification and review.

One shared policy resolves each host's dated profile. Worker, decider, census and backstop roles map to supported model/effort choices; the parent conversation stays on your own setting. Claude role model options remain available in `/config`. The profile distinguishes official guidance, Methodical interpretation and qualified native overrides.

A plan's `none`, `lean` or `full` risk level sets oversight. Universal and stack-specific reviews remain, material fixes receive affected re-review, and escalated work gets its final exact-candidate backstop. Fresh reproduced feedback can justify a bounded model or effort adjustment. Missing dependencies or delivery failures do not justify reasoning escalation.

For routed work, the runtime binds an approved unit, candidate and complete brief into an intent. Claude uses its native pre-tool adapter; managed Codex CLI workers use the packaged `dispatch-cli` protocol. Codex native child-hook routing remains suspended. Pending or unknown dispatches remain durable debt. [Model routing](docs/model-routing.md) explains the policy; [the minimal example](examples/README.md) prepares a read-only review without spending tokens. Native execution support remains subject to [qualification](docs/platform-support.md).

The session gets a nonblocking recommendation the first time in a session only; your settings always win.

## Models are routed by role

| Role | Work |
|---|---|
| `decider` | Plans and judgment-heavy review seats |
| `worker` | Research, simplicity and solution write-ups |
| `census` | Searches, inventories and North Star checks |
| `backstop` | Escalated review of the committed candidate |

In Claude Code, the `offer` option (`on` or `off`) controls the compound-before-compact reminders. The [context guard](#context-travels-with-you) handles their timing within the plugin, and two more options in `/config` adjust it: `nudgePercent` (where the first reminder comes, as a percent of the model's context window, 1 to 100; default 45, and 100 turns the first reminder off) and `nudgeReserve` (how many tokens before Claude Code's own compaction threshold the second reminder comes; default 120000).

The principle is simple: **put the strongest judgment where a wrong decision costs most.**

See [`docs/model-routing.md`](docs/model-routing.md).

## How this differs from broad agent harnesses

Projects such as [ECC](https://github.com/affaan-m/ECC) take a broad-harness approach: a large collection of agents, skills, hooks, rules, and supporting machinery that users can select and customize.

That is a legitimate approach and may be the better choice when breadth and autonomous throughput are the goal.

Methodical makes a different trade-off:

**ECC provides a catalog of capabilities. Methodical provides one opinionated loop with explicit human gates.**

It also builds on [Every's compound-engineering method](https://github.com/EveryInc/compound-engineering-plugin), particularly its brainstorm → plan → work → review → compound pattern.

Methodical adds or takes further:

- a written North Star and a North Star seat in standard reviews;
- a defined risk threshold that triggers deeper verification before implementation;
- explicit human rulings at material decision points;
- code-grounded, simplicity, rigor, and stack-specific review seats;
- a bounded-review stop rule;
- role-based model and effort routing, with escalation chosen by the plan;
- explicit handling for verification owed to real hardware;
- preservation of rulings across context compaction.

See [`docs/positioning.md`](docs/positioning.md) for the detailed comparison.

## Help build the next version

Methodical is [MIT-licensed](LICENSE). Contributions are welcome: use the method, adapt it to your work, and help establish where it succeeds, where it fails and what it costs. Keep the license and third-party notices with reused material.

Three places to contribute:

- **Establish shared baselines.** Help design realistic tasks and independent outcome checks, then compare the same work under controlled conditions. Measure task success, defects, review cycles, elapsed time and total usage, including orchestration, retries and context preservation. A workflow that runs is useful evidence; showing an improvement takes a comparison.
- **Run and replicate bounded tests.** Reuse shared fixtures, record package revisions, client versions and model settings, and report failures as well as passes. Use synthetic projects or material you have permission to share. Distinguish observed results from configured settings and estimates, and keep private code, conversations and credentials out of public reports.
- **Extend model and platform support.** Contribute dated model/effort profiles or a host adapter. Gemini is one possible next adapter. Keep the common method in the shared core, map the host's actual capabilities, and qualify activation, normal trust/approval behavior, review and dispatch, and compound/checkpoint recovery. State any missing capabilities rather than assuming another host's behavior carries over.

The documented Claude Code and managed Codex CLI qualifications are a starting point. Other models and hosts can grow through community work; Gemini is not currently a qualified adapter. We welcome evidence that changes our assumptions, including results that show no benefit. General savings, quality improvements and compatibility claims need their own supporting results.

Open an [issue](https://github.com/BigLeverVentures/methodical-gated-engineering/issues) to propose a benchmark, share a bounded reproduction or discuss an adapter before a substantial change. Focused pull requests with the checks run and limits explained are welcome.

## Where this came from

Methodical grew out of a long-running, multi-module project with substantial complexity and security concerns. Keeping the work correct was only part of the problem: each unit also had to serve the original intent, and decisions and lessons had to survive across sessions.

It also grew out of a need for one workflow across projects of varying complexity. Switching between everyday tasks and difficult engineering should not require remembering which mode or collection of agents to invoke. Escalation lets the plan choose the oversight the unit needs while the workflow stays familiar.

The rules address failures encountered in that work:

- sessions drifted back to workflow defaults;
- individual units passed while the project drifted from its actual goal;
- solved problems were forgotten and solved again;
- a merge happened before the checks ran;
- model-cost assumptions turned out to be wrong;
- a model incorrectly described its own runtime state;
- an upstream dependency changed underneath the workflow;
- rules existed in files that were not actually in context;
- stubbed checks passed while failing to reproduce real behavior.

The North Star, bounded review, adaptive routing, final backstop, and compound handoff each have a job in that workflow. The full patterns and how the loop addresses each are in [`docs/failure-modes.md`](docs/failure-modes.md).

## Good to know

**Independent.** Methodical Adaptive Gated Engineering is not affiliated with Anthropic, OpenAI, Hugging Face, Every, or ECC.

**Built on prior work.** It builds on Every's compound-engineering method. The Swift, Python, and TypeScript reviewer prompts are adapted from Every's MIT-licensed compound-engineering 2.28.0 and credited in their source files and in [`plugins/methodical/THIRD-PARTY-NOTICES.md`](plugins/methodical/THIRD-PARTY-NOTICES.md).

**Works standalone.** Every's plugin is recommended, not required. Methodical runs its own loop and reviewer prompts.

**Extensible.** Add reviewers in `.claude/reviewer-roster.md`:

```text
<stack or "any"> <prompt file> [worker|census] [when: <condition>]
```

**Your project stays yours.** Methodical does not write its rules into your `CLAUDE.md`. Plans, solutions, North Star, and rulings created in your repository remain there if you uninstall the plugin.

**`--bare` sessions do not receive the rules.** Rules are supplied by a session-start hook. The individual step skills can still be invoked by name.

**Integration and instructions are distinct.** Removing a native adapter removes its integration in fresh sessions; project records remain ordinary files. A separately installed portable skill can still provide workflow instructions, but it does not restore native hooks or routing.

## Read next

- [`docs/working-example.md`](docs/working-example.md) — see the loop handle a trivial change and a substantive one
- [`docs/the-loop.md`](docs/the-loop.md) — the full method and why each rule exists
- [`docs/positioning.md`](docs/positioning.md) — comparison with broad harnesses and Every's compound-engineering loop
- [`docs/model-routing.md`](docs/model-routing.md) — role-based model and effort selection, and escalation
- [`docs/measuring-usage.md`](docs/measuring-usage.md) — measure your token use before and after, and keep re-measuring
- [`docs/failure-modes.md`](docs/failure-modes.md) — the failures that produced the rules

## Uninstall

For the Claude plugin:

```bash
claude plugin uninstall methodical@methodical
claude plugin marketplace remove methodical
```

Project records and private checkpoint evidence remain. Start a fresh session to verify removal; open sessions may retain the loaded package. See [setup](docs/setup.md#codex-repository-marketplace) for Codex removal.

Claude Code may retain a marked cache copy until its own cleanup runs. If this was your only plugin from this marketplace:

```bash
rm -rf ~/.claude/plugins/cache/methodical
```

## License

MIT. See [`LICENSE`](LICENSE).

Changes are documented in [`CHANGELOG.md`](CHANGELOG.md).
