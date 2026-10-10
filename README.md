# RVU Commerce

A locally hosted retail application with a React storefront, account services, PostgreSQL, and Docker Compose.

## Instructor setup

Run in your Ubuntu WSL workspace:

```bash
cd ~/rvu-commerce
git pull origin main
bash scripts/start.sh
```

Open **http://localhost:8081**. All account services are within **My Account → Services**.

| Username | Password |
| --- | --- |
| `rvu` | `rvucamp` |
| `rvu_2` | `rvucamp` |

Both accounts have separate sessions, shopping carts, wallets, inboxes, and order histories, preserved when they sign back in. Currency and payment operations are simulated locally.

Stop containers without deleting data:

```bash
docker compose down
```

Reset the local account environment without erasing the PostgreSQL volume:

```bash
docker compose run --rm migrate node dist/server/reset-local.js RESET
```

## Prepare the student edition

Do **not** distribute this source repository to learners. Create an offline Docker package from your WSL machine:

```bash
bash scripts/export-student-package.sh
```

Send **only** `dist-packages/RVU-Commerce-Student.tar.gz` to students. It contains container images and a one-command installer, with no source, regression tests, archived instructor files or solution guides in the runtime image. Students need Docker Desktop with WSL2, but not Node.js or Git.

**Make this GitHub repository private** before a blind-hunting session: Git history can expose historical tests, comments and solutions even after files are removed from `main`.

## Development checks

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run test:ui
```

CI also checks Docker/PostgreSQL, account isolation, purchase/refund, and browser layout. The store binds to **127.0.0.1:8081** only and must not be internet-exposed. Database migrations and security regression tests remain part of the instructor source repository.
