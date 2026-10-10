#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker with Compose is required: enable Docker Desktop WSL Integration on Windows or Docker Engine on Linux."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon unavailable. Start Docker Desktop (Windows) or Docker Engine (Linux)."
  exit 1
fi
if [ ! -f .env ]; then
  umask 077
  secret(){ od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }
  printf 'DB_PASSWORD=%s\nSTORE_DB_PASSWORD=%s\nCONTROL_DB_PASSWORD=%s\n' \
    "$(secret)" "$(secret)" "$(secret)" > .env
fi
if [ ! -f images.tar.gz ]; then
  echo "Installation archive is incomplete (images.tar.gz missing)."
  exit 1
fi
echo "Loading the RVU Commerce application (first run can take a few minutes)..."
gzip -dc images.tar.gz | docker load >/dev/null
docker compose up -d --wait --wait-timeout 180 --remove-orphans
echo ""
echo "RVU Commerce is ready: http://localhost:8081"
echo "Username: rvu / Password: rvucamp"
echo "Second account: rvu_2 / Password: rvucamp"
echo "Open My Account for orders, wallet, messages and services."
