#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose down
echo "RVU Commerce has stopped. Account data was not deleted."
