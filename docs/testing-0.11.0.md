# Testing appendix: the 0.11.0 qualification baseline

The qualification programme exercised the three pillars—gated engineering, adaptive allocation and context continuity—in synthetic projects on Claude Code and Codex. The original programme ran on October 16–17, 2026; production-adapter qualification and release closure continued through October 18. This appendix records the accepted results **and their limits**, so subsequent tests have a baseline to compare with.

**Result: GO-WITH-LIMITS for local macOS Claude Code and managed Codex CLI at the [recorded versions](platform-support.md#client-and-runtime-versions).** Codex desktop/native-child dispatch is unsupported. The portable skill is instructional, with no native execution qualification. See the [machine-readable summary](evidence/0.11.0-qualification.json) for counts, settings and source-record digests.

These are maintainer-reported engineering qualifications, checked against recorded evidence. They are not an independent third-party certification, a statistical reliability rate or a general productivity benchmark. An accepted observation means its named contract was demonstrated; it does not erase earlier failures or expand support to another route.

## What was tested

The original proof programme accepted **28 scoped observations: 14 contracts on each host**. Several used proof packages, session-only configuration and external orchestration. They establish the historical workflow evidence below; the separate production checks qualify the shipping routes. Do not add these observations to later checks to manufacture a combined pass percentage.

| Contract | What the check sought | Historical result |
|---|---|---|
| F1: activation/removal | Load common instructions; remove the tested integration without deleting project records | Accepted on both named proof routes |
| G1: approval/change control | Respect scoped approvals and denials | Accepted on both; cooperative controls |
| G2: review/fix/re-review | Bind review to the current candidate and review material fixes again | Accepted on both |
| G3: waiver/decline/checkpoint | Preserve the human decision and outstanding work when a step is waived or declined | Accepted on both |
| A1: guidance baseline | Record model/effort settings against the host guidance profile | Accepted on both; configured settings |
| A2: verified-feedback adjustment | Change the native allocation after a reproduced failure | Accepted on both through external control; automatic production routing required separate qualification |
| A3: failure/fallback/budget | Distinguish capacity failures from delivery, configuration and spending stops | Accepted on both within the bounded protocols |
| C1: lesson/checkpoint | Write a discovered lesson and a durable resume point | Accepted on both |
| C2: manual compaction | Continue from the prepared records after a native manual compact | Accepted on both tested proof sessions |
| C3: automatic compaction | Observe a genuine native automatic boundary before checking continuation | Accepted on both under process-local controls |
| C4: fresh same-host recovery | Restore captured records in a fresh context on the same host | Accepted on both; records-only scope |
| C5: cross-host recovery | Restore captured records in the other host | Accepted in both directions; records-only scope |
| C6: negative preservation | Keep unresolved state through stale, interrupted or declined checkpoint paths | Accepted on both named protocols |
| E1: evidence integrity | Bind receipts, identities, outcomes and usage to the tested work | Accepted at the recorded scope; unknowns remain explicit |

## Work quality and allocation pilot

The comparison used **eight initial work arms**: two task families × two policy assignments × two hosts. Host/policy assignments were reversed between pairs. Each arm required five current-candidate review seats and a final backstop; material repairs were checked and reviewed again. This is a small comparative pilot, not independent repeated sampling sufficient for a performance estimate.

| Task family | Arms | Initial frozen checks | What review revealed | Final outcome |
|---|---|---|---|---|
| Grouped public contract | Four: fixed/adaptive on both hosts | All four passed 11/11 | No functional worker failure; delivery faults were tracked separately | Required reviews and backstops accepted |
| Migration/recovery | Four: fixed/adaptive on both hosts | All four passed 15/15 | A valid singleton large-integer mean could overflow despite the frozen score | One bounded repair per arm passed the reproduced regression and required reviews/backstops |

The adaptive repairs changed Codex effort from Sol/medium to Sol/high and Claude allocation from Sonnet/medium to Opus/high. The fixed-policy arms also repaired the defect at their unchanged settings. **This demonstrates a feedback/adjustment path; it does not show escalation was necessary, cheaper or better.** The review-found regression was retained outside the unchanged scorer and checked before the later review round. No permanent escalation-policy change follows from this pilot.

Earlier low-model testing also exposed an evaluator error: valid list and tuple materialization were treated differently. The evaluator was corrected, regression checks added and only the affected lower-model cases rerun. A scoring fault was not relabelled as model incapacity.

## Production-adapter qualification

| Area | Observed result | Scope and exclusions |
|---|---|---|
| Claude native routing | Baseline delivery, verified-feedback and stale-denial evidence retained | Native Agent route, normal trust; no blanket permission grant |
| Codex managed dispatch | Core-bound baseline and fresh feedback delivery passed; exact sealed input and native identity joined to outcome | Local macOS CLI under tested project configuration; backend effort telemetry unavailable |
| Codex feedback follow-up | One fresh Sol/high invocation passed delivery, diagnosis and preservation checks | 30,875 input / 375 output tokens for that worker only; review debt remained open; no repair credit inferred |
| Fresh record recovery | **Four of four destination readers passed:** Claude→Claude, Claude→Codex, Codex→Claude, Codex→Codex | Selected records, one restore command and pre/post checks; Codex destinations use managed CLI |
| Claude automatic compaction | Native finalizer and automatic boundary followed by records-only continuation passed after **seven admitted pressure reads** | Process controls: window 150,000 and percentage override 60; successful attempt 4, earlier failures preserved |
| Codex automatic compaction | Native finalizer and automatic boundary followed by records-only continuation passed after **nine admitted pressure reads** | Process control: token limit 110,000, context-window override unset; assessed with corrected view-field handling without another live run |
| Installation/removal | Native Codex management CLI passed local install/list/remove in disposable client state; unchanged Claude removal evidence reused | Intended entries removed, unrelated settings and project records retained; no running-session hot-unload claim |
| Distribution integrity | **131 payload files checked:** Claude 53, Codex 47, portable 31; package inventories, modes, licenses and provenance verified | Executable dependencies reused by byte comparison; final documentation/inventory changes did not receive whole-package live retesting |
| Published downloads | Both native ZIPs, manifest and checksum file downloaded and verified against prepared bytes and GitHub digests | Release publication verification; portable archive is distributed separately as an instructional skill |

The four successful recovery readers used 146,661 input and 8,946 output tokens in total, with cache included in input. **Those are reader costs, not the cost of the testing programme.** Five failed startups were preserved separately; orchestration dominated the broader programme and is excluded from these reader totals. Cross-provider token counts are not a common currency or an invoice.

For both automatic-boundary checks, the ordering mattered: finalize and verify a checkpoint, stage a newer ruling and dirty work, observe the native automatic boundary, then check continuation. Pending intents, findings and review debt had to survive. An older checkpoint could not become current merely because compaction occurred.

Claude verified selected captures, ordinary tree bytes/index/modes and six captured dispatch-dependency modes. Its entire ignored directory and fixture journal were **not independently established as unchanged**. Codex separately verified its full fixture snapshot and prior journal prefix. Neither result establishes complete conversation preservation or default-window behavior, including an automatic 50% boundary in a million-token window.

## Failures that changed the implementation or protocol

- **Native Codex child-hook dispatch failed qualification.** Loading/trust, hook matching, dispatch references, child identity and encrypted-input/rewrite compatibility were investigated. The release uses core-controlled managed CLI dispatch; desktop child-hook routing stays unsupported.
- **Evidence was not initially portable enough.** Explicit evidence capture and shared pre/post identity checks were added, with checkpoint read compatibility, then affected recovery checks were rerun.
- **Review delivery and receipts needed stronger binding.** Delivery failures were separated from model reasoning failures. Reviews had to carry the complete context and identify the current candidate before counting as assurance.
- **The compaction protocol initially accepted insufficient timing evidence.** Pressure sizing, event deduplication and exact checkpoint→new-work→automatic-boundary ordering were tightened. Earlier stopped/failed attempts remain failures; later passes have their own identities.
- **Some assessors were too strict or incomplete.** Expected journal appends and derived response fields were checked explicitly, with negative counterexamples, instead of forcing an unnecessary live rerun. Accounting review also restored omitted failed-attempt usage.

## What this baseline does not establish

No general savings, defect-reduction percentage, model ranking, optimal allocation, or performance parity with the Claude-only implementation has been established. Passing a fixture does not demonstrate that all valid inputs are covered—the integer overflow is a concrete example. Configuring model/effort does not prove backend effort. No statistical failure rate follows from these small, iteratively repaired samples.

The gates are cooperative workflow controls, not a security boundary or protected billing cap. Other client versions, arbitrary installed-plugin combinations, Linux native execution, cloud/browser execution and Gemini remain unqualified. See the [support matrix](platform-support.md) for process-cleanup and preservation exclusions.

## Reproduce and extend

The public repository contains deterministic checks. From a checkout pinned to `v0.11.0`, run the top-level scripts except the maintainer-only privacy check:

```bash
for check in tests/*.sh; do
  case "$check" in
    tests/pre-publish-check.sh) continue ;;
  esac
  bash "$check" || exit
done
```

[`production-adapters.sh`](../tests/production-adapters.sh) exercises core/adapter checks and generated-package consistency; [`portable-core-proof.sh`](../tests/portable-core-proof.sh) runs the local proof harness. These deterministic checks do **not** perform or reproduce the private native model runs. The privacy check requires private identifier lists and is excluded from CI.

Raw native transcripts, operator packets and the full live fixture corpus remain private. The accompanying JSON publishes a sanitized result summary and SHA256 digests of selected source records. Digests allow provenance comparison if a record is later shared; they do not make private evidence independently inspectable or rerunnable. A fully public native benchmark harness and sanitized live corpus remain contribution opportunities.

To build a comparable baseline, propose a bounded fixture and independent outcome checks; pin the package, client, profile and model/effort; state normal trust and plugin configuration; separate transport, task quality and review completion; record every attempt and failure; include orchestration, retries and cache in usage accounting; and report preservation exclusions. Keep historical results immutable. New hosts such as Gemini should qualify all three pillars, with unsupported capabilities stated explicitly. See the [community invitation](../README.md#help-build-the-next-version).
