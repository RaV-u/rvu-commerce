> **Update:** This table captured M1 secure-baseline readiness. The M2 sources now contain instructor-only B01/B04/B08/B10/R01 profiles; remaining 13 scenarios are still not available. All M2 runtime tests remain pending.

# Core scenario readiness — secure baseline only

The approved architecture remains authoritative. A profile currently accepts only `secure-baseline` at the database constraint and server policy boundary. There is no vulnerable-mode request parameter, public mode list, scenario toggle, evaluator or solution endpoint.

| Scenario | Implemented safe boundary | Required next milestone | Acceptance evidence before activation |
| --- | --- | --- | --- |
| B01 — excessive client trust | Cart requests accept product ID and bounded quantity only; price comes from the catalog. Unknown financial fields are rejected. Order snapshots retain authoritative prices. | Add the approved custom workstation quote flow with a quote ID, server price, version and expiry. Then introduce a server-selected per-run strategy. | Secure quote cannot be underpaid; vulnerable quote has the intended settlement impact; cart price tampering cannot shortcut other runs. |
| B04 — business-rule history | Cart row lock; one active promotion; minimum/eligibility checks; unique account/code usage. Baseline intentionally uses the stronger once-per-account rule. | Implement approved promotion-history scenario as an isolated strategy, preserving current baseline. | Sequential replay and A/B/A histories remain blocked in baseline; evaluator checks final paid amount, not only cart response. |
| B08 — workflow validation | Order, order items, wallet debit, payment and idempotency record commit together. A GET confirmation view creates nothing. | Introduce explicit checkout-intent and confirmation transitions with payment-to-intent binding, then a separately scoped vulnerable strategy. | No confirmed unpaid order; wrong intent/version/owner cannot confirm; repeated confirm does not duplicate settlement. |
| B10 — infinite money | Gift cards excluded from promotion eligibility, purchased at face value, issued transactionally, redeemed once; gift-card orders are final sale. | Add isolated promotion-eligibility strategy and ledger-based cycle evaluator. | Baseline purchase/redeem cycle creates no net value; failed or duplicate redemption changes neither balance nor ledger. |
| R01 — limit overrun | Cart mutation/discount/checkout share a row lock; unique use constraints; independent pooled transaction design. | Pass native database + HTTP gates, validate WSL2 transport, add tracing and a controlled barrier strategy in instructor-owned test instrumentation. | Distinct backend PIDs overlap; baseline concurrent claims grant one benefit; vulnerable run has measurable repeated benefit; patch comparison; calibrated replay rate. |

## Constraints for scenario implementation

1. Select the profile at run creation from the control plane; never from student headers, cookies or bodies.
2. Keep each vulnerable strategy limited to its intended rule. Shared baseline fixes must not silently change other scenarios.
3. Add a known instructor solve and a patched regression test together. Store both outside student static roots.
4. Evaluate durable evidence: ledger, settlement, order and event records linked to the same run and actor.
5. Add scenario-specific seeds and assertions to reset. Current reset reseeds accounts/wallets but does not yet create scenario objectives, victims or evaluations.
6. Use the approved dependency order after runtime validation: B08 → R01 spike → B01/B04/B10. No specialist adapter or advanced scenario enters this milestone.

## What this milestone deliberately does not claim

- Independent database connections are designed and have a native test gate, but have not been demonstrated in the authoring environment.
- PGlite has one underlying PostgreSQL backend; its socket multiplexer is not a race-testing environment.
- Sequential idempotency results do not establish correctness under parallel traffic. The native suite is required.
- The merchant account can serialize the final settlement section. This is acceptable for the secure slice, but race instrumentation must measure the intended vulnerable interval rather than assuming it is reachable.
- Current run/version identifiers and purchase events are a foundation, not the complete trace/evaluator infrastructure specified for training scenarios.
