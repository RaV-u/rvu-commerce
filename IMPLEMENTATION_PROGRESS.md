# M2 continuation checkpoint — 2026-10-10

This source package updates M1. New code: horizontal logo, favicon, mobile navigation, workstation quote flow, two-stage checkout intents, voucher flow, five instructor-only selectable run profiles (B01/B04/B08/B10/R01), run-scoped evidence queries, migrations v2 and new integration tests. Secure-baseline pathways remain the default.

**Validation:** 24 JS/TS source and test files parsed with TypeScript 5.8.3 without syntax errors. This sandbox has no Docker or resolvable npm registry, so M2 `npm ci`, strict typecheck, DB execution, native race checks, bundle build, visual browser QA and security regression tests are **unverified**. All previous PASS labels below belong to **M1, not M2**.

**Next strict order:** execute `docker compose --profile test ...` on the real WSL/Docker environment; fix any migrations, typecheck and native tests; perform visible store/control journeys and acceptance screenshots; record evidence in `docs/VERIFICATION.md`; only then label these five profiles `verified`. The other 13 of the specified 18 labs are still unimplemented.

---

# RVU Commerce — implementation progress

**Checkpoint:** 2026-10-09. M1 functional slice is implemented and portably verified. **Native runtime acceptance remains open.** This is the continuation entry point.

Approved foundation: `docs/RVU_Commerce_Research_and_Architecture.md`, read in full before implementation and retained unchanged in this package.

## Completed components

| Component | Implementation | Evidence |
| --- | --- | --- |
| Project | Node 24, React, TypeScript, Vite, Fastify, PostgreSQL driver; separate store/control builds | Strict typecheck and builds pass |
| Docker | PostgreSQL, migration job, store, instructor, Mailpit, nginx; internal network, loopback ports, separate test profile | YAML assertions and shell syntax pass; execution pending |
| Database | Run-scoped composite FKs, amount/quantity constraints, unique checkout/usage records, append-only ledger, deferred balance checks | Migrations applied twice; SQL tests pass on PGlite |
| Roles | Migration owner, commerce role, control role | Application tests use SET ROLE; forbidden SQL queries rejected |
| Auth | Registration, scrypt, hashed session tokens, Origin/CSRF, verification, logout | API and connected React tests pass |
| Storefront | Responsive catalog, eight illustrated products, search, categories, sorting, product dialogs | Build and React interactions pass; visual QA pending |
| Purchase | Cart, authoritative price, version checks, coupons, virtual settlement, atomic order/payment/ledger | API and React purchase tests pass |
| Orders/wallet | Order detail/history, exact net-paid refund, refund idempotency, transaction activity | API and React tests pass |
| Gift cards | Face-value purchase, issuance on settlement, one redemption, final-sale policy | Cross-account API tests pass |
| Email | Transactional outbox, SMTP worker, owner-scoped student inbox | Actual SMTP protocol test passes; Mailpit container integration pending |
| Instructor/reset | Separate service, frontend, session table, role and hostname; atomic generation reset | API identity and old-object/session isolation tests pass |
| Expired sessions | UI clears previous account data and shows login | Connected React test passes |
| Core preparation | B01/B04/B08/B10/R01 boundaries mapped | `docs/CORE_READINESS.md`; no vulnerabilities or toggles |

## Verification checkpoint

**15 passing tests, 0 failures, 2 explicitly skipped native-only gates.**

- `npm run typecheck`: passed.
- `npm test`: 12 passed, 2 skipped, 0 failed.
- `npm run test:ui`: 3 passed, 0 failed.
- `npm run build`: both production frontends built.
- Shell and setup/smoke JavaScript syntax checks: passed.
- `npm audit --omit=dev --json`: zero reported production advisories at this checkpoint. Not a full audit/container scan; initial runtime retains development dependencies.

See `docs/VERIFICATION.md` and raw output in `docs/verification/test-output.txt`.

## Decisions and bounded deviations

1. Approved production stack unchanged. **PGlite is test-only** because Docker is unavailable and native PostgreSQL installation was blocked by authoring-environment UID/GID namespace restrictions.
2. One active secure-baseline run per learner installation. Run/owner come from sessions; clients cannot select a run. Reset archives previous data and seeds a new run instead of deleting ledger history.
3. Instructor origin is `127.0.0.1:8081`; store is `localhost:8080`. Host-only cookies, separate database roles and independent authentication are all required: cookies do not isolate ports.
4. Integer minor-unit money; authoritative catalog price; immutable order snapshots; order/payment/ledger/cart changes commit together.
5. Coupon policy: one code/order, one use/code/account, physical products only. Refund does not restore coupon eligibility. Gift-card orders are final sale.
6. New baseline accounts receive fictional opening credit. **Before economic labs, seed fixed identities and prevent new-registration credit from replenishing scenario budgets.** Opening grants are not exploit evidence.
7. Normal transactions use shared reset locks; reset takes the exclusive lock. Resource row locks protect cart/wallet/gift state. Production has a 12-connection pool per API process, not one shared client or an exclusive global request lock.
8. SMTP worker lives in the store process for M1. Delivery can be at-least-once after a crash between SMTP acceptance and outbox acknowledgement. Stable message IDs assist diagnosis; exactly-once SMTP is not claimed.
9. HTTP/1.1 and loopback HTTP are intentional for M1. HTTP/2, full race tracing/evaluation and separate intent/confirmation transitions are future gates.
10. Libraries and image patch tags are pinned. Digest locking and removal of development tooling from the runtime image remain packaging work.

## Open gates and limitations

- Docker image build/start, native PostgreSQL connection authentication/concurrency, Windows/WSL2 performance and actual HTTP/DNS egress isolation **have not been tested here**.
- PGlite sockets share one backend. They cannot prove concurrency or per-connection database-role isolation.
- Browser rendering/responsive screenshots and real-browser modal/cookie behavior **have not been verified**. The Sites managed-preview workflow required an unavailable browser skill; no substitute preview server/browser was used.
- Instructor UI is connected to tested APIs; real-browser console navigation/reset still needs acceptance.
- No stock reservation, real fulfilment, partial refund, password recovery, quote domain, checkout-intent domain, scenario evaluator or vulnerable profile is implemented. None is presented as an available workflow.
- The storefront composition is centralized in `App.tsx` for the first slice. Split established account/cart/checkout views into domain components as new workflows are added, preserving connected tests.

## Exact next steps

1. Extract in the WSL Linux filesystem and run `sh scripts/start.sh`. Record `docker compose ps`, migrations/service logs and image IDs. Fix actual startup failures before adding features.
2. Run `docker compose --profile test up --build --force-recreate --abort-on-container-exit --exit-code-from tests tests`. Require **zero skipped backend tests**, distinct overlapping backend PIDs and one settlement under parallel traffic. The separate React suite intentionally remains on PGlite.
3. Test the exact store/instructor hostnames in a real browser at 1440 px and 390 px. Check checkout errors, keyboard navigation, verification, gift redemption and reset with an active store session. Run `node scripts/smoke.mjs` if host Node 24 is available.
4. Verify actual Mailpit delivery, loopback-only access, HTTP/DNS egress behavior and resource use with Windows/Burp/browser on the 16 GB machine. Record measured evidence in `docs/VERIFICATION.md`.
5. Close Phase 1 runtime acceptance only after steps 1–4 pass.
6. Build a complete secure checkout-intent/payment/confirmation flow for B08, including state-transition tests and diagram.
7. Add native tracing/transport instrumentation and an isolated R01 feasibility spike. Do not use PGlite or global serialization as race evidence.
8. Add B01 custom quotes, B04 history and B10 eligibility strategies in separate instructor-selected runs, each with reset seeds, known solve, patched regression and alternate-path tests. Advanced/specialist scenarios stay deferred.

## Verification-driven fixes

Corrected PGlite connection URL handling, instructor-route test routing and YAML merge assertions. Avoided huge diagnostic formatting of live React DOM objects in tests. Waited for pending account/verification operations instead of adding arbitrary application sleeps. Moved error feedback into active dialogs, added expired-session recovery and disabled forced HTTPS upgrades for this local HTTP deployment.

No intentional vulnerability was introduced to make a test pass.
