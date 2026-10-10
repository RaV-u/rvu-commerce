# RVU Commerce

An intentionally vulnerable, locally hosted retail training application with a React storefront, account services, PostgreSQL, and Docker Compose.

## Student download (Windows + WSL2)

**[Download RVU Commerce for students](https://github.com/RaV-u/rvu-commerce/releases/latest/download/RVU-Commerce-Student.tar.gz)** — single offline Docker package from the latest verified GitHub Release. No Node.js or Git required. Docker Desktop and Ubuntu WSL2 must be installed and Docker WSL integration enabled.

In **Ubuntu (WSL)** run:

```bash
mkdir -p ~/rvu-commerce-student && cd ~/rvu-commerce-student
curl -fL "https://github.com/RaV-u/rvu-commerce/releases/latest/download/RVU-Commerce-Student.tar.gz" -o RVU-Commerce-Student.tar.gz
tar -xzf RVU-Commerce-Student.tar.gz
cd RVU-Commerce-Student
bash install.sh
```

Open **http://localhost:8081**.

| Username | Password | Starting wallet |
| --- | --- | --- |
| `rvu` | `rvucamp` | EGP 15,000 |
| `rvu_2` | `rvucamp` | EGP 15,000 |

The accounts have separate sessions, carts, wallets, inboxes, and orders. Amounts use **whole Egyptian pounds**: `1` is EGP 1, and `100` is EGP 100. Payments are simulated; no real money is involved.

You can stop the student store with `bash stop.sh` from its folder, then restart with `bash install.sh`. For a fresh lab run, use `bash reset.sh`.

The [Arabic installation guide](student/README_AR.md) contains troubleshooting and Burp proxy setup. **Download the named `RVU-Commerce-Student.tar.gz` Release asset; do not use GitHub's automatic "Source code" archives.** Source archives lack prebuilt Docker images and may reveal training exercises.

## Instructor workspace

```bash
git clone https://github.com/RaV-u/rvu-commerce.git
cd rvu-commerce
bash scripts/start.sh
```

The instructor source contains automated tests and intended training vulnerabilities. **This public repository is not appropriate for a blind hunt when learners can browse source or Git history.** Students should receive the Release asset link, not source access. If spoiler prevention is important, host student releases in a separate public repository and restrict access to this source.

The instructor app is bound to **127.0.0.1:8081** only. All account services appear under **My Account → Services**.

## Development checks

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run test:ui
```

On every passing push to `main`, GitHub Actions runs PostgreSQL, app/UI and Docker installation tests, then refreshes the stable [student Release](https://github.com/RaV-u/rvu-commerce/releases/latest). An offline instructor export is also available via `bash scripts/export-student-package.sh`.

## Currency upgrade

The application uses whole EGP pounds end to end. Migration 007 converts catalog, promotion and voucher defaults and activates a fresh training run on the first upgrade. Older historical runs remain archived without rewriting financial ledgers.
