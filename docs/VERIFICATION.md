# Current M2 CI verification — 2026-10-10

- `npm run typecheck`: PASS on Node.js 24.
- `npm run build`: PASS for storefront and instructor bundles.
- `npm test` against **native PostgreSQL 17**: **21 PASS, 0 FAIL, 0 SKIP**, including B01/B04/B08/B10 and genuine R01 overlapping-request tests.
- `npm run test:ui`: **3 PASS, 0 FAIL** via React → Fastify → PGlite SQL.
- Docker Compose startup, published ingress/proxy port checks and purchase/refund smoke tests are a **separate CI job**. This test has passed against the local nginx proxy and PostgreSQL 18, with a registration → coupon → purchase → refund journey; [GitHub Actions](https://github.com/RaV-u/rvu-commerce/actions) contains the verification.
- These checks do **not** replace real-browser responsive inspection and local student laptop/WSL2 measurements.
- The files under `docs/verification/` remain **historical M1 logs**, not the current M2 results.

## Archived M1 verification notes (historical)

> **M2 note, 2026-10-10:** The results below are evidence for the original **M1** sources only. M2 adds migrations, five selectable scenario implementations and tests, but no full M2 runtime execution occurred in the current sandbox (Node 22 only; npm registry DNS resolution unavailable; no Docker daemon). Static syntax parsing of 24 JS/TS files passed. Do not report the M1 pass count as M2 acceptance. Use the WSL Docker commands in `START_HERE_AR.md`, capture raw results and record new M2 evidence before a student session.

# M1 verification record

Checkpoint: 2026-10-09. Authoring runtime: Linux / Node 24.19.0. Target: Windows 11 + WSL2 + Docker Desktop, **not exercised here**.

## Observed results

| Gate | Result | Actual scope |
| --- | --- | --- |
| TypeScript strict typecheck | PASS | API, frontends and tests |
| API/SQL/infrastructure | 12 PASS, 2 SKIP | Fastify + PostgreSQL/WASM; SQL grants via SET ROLE; real local SMTP sink; parsed Compose assertions |
| React integration | 3 PASS | JSDOM → in-process HTTP adapter → Fastify → PostgreSQL/WASM; no mocked business responses |
| Store build | PASS | JS approximately 250.5 KB / 78.1 KB gzip |
| Instructor build | PASS | Independent output; JS approximately 227.3 KB / 71.7 KB gzip |
| Shell/setup/smoke syntax | PASS | Parsing only, not Docker execution |
| Production npm advisory query | 0 reported | Point-in-time registry metadata, not a full audit/container scan |

Commands:

```sh
node scripts/verify.mjs
npm run build
sh -n scripts/start.sh infra/init-db.sh
node --check scripts/setup.mjs
node --check scripts/smoke.mjs
npm audit --omit=dev --json
```

`verification/test-output.txt` records **15 passes, zero failures, two native-only skips**. When `TEST_DATABASE_URL` is supplied, native failures fail the suite; it does not silently fall back.

## Functional assertions covered

- Reapplying migrations/seeds does not duplicate products/promotions.
- Store API has no instructor endpoints; student database role cannot read control credentials or edit prices/active run.
- Owner/run-scoped inbox and one-use verification gate purchase access.
- Invalid Origin, CSRF, negative quantity and client price fields are rejected.
- Real SMTP accepts the verification message; acknowledged outbox rows are not resent on a normal retry.
- Checkout applies server prices and eligible coupon, debits wallet, creates order/payment/ledger and consumes cart atomically.
- Identical checkout retry returns the same order; a changed payload with the same key fails.
- Cross-account order retrieval/refund fails; repeated refund does not mint money; coupons remain consumed after refund.
- Stale cart and insufficient balance do not change wallet or create an order.
- Gift cards cost face value, exclude gift-only promotion, forbid refund and redeem once across accounts.
- Journals balance, balances reconcile to entries, incomplete journals fail and ledger mutation is denied.
- Reset changes active run, invalidates old sessions/objects/inboxes and seeds a fresh wallet.
- React purchase/refund and registration/verification journeys persist real data; invalidated sessions return the UI to sign-in.

## Native tests provided, not executed

1. Two real HTTP requests rendezvous while holding transactions. Their `pg_backend_pid()` values must differ and overlap; a timeout exposes serialization.
2. Twelve parallel coupon claims grant one discount. Twelve identical checkouts produce one order and one debit.

Run the separate ephemeral database test profile in README. Require all backend tests to pass without skips. Label future output by engine; do not replace portable evidence with an unlabeled native claim.

PGlite's socket package explicitly documents a multiplexer over **one underlying backend**. Its results cannot prove independent sessions, real concurrency or role separation between independent backend connections.

## Required local acceptance

- [ ] Docker images pull/build; migration job exits successfully; all runtime health checks pass.
- [ ] Both frontends/assets work through nginx; unexpected Host values are rejected.
- [ ] Host-only cookies remain separate on the two exact hostnames; student cookie cannot authenticate to control.
- [ ] Native concurrent-session and business-concurrency gates pass without skips.
- [ ] Real desktop/mobile rendering, no overflow, keyboard dialogs, visible checkout failures.
- [ ] Host/proxy registration → verification → coupon → settlement → refund smoke test passes.
- [ ] Instructor login/reset/logout work; reset under active requests does not mix generations.
- [ ] Mailpit receives outbox messages without exposing raw inbox/API host ports.
- [ ] Actual runtime HTTP/DNS egress behavior checked on WSL2; revise network restrictions if needed.
- [ ] Idle/checkout/test-profile memory and CPU measured alongside Windows, Burp and browser.
- [ ] Offline runtime confirmed after initial downloads; no external assets/fonts/analytics.

The Sites managed-preview workflow required an unavailable browser-control skill; no substitute preview server or browser automation was launched. Visual QA remains open.

## Upstream packaging references

These informed tag/path choices, not successful image execution:

- [Node official image](https://hub.docker.com/_/node): `24.21.0-bookworm-slim`.
- [PostgreSQL official image](https://hub.docker.com/_/postgres): `18.6-alpine`; PostgreSQL 18 volume parent `/var/lib/postgresql`.
- [nginx image tag](https://hub-stage.docker.com/layers/library/nginx/1.28.3-alpine/images/sha256-0dcc88822d45581e65ae329f8be769762bf628d3b2bb7d2a077d4aa5c98b30e3): `1.28.3-alpine`.
- [Mailpit Docker docs](https://mailpit.axllent.org/docs/install/docker/) and [tag](https://hub.docker.com/layers/axllent/mailpit/v1.27.7/images/sha256-5d32bf20f0b2ad9e7e13254873e85ecf875a0ba9e8017bfc8055f57bcffc7b79): `v1.27.7`.

Image digests, container scanning, smaller runtime images and final laptop resource budgets remain release work.
