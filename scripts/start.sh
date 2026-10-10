#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose version >/dev/null
if [ ! -f .env ]; then
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/app" -w /app \
    node:24.21.0-bookworm-slim node scripts/setup.mjs
fi
docker compose up --build -d
printf '\nStore: http://localhost:8080\nInstructor: http://127.0.0.1:8081\n'
