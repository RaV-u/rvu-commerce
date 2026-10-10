# RVU Commerce M2 — Lab readiness (2026-10-10)

All **18** instructor-selectable lab profiles have executable training workflows and regression tests: five core plus thirteen extended. The default `secure-baseline` remains protected. Advanced workflows and specialist adapter limitations are described in `docs/EXTENDED_LABS_INSTRUCTOR_AR.md`.

| Scenario | Instructor-only training behavior | Verified automated evidence |
| --- | --- | --- |
| B01 — Client-controlled quote | Baseline rejects an altered quoted amount; B01 can pay below the authorized server quote | Quote linkage, settled total and instructor evidence |
| B04 — Promotion history | Baseline prevents stacking/reuse; B04 permits A → B → A application history | Final order discount and repeat-code evidence |
| B08 — Payment proof reuse | Baseline binds payment to the current intent; B08 can confirm a new order from an earlier settled payment | Unpaid confirmed order, no new wallet debit, refund guard |
| B10 — Gift promotion cycle | Baseline excludes gift cards from promotions; B10 permits repeatable discounted purchase and one-time full-value redemption | Net positive wallet change, double-redemption rejection, evidence |
| R01 — Voucher race | Baseline claim is atomic; R01 intentionally separates check and write | Native PostgreSQL simultaneous requests produce multiple claims without deadlock, order discount and instructor evidence |

**Automation:** `npm run typecheck`, `npm run build`, 39 native backend/database tests and 4 connected React UI tests have passed. The Docker Compose and HTTP proxy smoke job has also passed, confirming container startup, host access and a complete purchase/refund journey; see the [CI results](https://github.com/RaV-u/rvu-commerce/actions).

**Scope and limitations:** This is an intentionally vulnerable **local-only** teaching application; do not deploy these profiles to public networks. Full desktop/mobile browser visual QA, instructor-led walkthroughs, local WSL2 performance and repeated timing reliability on student machines remain manual acceptance work. CI success verifies the coded scenario paths, but does not certify manual playability, timing repeatability on every student laptop, or a line-for-line clone of original external labs.

## Extended training scenarios (13)

B01, B02, B03, B04, B05, B06, B07, B08, B09, B10, B11, B12, R01, R02, R03, R04, R05, R06. The thirteen beyond the original five are implemented with run-scoped `store.lab_states`, `store.lab_sales`, `store.lab_evidence` and domain-specific verification records; see the instructor guide. These are intentionally vulnerable conceptual reconstructions, not assertions of identical external PortSwigger runtime behavior.

## Instructor release checks

1. Keep one profile per new run; only the instructor service may choose a profile.
2. Require a patched/secure negative control for each vulnerable flow.
3. Verify persisted order, wallet and evidence records, not merely a successful HTTP response.
4. Verify student sessions cannot use instructor routes or database credentials.
5. Run the full CI and local Docker test profile before teaching a live class; verify external exposure remains blocked.
