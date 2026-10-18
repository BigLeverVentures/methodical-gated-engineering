# Offline reservation guard

This is operator-side experimental code, excluded from actor plugin packages. It does not create
accounts, load credentials, install native clients, provision OS restrictions or contact providers.
The only implemented authority is `mock-only`, with synthetic model names and tariff units. The
only upstream route is a fixed numeric-loopback HTTP server. No executable paid budget exists.

`qualify-guard.sh` compiles and runs the ledger, protocol and authenticated-state tests with
no real provider. `launch-isolated.sh --describe` reports the setup debt and makes no changes.

`Ledger.create` exclusively creates a new SQLite budget and scoped random tokens. It never
replaces existing state. SQLite immediate transactions and synchronous durability precede dispatch.
Ledger-owned frozen tariffs derive reservations and settlements; callers do not supply prices.
The sum of settled costs and outstanding worst-case holds stays within total, stage, host and run
caps. Request slots never refund. Duplicate final usage settles once; conflicting or out-of-bound
usage stops admission. Timeout/cancel/partial usage holds persist. Reopening a ledger marks active
work uncertain and latches stop; no automatic reset or operator-reconciliation shortcut is exposed.

`startMockGuard` validates a narrow Messages/Responses text/function subset, clamps generated
output, strips caller auth/headers, and forwards only after durable reservation and dispatch.
Redirects, unsupported/ambiguous usage and protocol errors retain the hold. HTTP retries require
fresh reservations. SSE is bounded and fully buffered until unambiguous terminal usage before
settlement. WebSockets, CONNECT, opaque remote compaction, stored context, explicit cache controls/write billing,
non-text input and paid server tools are denied. Native compatibility is not inferred.

`startMockControl` exposes fresh signed ledger snapshots on a separate authenticated Unix socket.
`GuardSession.connect` verifies a challenge against operator-pinned key/code/manifest/ledger
identity. The offline session cannot issue a native permit; `run-live.sh` stays closed even if
all historical capability booleans are true. Operator pins/tokens remain outside actor access in
an actual protected deployment; the mock process does not claim that boundary is provisioned.

An OS actor restriction and separately protected guard principal are mandatory before native
qualification. The exact deployment, all native paths and complete official price envelopes still
need verification. See the reservation-guard entry in `docs/device-verification-queue.md` for
pass/fail protocols and separately gated setup/canary/main stages. Paid provider transport and
native-permit issuance need that reviewed evidence; neither can be enabled by editing a JSON flag.

Responses cached-token usage receives the full synthetic input rate without a cache discount.
