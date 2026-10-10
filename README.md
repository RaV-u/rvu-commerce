# RVU Commerce

One identical Docker distribution for the instructor and all students. All machines run the same application and receive updates from the same GitHub Release; each keeps its own local database.

## Windows + WSL2
1. Open PowerShell as Administrator: `wsl --install -d Ubuntu`. Restart when prompted, then open Ubuntu and create your Linux account.
2. Docker Desktop > Settings > General: enable WSL 2 engine if shown. Settings > Resources > WSL Integration: enable Ubuntu and Apply & Restart.
3. In Ubuntu run `docker info` and `docker compose version` to confirm Docker is accessible.

## Native Linux
WSL is not needed. Start Docker Engine with the Compose plugin. Check `docker info` and `docker compose version`. Make sure your Linux user can access Docker.

## Install the same app for everyone
In the Ubuntu WSL terminal or native Linux terminal:

```bash
curl -fL https://github.com/RaV-u/rvu-commerce/releases/download/rvu-latest/setup.sh -o rvu-setup.sh
bash rvu-setup.sh
```

The script downloads `RVU-Commerce.tar.gz` from GitHub and installs prebuilt Docker images into `~/RVU-Commerce`. Open **http://localhost:8081**.

| Username | Password | Opening wallet |
|---|---|---|
| `rvu` | `rvucamp` | EGP 15,000 |
| `rvu_2` | `rvucamp` | EGP 15,000 |

Every amount is denominated in **whole Egyptian pounds**; 1 means EGP 1.

## Update or stop
```bash
cd ~/RVU-Commerce
bash update.sh
```

Start/restart with `bash install.sh`, stop without wiping records via `bash stop.sh`, and begin a fresh training run only when desired via `bash reset.sh`. Updates preserve the local Docker database volume and environment credentials.

The repository's source code is used only to build the very same distribution via `bash scripts/export-student-package.sh`; it is not a separate instructor edition. GitHub Actions tests the common package and publishes it at https://github.com/RaV-u/rvu-commerce/releases/tag/rvu-latest.

See [Arabic guide](student/README_AR.md). Do not download the GitHub source archive for installation; it can reveal lab implementation and lacks the prebuilt images. This repository is public, so blind-hunting spoilers remain visible in source history. Keep the intentionally vulnerable lab on localhost, not the public internet.
