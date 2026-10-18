# Synthetic allocation fixtures

This directory contains deterministic proof inputs for testing admission, accounting and bounded
workflow behavior. The numeric limits and tariffs in `proposed-batch.json` and
`guard-budget-proposal.json` are synthetic fixtures, not actual expenditure, current provider prices,
subscription entitlement or permission to launch native clients.

The experimental guard reserves declared maximum exposure, settles verified usage once, and retains
uncertain holds. Tests exercise malformed inputs, cancellation, late settlement and state recovery
against local mock providers. Mock receipts do not authorize native execution.

A real evaluation needs its own reviewed protocol, current provider guidance, exact client and
package identities, normal trust, an appropriate resource allocation and explicit authorization.
No protected native deployment, enforceable billing boundary or provider tariff qualification is
supplied by these fixture files. See [the guard](../guard/README.md) and
[platform support](../../../docs/platform-support.md) for implementation limits.
