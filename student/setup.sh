#!/usr/bin/env bash
set -euo pipefail
package_url="${RVU_PACKAGE_URL:-https://github.com/RaV-u/rvu-commerce/releases/download/rvu-latest/RVU-Commerce.tar.gz}"
target="${RVU_INSTALL_DIR:-$HOME/RVU-Commerce}"
for bin in curl tar gzip docker mktemp; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Missing $bin"; exit 1; }
done
if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker unavailable. Windows: Start Docker Desktop, then enable Settings > Resources > WSL Integration > Ubuntu."
  echo "Native Linux: Start Docker Engine and check your user permissions."
  exit 1
fi
if [ -f "$target/.env" ]; then
  echo "RVU Commerce already installed. Updating the existing installation."
  cd "$target"
  exec bash update.sh
fi
if [ -e "$target" ] && [ -n "$(ls -A "$target" 2>/dev/null)" ]; then
  echo "Installation directory is not empty: $target"
  exit 1
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading the shared RVU Commerce edition from GitHub..."
curl -fLsS --retry 3 --connect-timeout 20 "$package_url" -o "$tmp/package.tar.gz"
tar -tzf "$tmp/package.tar.gz" > "$tmp/list"
if grep -Eq '(^/|(^|/)\.\.(/|$))' "$tmp/list" ||
   grep -Evq '^RVU-Commerce(/.*)?$' "$tmp/list"; then
  echo "Invalid package paths"
  exit 1
fi
tar -xzf "$tmp/package.tar.gz" -C "$tmp"
folder="$tmp/RVU-Commerce"
for file in install.sh update.sh stop.sh reset.sh compose.yaml images.tar.gz infra/init-db.sh infra/nginx.conf; do
  test -f "$folder/$file" || { echo "Incomplete package: $file"; exit 1; }
done
mkdir -p "$target"
cp -a "$folder/." "$target/"
cd "$target"
bash install.sh
echo "Installation: $target"
echo "To update: cd ~/RVU-Commerce && bash update.sh"
