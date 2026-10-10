# RVU Commerce

A local commerce training application for RVU Camp, built on the approved blueprint at `docs/RVU_Commerce_Research_and_Architecture.md`.

**Milestone 2 verification (2026-10-10):** Five instructor-selected training scenarios are implemented: **B01, B04, B08, B10, R01**, alongside `secure-baseline`. The other **13 of 18** planned labs are not implemented. GitHub Actions now verifies strict TypeScript checks, both Vite builds, **20/20 backend tests on native PostgreSQL 17 (including real concurrent transactions and R01)** and **3/3 connected React UI tests**. A separate Docker Compose end-to-end CI gate has been added; see the latest Actions run for its result. These checks do not replace interactive browser acceptance on the student's device.

A rebuilt horizontal SVG logo replaces the previously misaligned vertical wordmark, and the storefront adds a responsive mobile navigation, custom workstation quotes, two-step checkout review and one-use store vouchers. Instructor-only evidence metrics are derived from persisted server data.

The storefront uses a cream, forest-green and muted-gold identity, original local SVG product illustrations, responsive product grids, native modal dialogs and locally available fonts. There are no CDN dependencies or external payment services.

## Run on Windows 11 / WSL2

Enable Docker Desktop's WSL integration. Extract this project into your WSL Linux filesystem, for example `~/rvu-commerce`, and run from its root:

```sh
sh scripts/start.sh
```

This generates local random credentials using a temporary Node container, then builds and starts Compose. It needs Docker and internet access for the **first image/dependency download**, but does not require Node or PostgreSQL installed on Windows or WSL. The application runtime is local and uses an internal Docker network.

Open the exact addresses below; they deliberately use different hostnames so browser cookies are not shared across store and instructor origins:

| Surface | URL | Access |
| --- | --- | --- |
| Store | http://localhost:8080 | Register, or use the fictional demo account |
| Instructor console | http://127.0.0.1:8081 | Username `instructor`; generated password printed during first setup and retained in `.env` |
| PostgreSQL / SMTP / Mailpit web UI | No host port | Internal services only |

Demo customer: `alex@learner.rvu.test` / `Studio-Local-2026!`. Each new run seeds this verified account with **EGP 15,000 virtual credit**. You may also register a fictional address such as `sam@learner.rvu.test`; open **Account → Inbox** to verify it.

If you already have Node 24, the equivalent setup is:

```sh
node scripts/setup.mjs
docker compose up --build -d
```

Check startup and stop without deleting data:

```sh
docker compose ps
docker compose logs --tail=80 migrate store instructor edge
docker compose down
```

PostgreSQL data persists in a named volume. Re-running setup preserves `.env`. Changing generated database passwords in `.env` does not rotate credentials inside an existing database volume. Keep `.env` with your local installation and out of source control.

## Implemented journeys

- Registration, local email verification, login, server-side sessions and logout; expired/reset sessions return the UI to sign-in.
- Eight fictional products, search, category filtering, price sorting, product details and local assets.
- Persistent cart, quantity changes/removal, authoritative catalog prices and stale-cart detection. Custom workstation quotes retain a server-authorized amount and are verified in the secure baseline; B01 deliberately trusts the accepted client amount.
- Secure-baseline coupons with physical-product eligibility and history tracking; B04 provides an isolated history enforcement flaw. Gift-card promotions are normally excluded; the B10 scenario deliberately enables a repeatable GIFT20 discount.
- Normal checkout with server-validated, short-lived review intents and virtual wallet settlement. Confirmed order, payment record and balanced ledger commit together in all profiles except the instructor-selected B08 payment-proof reuse exercise. Replaying an identical checkout key returns its original order.
- Order list/details, product/price snapshots, full refund of eligible physical orders, and idempotent refunds.
- Full-face-value gift-card purchase, code issuance after payment, redemption into another customer's wallet and single-redemption enforcement. Orders containing gift cards are final sale.
- Wallet balance and chronological transaction activity.
- Transactional email outbox, SMTP delivery worker and a database-backed, owner-scoped student inbox. The raw Mailpit inbox is not published.
- Independently built instructor UI/API with independent authentication, instructor-only run reset/profile selection and run-scoped evidence counts for the five included scenarios.
- Single-use store voucher, atomic under secure baseline, with a deliberately split check-and-claim path in R01 to teach a genuine overlapping-request race.

There is no real shipment, external payment gateway, stock reservation, password recovery, partial-item return, or the 13 not-yet-implemented scenario workflows in this milestone. These are not displayed as available workflows.

## Verification and its limits

The files in `docs/verification/` are historical **M1 snapshots**, not results of the current M2 code. **Current M2 evidence is in [GitHub Actions](https://github.com/RaV-u/rvu-commerce/actions):** typecheck and builds pass, backend integration tests run on PostgreSQL 17 with all 20 passing (including native concurrency and R01), and all three connected React/PGlite UI tests pass. An additional Compose smoke job exercises the actual proxy and local service stack. Real-browser layout/responsive appearance and your Windows/WSL2 resource usage still require local acceptance.

Functional API/SQL and React interaction tests use **PGlite (PostgreSQL/WASM)** via the PostgreSQL wire protocol. They run the real migrations, handlers, transactions and ledger logic. The React tests use JSDOM and an in-process HTTP adapter to Fastify; they do not mock business responses. This verifies connected functional behavior, **not browser rendering, independent PostgreSQL backends, Docker startup, network isolation or Windows performance**.

### Required native PostgreSQL gate

Run the test profile on your WSL2 Docker environment before adding any race lab:

```sh
docker compose --profile test up --build --force-recreate --abort-on-container-exit --exit-code-from tests tests
docker compose --profile test rm -sf tests test-postgres
```

Tests use a separate ephemeral `rvu_test` database, not the store database. Explicitly recreating the test database ensures a clean seed. In this mode, `TEST_DATABASE_URL` enables two normally skipped gates:

1. Two real HTTP requests hold overlapping database transactions and return different `pg_backend_pid()` values. A rendezvous fails if they are serialized.
2. Twelve concurrent ordinary coupon requests produce one benefit, then twelve identical checkouts produce one order and one wallet debit.
3. In **R01 only**, two or more parallel claims for the same STUDIO300 voucher can produce multiple persisted benefit records; a clean sequential control is rejected. This check is intentionally native-only.

The React test suite uses PGlite to verify UI → Fastify → SQL. Backend integration and true concurrency gates have passed on native PostgreSQL 17 in GitHub Actions. The Compose stack uses PostgreSQL 18; check the latest Docker smoke job for container-level acceptance.

For host-to-proxy-to-database smoke testing, if Node 24 is available on WSL:

```sh
node scripts/smoke.mjs
```

It creates a fictional customer, verifies the scoped email, buys with a coupon, refunds the order, and logs out. It does not reset the active run. It has not been executed against Docker here.

For source development with Node 24:

```sh
npm ci
node scripts/verify.mjs
npm run build
```

`npm test` intentionally reports the two native-only tests as skipped when `TEST_DATABASE_URL` is absent. A green portable run does **not** close the concurrency gate.

## Project map

| Location | Responsibility |
| --- | --- |
| `apps/web` | React storefront and original local assets |
| `apps/control` | Separately built instructor frontend |
| `apps/api/src/app.ts` | HTTP validation, session boundaries and route registration |
| `apps/api/src/commerce.ts` | Cart, checkout, refund and gift-card transactions |
| `apps/api/src/policy.ts` | Immutable secure-baseline rules and future Core identifiers |
| `apps/api/src/seed.ts` | Reproducible catalog, run seed and double-entry transfers |
| `apps/api/src/db.ts` | Connection pool and shared/exclusive reset locking |
| `apps/api/src/mail.ts` | Transactional outbox delivery |
| `db/migrations` / `db/grants.sql` | Schema, deferred constraints, indexes and database permissions |
| `infra` | Internal proxy and database role bootstrap |
| `tests` | Functional, permission, isolation, UI and native-concurrency checks |
| `IMPLEMENTATION_PROGRESS.md` | Current evidence, decisions, blockers and exact continuation steps |

## Run isolation and reset

Every mutable commerce object is scoped to a run. Composite foreign keys prevent cross-run references. Every protected route derives the active run and owner from the server-side session; there is no client-selectable `run_id`.

Normal transactions acquire a **shared** advisory transaction lock, which permits concurrent transactions. Reset takes the **exclusive** counterpart, waits for in-flight transactions/outbox work, closes the previous run and seeds a new one atomically. Old session tokens, order IDs and gift codes no longer resolve in student APIs. Prior runs remain archived in the database; reset is not data deletion. The reset console requires typing `RESET`.

One installation supports one active run/profile. It is designed for one learner's local instance, with multiple fictional accounts available for cross-account tests. Multi-tenant concurrent scenario scheduling is a later milestone.

## Core scenario preparation

See `docs/CORE_READINESS.md`. The five instructor-selected training implementations (B01, B04, B08, B10, R01) now have scenario-specific behavior and native-PostgreSQL regression tests; the other 13 planned labs are still unimplemented. The native R01 concurrency gate passed in CI, but instructor-led acceptance and repeatability on the student's local Docker environment remain release checks.

## Resource and packaging decisions

Compose caps PostgreSQL at 768 MB, store at 384 MB, instructor at 256 MB, Mailpit at 128 MB and proxy at 64 MB. These are configured limits, **not measured consumption**. Start with a 4 GB WSL budget and measure alongside Windows, Burp and a browser on the 16 GB laptop. Initial builds and the optional test profile need extra headroom.

The image deliberately retains development tooling for this first testable milestone. A smaller production runtime image and image digest locking are release-packaging work. Image patch tags are pinned; their upstream existence was checked, but images were not pulled/built here. No Redis, Kubernetes, paid service, external font or analytics connection is required.

The local proxy currently serves HTTP/1.1. HTTP/2 and precise race transport instrumentation are explicitly deferred to the native validation/race preparation milestone. Cookies are HttpOnly, host-scoped and SameSite=Strict; Secure and HSTS are disabled only because this installation uses loopback HTTP.
