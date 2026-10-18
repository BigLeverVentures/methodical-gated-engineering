# A working example

Methodical is easier to understand by watching it run.

The first example is deliberately small: it shows what happens when you choose to skip the plan: you say so, and it carries on.

The second is more substantial: it shows the same loop adding planning, verification, reviewers, and human gates when the work becomes consequential.

## Install

Install the plugin, then open a new Claude Code session in your repository:

```bash
claude plugin marketplace add BigLeverVentures/methodical-gated-engineering
claude plugin install methodical@methodical
```

There is nothing else you need to configure to start.

If you want to see the rules Claude received:

```text
/methodical:rules
```

It prints the active rules and routing. Illustrative Claude profile; inspect the installed resolved profile for current values:

```text
## Routing (change in /config, plugin methodical)

| role     | model  | effort      |
|----------|--------|-------------|
| session  | sonnet | high (base) |
| decider  | opus   | medium      |
| worker   | sonnet | medium      |
| census   | sonnet | medium      |
| backstop | fable  | high        |
```

## Skipping the plan

If you choose to skip the plan, say so; Methodical carries on without comment:

```text
You:
Add a note to the README that this repo uses Methodical. Skip the plan, it's one line.

Claude:
Step: work.
/methodical:rules shows the full rules any time.

...creates a short-lived branch...
...edits README.md...
...runs the repo's tests...
...commits and pushes the branch...

Step: work-review.

rigor · decider · opus medium · material no

Step: compound.

Nothing non-obvious to write up.

Merge when green?
options: "Merge when green (Recommended)" / "Hold"
```

A few things happened.

**You skipped the plan in your own words.**  
Methodical starts with a plan and never offers the skip; you asked for it, so it built.

**The waiver was honored immediately.**  
It does not argue, ask again, or remember the waiver as a future preference.

**The review was proportional to the change.**  
A documentation-only diff of 20 lines or fewer is treated as trivial, so it gets one rigor seat instead of the full review panel.

**The branch was pushed, but `main` was untouched.**  
The final merge remains a human ruling.

That is the lightweight path through the same loop.

## A substantive change

Now ask for work where assumptions, architecture, and scope matter. The review settings below are illustrative and depend on role, risk and the resolved profile; they are not observations from a run:

```text
You:
Let's add per-account attribution tracking.

Claude:
Step: brainstorm.

Before I plan:
1. Which attribution sources can you actually wire up?
2. Which account identifier is authoritative?
3. Does attribution need to survive historical backfill?

...records the answers...

Step: north-star.

This unit advances the North Star by making account-level
performance attributable to the source that produced it.

Left short, on purpose:
historical attribution before the available source window.

Step: plan.

...writes docs/plans/<date>-attribution-layer.md...

Deepen score: 2 of 6 — deepening.

Step: deepen.

Question:
What does the analytics API actually return for attribution
when more than one source touches the same account?

...runs a small check against the API...

Result:
The API returns first-touch attribution only.

Impact on plan:
The plan is revised so multi-touch attribution is not implied.

Step: plan-review.

north-star · census · sonnet low · material no
code-grounded · decider · opus high · material yes
simplicity · worker · sonnet medium · material no
rigor · decider · opus high · material no
python-correctness · decider · opus high · material no

Finding:
The plan says the existing account loader already exposes
source_id, but the code does not.

...fixes the plan...
...re-runs the affected reviewer...

code-grounded · decider · opus high · material no

Approve this plan?
options: "Approve (Recommended)" / "Revise"
```

This time the loop did more because the work justified it.

**Brainstorm gathered the decisions the model should not invent.**

**The North Star connected the unit to the project's actual goal.**
In a repo with no North Star yet, this is where Methodical stops and writes one with you before planning.

**The deepen step tested a risky assumption before code was written.**

**Review seats checked different failure modes rather than asking one generic reviewer to look at everything.**

**The code-grounded reviewer found a false assumption about the existing code before implementation began.**

And then the loop stopped.

The reviewers can say the plan is sound.

Only the user can say it should be built.

## The next request starts fresh

A waiver applies to one request.

On the next request, Methodical plans again.

It does not infer:

```text
"The user usually skips plans."
```

It treats a waiver as an exception, not a preference.

## What this example shows

The operating model is simple:

```text
routine work
    ↓
run automatically

material decision
    ↓
stop for the user

small change
    ↓
small review

risky change
    ↓
deepen + full review
```

Every step names itself.

Routine steps continue without prompting, in the same turn.

Review effort scales with the work.

The loop stops where the decision belongs to the human.


## Native adapter candidate

Try the adapter in a small ordinary Git project with a committed base and an approved plan; no synthetic proof marker or private evaluator belongs in production. Ask for a read-only review first. The parent prepares an intent bound to the approved unit, scope, exact candidate, profile and sealed brief. Claude's native Agent adapter validates and reserves the intent before applying supported model, effort and prompt fields. Managed Codex CLI workers use the packaged `dispatch-cli ROOT INTENT-ID` command; the core reserves the intent before starting the native CLI with fixed selected configuration and exact sealed stdin. Native Codex child-hook routing remains unqualified. Inspect the routing record and native receipt within the platform matrix's evidence limits. Keep the initial project unchanged while you verify a checkpoint in a compatible clone. See [setup](setup.md) and [platform support](platform-support.md) for qualification status.
