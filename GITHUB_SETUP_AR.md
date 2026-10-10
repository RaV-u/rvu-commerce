# RVU Commerce — GitHub and local Docker

Owner: `RaV-u` (GitHub account associated with `ramzmedhat@gmail.com`).

## Repository model

- The repository is currently **Public** and includes intentionally vulnerable implementation details, tests and instructor solution material. Make it **Private** or separate student-distribution and instructor-source repositories before any black-box challenge. The source and `docs/` include instructor-facing scenario information and are not suitable as a blind student handout.
- Run everything on local Docker. Do not expose 8080 or 8081 to the Internet.
- Never commit `.env`, any actual passwords or keys, Docker volumes or database dumps.
- This source is M2 (5 scenarios, not all planned 18); verify it before distribution.

## First GitHub upload (in WSL)

1. On the `RaV-u` account create a private, empty repository named `rvu-commerce` (do not initialize with a README, .gitignore, or license).
2. Extract this source into `~/bug-hunting/rvu-commerce`.
3. In WSL authenticate GitHub CLI to `RaV-u` (`gh auth login`, choosing GitHub.com, HTTPS, browser), or configure SSH for this account.
4. Use the commands below from the project directory:

```bash
cd ~/bug-hunting/rvu-commerce
git init -b main
git add .
git status --short
# Double-check that .env is not staged.
git commit -m "Initial RVU Commerce local training baseline"
git remote add origin https://github.com/RaV-u/rvu-commerce.git
git push -u origin main
```

If the git identity is missing, configure `git config user.name` and `git config user.email` before committing.

## Local Docker setup (per machine)

```bash
cd ~/bug-hunting/rvu-commerce
sh scripts/start.sh
docker compose ps
```

Store: http://localhost:8080 — Instructor console: http://127.0.0.1:8081.

Run the full native PostgreSQL test profile before treating the app as ready:

```bash
docker compose --profile test up --build --force-recreate --abort-on-container-exit --exit-code-from tests tests
docker compose --profile test rm -sf tests test-postgres
```

GitHub Actions now runs **native PostgreSQL concurrency tests and connected React UI tests**, followed by a **Docker Compose / proxy / transaction smoke test**. See the latest Actions run for the actual result. Keep local WSL2 tests before class delivery.

## Local access for students

Do **not** invite students to the instructor repository if the exercises are meant to be black-box: Docker source archives expose backend logic. A curated student release (or pre-built container images) should be prepared separately after all labs are validated. Distributing images still cannot provide an absolute secrecy guarantee.
