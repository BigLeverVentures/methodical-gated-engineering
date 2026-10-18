# Verification and reproduction

The [platform support matrix](platform-support.md) records the supported clients and exclusions.
The [testing appendix](testing-0.11.0.md) records the qualification baseline and how to extend it.
This page is public verification guidance, not an operator run log or spending authorization.

## Local deterministic checks

Install the development dependencies documented in the package directories, then run the top-level
`tests/*.sh` scripts. The argument-taking maintainer publication check is run separately with its
private identifier lists; it does not run in CI. Deterministic checks do not launch model evaluations.

## Native capability limits

| Area | Qualification limit |
|---|---|
| Claude Code | Named macOS client and tested native Agent/lifecycle route only |
| Codex | Named macOS managed CLI route only; desktop child-hook dispatch unsupported |
| Recovery | Explicitly captured project records; complete conversation recovery unqualified |
| Automatic compaction | Tested process-local controls; default-window behavior unqualified |
| Isolation and billing | Cooperative workflow records do not establish security or billing boundaries |
| Other hosts | Separate adapter and three-pillar qualification required |

## Reservation guard — native protected setup owed

The experimental proof guard has deterministic mock-provider coverage only. It has no qualified
native permit issuer, provider tariff envelope or protected deployment. Its synthetic fixtures
are not live credentials, spending authority or an enforceable invoice ceiling. See the
[guard documentation](../proofs/portable-core/guard/README.md) before using that experimental code.

## Contributing a native verification

Propose a bounded synthetic fixture, pin package/client/profile/settings, preserve normal trust,
and state which observation will prove or disprove the capability. Record failures and unavailable
telemetry alongside passes. Share only sanitized results and material you have permission to publish.
Keep raw conversations, credentials and internal operator notes outside the publication repository.

For a project using Methodical, use the distributed device-verification template to track that
project's own checks in the location its contributors have approved. Those records are not part
of this distribution's qualification evidence.
