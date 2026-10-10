#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
package_url="${RVU_PACKAGE_URL:-https://github.com/RaV-u/rvu-commerce/releases/download/rvu-latest/RVU-Commerce.tar.gz}"
test -f .env || { echo "Not installed yet. Use setup.sh first."; exit 1; }
for bin in curl tar gzip docker mktemp; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Missing $bin"; exit 1; }
done
docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 ||
  { echo "Docker unavailable. Check Docker Desktop WSL integration or Linux Engine."; exit 1; }
tmp="$(mktemp -d "$PWD/.rvu-update.XXXXXXXX")"
trap 'rm -rf "$tmp"' EXIT
echo "Fetching RVU Commerce update from GitHub..."
curl -fLsS --retry 3 --connect-timeout 20 "$package_url" -o "$tmp/package.tar.gz"
tar -tzf "$tmp/package.tar.gz" > "$tmp/list"
if grep -Eq '(^/|(^|/)\.\.(/|$))' "$tmp/list" ||
   grep -Evq '^RVU-Commerce(/.*)?$' "$tmp/list"; then
  echo "Invalid package paths"
  exit 1
fi
tar -xzf "$tmp/package.tar.gz" -C "$tmp"
src="$tmp/RVU-Commerce"
for file in compose.yaml install.sh stop.sh reset.sh update.sh setup.sh README_AR.md images.tar.gz infra/nginx.conf infra/init-db.sh; do
  test -f "$src/$file" || { echo "Incomplete update: $file"; exit 1; }
done
gzip -dc "$src/images.tar.gz" | docker load >/dev/null
mkdir -p infra
for file in compose.yaml install.sh stop.sh reset.sh update.sh setup.sh README_AR.md infra/nginx.conf infra/init-db.sh; do
  cp -f "$src/$file" "$file.next"
  mv -f "$file.next" "$file"
done
mv -f "$src/images.tar.gz" images.tar.gz
chmod +x install.sh stop.sh reset.sh update.sh setup.sh
docker compose up -d --force-recreate --wait --wait-timeout 180 --remove-orphans
echo "RVU Commerce is up to date: http://localhost:8081"
