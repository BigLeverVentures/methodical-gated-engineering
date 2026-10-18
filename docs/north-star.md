# North Star — Methodical Adaptive Gated Engineering

Written 2026-10-06; direction updated 2026-10-15. Intended public distribution, MIT license.

## Who it serves

A developer who wants a consistent engineering method across coding platforms and model providers,
for everyday work and for codebases where interacting parts, human judgment, or security concerns
make an improvised session costly. Work and decisions often span several context windows or sessions.

Claude Code and Codex are the first two adapter targets. One shared core defines the method;
adapters connect it to each platform's capabilities. Portable skills are the intended basis for
broader distribution, including a path through Hugging Face.

**Direction and current support.** This document sets the product goal. Release 0.11.0 shares one
core across Claude Code and Codex adapters. Qualified capabilities cover the named local macOS
Claude Code and managed Codex CLI versions, with selected-record recovery and process-controlled
automatic-boundary evidence. Codex desktop/native-child-hook dispatch remains unsupported, and
the portable skill supplies instructions only. The [platform support matrix](platform-support.md)
records the exact installation routes, verified scope and exclusions; a host name alone is not a
compatibility claim. The broader bars below remain product goals, not claims of universal coverage.

Methodical builds on Every's compound-engineering loop: deliberate steps, human rulings at material
decisions, and lessons that compound. A broad catalog such as [ECC](https://github.com/affaan-m/ECC)
serves users who prefer extensive capabilities and autonomous throughput. Methodical offers one
consistent loop with adaptive oversight and deliberate resource use; either approach can be appropriate.

**Affiliation.** Methodical Adaptive Gated Engineering is independent, not affiliated with Anthropic,
OpenAI, Hugging Face, or Every. Compound engineering is Every's method; this builds on it.

## What they receive

One method, with platform adapters and three connected capabilities:

1. **Gated engineering.** Substantial work follows brainstorm → North Star → plan → deepen →
   plan review → work → work review → compound → compact. The session names the step; plans and
   reviews return to the project's goal. Humans rule on material decisions. Reviews match the code's
   language and domain, and material fixes receive relevant re-review under a bounded stop rule.
2. **Adaptive resource allocation.** Suitable deterministic tools handle deterministic checks.
   Model and effort choices start from the relevant platform's published selection and effort guidance.
   Task risk sets the initial oversight; observed test results, material review findings, and rework
   inform explicit, bounded escalation. Decisions and outcomes can be measured, including the cost
   of orchestration, review, retries, and preserving context. Users can change role mappings and budgets.
3. **Context continuity.** Before compaction, compound reusable lessons into indexed project records
   and preserve the current work in a durable resume checkpoint. A resumed session reads those records,
   checks them against repository state, honors active rulings, and takes the correct next action.
   Recovery across supported platforms uses the same records, without requiring the original chat.

The shared method owns these behaviors. Adapters supply host-specific activation, questions,
reviewer invocation, resource controls, telemetry, and lifecycle integration. A skill package carries
instructions and resources; its distribution location does not itself supply those runtime controls.

The user remains in control: a step they explicitly waive is waived for that request, without comment,
warning, persuasion, or a replacement gate. Methodical never suggests the waiver itself. A declined
offer is dropped for that moment. Compaction remains the user's choice; an explicit choice to compact
without compounding is honored. The recovery record distinguishes that choice from a failed write,
without re-offering or commenting on the choice.

None of this should require reading the full documentation before starting, and none carries the
author's private context into another person's project.

## The bar

Each test is phrased as the person served would judge it.

0. **They can tell quickly whether it is for them.** The README explains the method, its three
   capabilities, and the supported platforms. Comparison with broader approaches is fair and linked.
1. **The method activates on a supported installation.** A new user follows the documented short
   installation path for their platform and the next substantial request visibly starts the loop.
   Manual setup or fallback behavior is explicit. A waived step stays waived, and a declined offer
   is not pressed. The existing two-command Claude Code installation remains a regression target.
2. **Reviews fit the work and remain meaningful.** Python, Swift, and TypeScript projects receive
   appropriate reviewers; a Rails reviewer never runs on unrelated code. Material fixes are
   re-reviewed, and escalated work receives its required final review on the candidate commit.
   Fewer findings or cycles alone never establish better quality.
3. **Published material contains nothing personal.** Checks find no personal identifiers or private
   project details. The author's name appears only in LICENSE and plugin author fields. Working notes,
   plans, rulings, review reports, and raw evaluation traces remain private and are never published.
   Shared verification fixtures use synthetic projects and decisions.
4. **Every rule says why it exists.** A user can judge the reason and disagree with it.
5. **Installation is reversible.** Removing the package removes its integration and preserves the
   user's project records and unrelated configuration. Adapters do not silently overwrite instruction
   files or settings to compensate for a missing host capability.
6. **Allocation starts from published platform guidance.** Each platform profile records dated
   official sources, the recommended task/model/effort relationships, and the concrete supported
   choices. Methodical's interpretation, user overrides, and later evidence-based changes are
   distinguished from the platform's recommendations. Equal effort labels do not imply equivalence.
7. **Adaptation is observable and bounded.** A routine case uses its appropriate baseline; a riskier
   or demonstrably failing case escalates for a recorded reason. Missing dependencies are separated
   from reasoning failures. Requested settings, observable applied settings, fallbacks, review debt,
   and budget stops are reported honestly. A required review never disappears because resources ran out.
8. **Performance claims have evidence.** Comparable tasks and independent outcome checks measure
   completion quality alongside total resource use, elapsed time, rework, and review cycles. Missing
   telemetry is marked unavailable and estimates are labeled. A small feasibility proof establishes
   operation and measurement, not general quality improvements or savings.
9. **Compound, compact, and resume preserve usable knowledge.** Indexed lessons and a current
   checkpoint preserve distinct things. Both supported hosts pass manual/automatic compaction and
   recovery checks, including fresh-session and cross-platform recovery. A resumed session honors
   seeded rulings, recognizes unresolved findings, retrieves a relevant lesson, and continues correctly.
   Interrupted or stale checkpoints do not masquerade as current. User-declined compounding is honored.
10. **Support claims match execution.** Shared scenarios check all three capabilities on each
    advertised host/surface/version/install combination. Documented, live-verified, manual, and
    unavailable capabilities are distinguished. A package that loads is not thereby fully verified.

## Deliberately left out

- **Universal host or model support in the first proof.** Prove Claude Code and Codex adapters
  before expanding. Models must be available to the user, and platform restrictions remain in force.
- **A hosted engineering service.** Repository execution, accounts, billing, and a new hosted
  orchestrator are outside the initial portability proof. Hugging Face discovery and distribution
  do not require moving users' private engineering work into a hosted service.
- **Guaranteed savings or lossless conversation preservation.** Measured allocation and recovery
  are product goals. There is no promised percentage saving, and a checkpoint preserves selected
  important state rather than every conversational detail. Existing [usage measurement guidance](measuring-usage.md)
  remains a starting point for the current Claude Code implementation.
- **Dependencies on other workflow plugins.** Every's compound-engineering is credited and
  recommended, not required. Users may wire in other tools without making them mandatory here.

## Decisions

- One shared core and Claude Code/Codex adapters, with one method and compatible project records.
  Platform packages may have different manifests and integration code; they do not fork the method.
- Portable Agent Skills packaging is the direction for broader distribution, with Hugging Face
  a prospective distribution channel. Publication and marketplace admission are separate decisions.
- Published platform guidance is the baseline for model selection and effort. Shared roles
  (decider, worker, census, backstop) resolve through platform-specific profiles rather than
  Claude-only aliases in the common core. Refresh sources deliberately between evaluation batches.
- Risk and observed feedback govern explicit escalation, with bounded review and user control.
- Compound precedes Methodical-initiated compaction unless the user explicitly declines it;
  automatic host compaction has a tested recovery path and an accurately stated support limit.
- Current Claude Code rules arrive through SessionStart rather than modifying the user's CLAUDE.md.
  Other adapters must prove activation and clean removal through their native supported facilities.
- The loop is the endorsed path. Diverging from it is the user's discretion and is never put on the menu.
- Independent, intended public distribution, MIT license. Every's prior work remains credited.
- The failure-modes page describes patterns only, with no counts. Performance claims require their
  own evidence; comparisons with ECC remain limited to human rulings and deliberate resource use.
