# RVU Commerce — intentionally vulnerable local storefront

RVU Commerce is a fictional, locally hosted retail site for RVU Mentorship Camp. It provides an integrated collection of business-logic and concurrency weaknesses in a single customer experience, rather than asking learners to select named challenges.

**Local and fictional only. Never expose ports or Docker containers to the public internet.** Products, currency, customers and account privileges are fictitious.

## Start (Windows 11 + Docker Desktop + WSL2)

From the repository directory in Ubuntu:

```bash
sh scripts/start.sh
```

The setup script creates local `.env` credentials on first run and preserves existing ones. It builds the Docker stack and removes orphaned services from old instructor-console editions.

- Store: http://localhost:8080
- Business services: http://localhost:8080/services
- No instructor website; port 8081 is no longer published
- Single learner login: **Username `rvu` / Password `rvucamp`** (localhost classroom only)
- Each sign-in provisions a fresh, verified fictional workspace, its own basket/wallet/inbox, and an isolated company-colleague account visible under Account/Business services. No registration or email verification step is needed.
- Opening fictional wallet credit: **EGP 15,000**

**Upgrade an already-running local installation:**

```bash
cd ~/rvu-commerce
git pull origin main
sh scripts/start.sh
docker compose ps
```

Migration 004 upgrades pre-existing PostgreSQL volumes without deleting them. The first integrated-mode startup changes the active run, which invalidates sessions from older versions; sign back in using `rvu` / `rvucamp`. Do **not** use `docker compose down -v` if you need existing data.

### Repeat a scenario

Students sign out and sign in again using the same pair to receive a fresh fictional practice workspace. Signing in again starts a new account and does **not** restore orders or funds from a previous login. To reset the entire active training run as the **local machine operator**, run:

```bash
docker compose run --rm migrate node --import tsx scripts/reset-local.mjs RESET
```

That command is **not** exposed via the website; it rotates the active run. Existing customer sessions become invalid; new logins provision their own workspaces. The prior run remains in PostgreSQL until you intentionally delete the volume.

To stop the app without erasing the database: `docker compose down`.

## Learning experience

The storefront covers real-seeming checkout, carts, coupon promotions, custom quotes, virtual wallets, gift cards, refunds, customer accounts, password changes, business registration, workspaces, account services, and overlapping asynchronous operations.

All **18 conceptual vulnerability families** are active together in the integrated run. The former B01–B12 and R01–R06 labels are internal development identifiers, **not** student-facing challenges. Learners are expected to explore normal workflows; the storefront does not publish solution counts, instructor metrics or the active run profile.

### Important fidelity boundary

This is a purpose-built educational application, not a byte-for-byte recreation of 18 PortSwigger lab implementations. Some mechanics remain separate business-service adapters (especially B06, B11, B12, R05 and R06), and some scenarios can be reached by alternative routes when all weaknesses coexist. The original challenge recipes and unique-only solve paths are **not guaranteed**. Do not market this site as an exact PortSwigger clone.

Integration test coverage and instructor notes are kept in this **source repository**. If it remains public, students can inspect these files and Git history. **Make the repository private and distribute a runnable image or local installation rather than source code** if you want discovery to be a genuine blind exercise.

## Architecture / acceptance

- React/Vite storefront and customer business services
- Fastify REST/JSON backend
- PostgreSQL 18 Docker runtime; isolated PGlite/native PostgreSQL tests
- Nginx proxy bound to `127.0.0.1:8080` only
- Student inbox backed by scoped local PostgreSQL/outbox records
- No live mail integrations, real money or external payment gateways

Run the test suite on your machine if needed:

```bash
docker compose --profile test up --build --force-recreate --abort-on-container-exit --exit-code-from tests tests
docker compose --profile test rm -sf tests test-postgres
```

Real PostgreSQL concurrency tests, account workflow regressions and Docker proxy smoke run in [GitHub Actions](https://github.com/RaV-u/rvu-commerce/actions). Green CI is evidence of the tested workflows, **not** proof that every challenge reproduces a third-party solution exactly or that a real browser session is defect-free.

## Classroom reliability and audit scope

- One local Docker installation runs **all conceptual weaknesses at once**; each student should use a separate local installation for repeatable blind-hunting practice when possible.
- The deliberately simple `rvucamp` password is intended strictly for loopback-only training. It must never be used for an internet-facing deployment.
- Every `rvu` sign-in also receives a distinct fictional company colleague and corresponding login-attempt quota. This lets learners investigate account maintenance, recovery, and concurrent login controls without competing for one shared test identity. Publicly guessing another trainee's randomly generated address remains theoretically possible in this intentionally vulnerable local software, so separate Docker installations are still preferable for classes.
- Current CI gates include individual regression tests for all 18 families, real-Docker checks for 14 families, and a native PostgreSQL combined account-workflow regression for the remaining four. A separate stability smoke tests parallel browsing plus legitimate checkout/refund for three independently signed-in customers. This is **not** a guarantee that every pairwise interaction across the 18 has been tested.
- The HTTP performance measurements come from a disposable GitHub Actions runner. They do not measure CPU/RAM contention or browser responsiveness on students' Windows/WSL laptops.
- Certain specialized workflows demonstrate the trust-boundary failure without recreating a real SMTP parser or a full administrative account session. Review the original PortSwigger learning goals before promising identical learner outcomes.

## Instructor / internal notes

Instructor guides in `docs/` are internal implementation reference material, **not** learner handouts. The former instructor UI remains in the repository for historical and regression-test reasons but is not built as a running Compose service or exposed on any host port.

### Five-pass review

The current [five-pass QA report](docs/FIVE_PASS_QA_AR.md) documents login/session restoration, discoverability, all 18 conceptual weaknesses, cross-flow persistence, Docker/Chrome and stability tests. This is a training target, not a claim of vulnerability-free production software or perfect PortSwigger equivalence.
