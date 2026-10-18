# Model routing

Methodical uses one shared policy and a host-specific profile. Deterministic checks run as tools. Risk sets initial review coverage; fresh verified feedback can adjust model or effort within the unit's recorded limits. The parent conversation keeps the user's chosen model and effort.

## Baseline and overrides

Profiles in `packages/methodical-core/profiles/` retain dated official sources, the platform's guidance, Methodical's concrete interpretation, and qualified native overrides as separate information. Equal effort labels across platforms do not imply equal work or cost. Refresh profiles deliberately between batches rather than during a running unit.

Claude's production baseline uses Sonnet at medium for worker/census seats, Opus at medium for deciding work, and Fable at high for the backstop. A demanding worker uses the profile's demanding choice. The `/config` role options still change model only; the resolved profile supplies effort. Codex uses its own supported choices. See the profile itself for exact model identifiers and any native qualification override.

These are starting policies, not a promise that a vendor prescribed these four roles or that a stronger model is always necessary. A small pilot does not establish optimal settings or savings. The [platform matrix](platform-support.md) distinguishes candidate controls from live-qualified behavior.

## Actual dispatch

The parent prepares an intent bound to the approved unit, scope, exact candidate, profile and sealed brief. Claude's native Agent adapter validates and reserves that intent before applying the supported model, effort and prompt fields. Managed Codex CLI workers use the packaged `dispatch-cli ROOT INTENT-ID` command; the core reserves the intent before starting the native CLI with fixed selected configuration and exact sealed stdin. Native Codex child-hook routing remains unqualified. See the [platform matrix](platform-support.md) for the evidence and limits of each route.

The runtime keeps requested, routed and observed settings separate. A rewrite receipt is not proof of native consumption. Missing backend details remain unknown. Normal trust and execution approvals still apply; the hook cannot create a human ruling.

An escalated build reports its assurance level; the first time in a session it also gives one nonblocking recommendation from the resolved host decider profile. It never repeats or forces a setting, and later units stay silent.

## Feedback and limits

Upward adjustment requires an exact deterministic checker freshly reproducing a bound failure on the current candidate. A nonempty evidence label, a delivery mistake, a missing dependency or a preference is insufficient. Changed checkers, stale plans and stale candidate identities invalidate the intent.

Attempts, review cycles and escalations come from durable project state. A reserved invocation without a correlated child result remains unknown and must be reconciled before retry. Duplicate callbacks do not consume another reservation or clear review debt. Checkpoints preserve this state across compaction and compatible recovery.

## Reviews

Universal North Star, code-grounded, simplicity and rigor lenses remain. Stack markers select the relevant correctness lens. Lean/full risk retains its final exact-candidate backstop, and full risk moves the deciding review seats to that role. Material fixes receive affected re-review under the bounded stop rule. Fallbacks retain outstanding required reviews; a child completing does not clear them.

Use the canonical `reference/seat-selection.md` and the native overlay included with your installed package for the supported invocation fields and CLI protocol. Unsupported controls stop with a named capability limit rather than silently falling back to a different orchestration surface.

## Measuring the tradeoff

Count orchestration, parents, reviews, retries, failed delivery and preserving context alongside worker usage. Cache reads are part of input totals, not extra tokens to add again. A batch allocation is monitored between actions and is not a hard provider billing cap. Compare independently checked quality and rework before claiming a cost improvement.
