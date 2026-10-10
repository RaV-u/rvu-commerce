#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! docker info >/dev/null 2>&1; then
  echo "Start Docker Desktop first."
  exit 1
fi
echo "Building source-free RVU Commerce student application..."
docker compose build store migrate
docker image inspect rvu-commerce-store:latest >/dev/null
docker tag rvu-commerce-store:latest rvu-commerce-student:local
for image in postgres:18.6-alpine axllent/mailpit:v1.27.7 nginx:1.28.3-alpine; do
  docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
done

temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
bundle="$temp/RVU-Commerce-Student"
mkdir -p "$bundle/infra" dist-packages
cp student/compose.yaml student/install.sh student/stop.sh student/reset.sh student/update.sh student/README_AR.md "$bundle/"
cp infra/nginx.conf infra/init-db.sh "$bundle/infra/"
chmod 755 "$bundle/install.sh" "$bundle/stop.sh" "$bundle/reset.sh" "$bundle/update.sh"

echo "Exporting Docker images for offline classroom distribution..."
docker save rvu-commerce-student:local postgres:18.6-alpine axllent/mailpit:v1.27.7 nginx:1.28.3-alpine | gzip -1 > "$bundle/images.tar.gz"
archive="$PWD/dist-packages/RVU-Commerce-Student.tar.gz"
tar -czf "$archive" -C "$temp" RVU-Commerce-Student
echo "Student bundle ready: $archive"
du -h "$archive"
echo "Send only this archive to students; do not send your source repository."
