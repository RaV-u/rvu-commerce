#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose run --rm migrate node dist/server/reset-local.js RESET
echo "The two classroom accounts have been reset. Please sign in again."
