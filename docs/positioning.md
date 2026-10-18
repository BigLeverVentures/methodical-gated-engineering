# Positioning

How this plugin compares with the broad approach, and what it adds to the loop it builds on.

## Who it serves

The audience and the fit test are set in the project's [North Star](north-star.md#who-it-serves);
the README repeats the three fit bullets.

## What it is not

The other common working style installs a broad catalog of agents, skills and hooks and automates
much of the work. [ECC](https://github.com/affaan-m/ECC) (formerly Everything Claude Code) is the
best-known example and a carefully built one, with install profiles and a token-optimization guide
for trimming its context footprint. That is a legitimate choice, and often the right one for
fast-moving work. This repo makes a different trade. It is one loop rather than a catalog, designed
to be worked within an ordinary subscription, with reviews bounded to a single round by default. At
every deciding point, it stops and asks you to rule. That's what makes the method gated. A user who
wants broad automation should be pointed to it, not talked out of it.

It is also not "loop engineering" in the sense of autonomous, unattended agents (Claude Code's
`/loop`) that run until a machine-checkable condition holds. This loop waits for a person at each
gate.

## Affiliation

Independent, and not affiliated with Anthropic or Every; see the
[North Star](north-star.md#who-it-serves). Compound engineering is Every's method, and this builds
on it: [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin).
Every's plugin is recommended, not required.

## What comes from Every, and what this adds

Read against Every's compound-engineering plugin 3.30.5 (tag `compound-engineering-v3.30.5`, commit `50532b0`).

**From Every, kept:** the loop itself (brainstorm → plan → work → review → compound; at 3.30.5 Every's loop
also has a simplify step before review), the `docs/solutions/` library of written-up problems, choosing a
model per reviewer at launch, and the Swift, Python and TypeScript reviewer prompts. Those prompts are adapted
under MIT from compound-engineering 2.28.0, with credit in each file and in
[`THIRD-PARTY-NOTICES.md`](../plugins/methodical/THIRD-PARTY-NOTICES.md); at 3.30.5 Every carries its
reviewers as personas in its review skill.

**Added here, or taken further:**

| This plugin | Every's plugin |
|---|---|
| A North Star step, and a seat in every review that judges the work against the project's written goal | A strategy document read as planning input; reviews judge against the plan |
| Deepening is mandatory when two or more risk triggers hold, and the score is said aloud | Deepening is a confidence-gap step inside planning, not mandatory |
| Reviewers chosen by the languages detected, with a named generic seat when no language reviewer exists | Selection by diff content, with stack reviewers for Swift/iOS and for frontend UI races |
| Four seats in every review: North Star, code-grounded, simplicity, rigor | In code review, one always-on correctness reviewer; others conditional |
| One bounded review round, with a rule for what is material and when to stop | A single pass the user may re-run; no stop rule |
| A compact step at half the context window, writing the resume point with every ruling verbatim | A standalone handoff skill |
| A device-verification queue for checks that need real hardware | No standing queue; its simulator test skill, run by hand, reports human checks and skipped surfaces in each run's summary |
| Always-on rules delivered by a session-start hook, with no edit to your `CLAUDE.md` | No hooks |
