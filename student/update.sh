#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

download_url="${RVU_STUDENT_PACKAGE_URL:-https://github.com/RaV-u/rvu-commerce/releases/download/student-latest/RVU-Commerce-Student.tar.gz}"
if [ ! -f .env ]; then
  echo "Install RVU Commerce first using: bash install.sh"
  exit 1
fi
for program in curl tar gzip docker mktemp; do
  if ! command -v "$program" >/dev/null 2>&1; then
    echo "Missing required command: $program"
    exit 1
  fi
done
if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Start Docker Desktop with WSL2 integration before updating."
  exit 1
fi

temp="$(mktemp -d "$PWD/.rvu-update.XXXXXXXX")"
trap 'rm -rf "$temp"' EXIT

echo "Downloading the latest RVU Commerce student release..."
curl --fail --location --show-error --silent --retry 3 --connect-timeout 20 \
  "$download_url" --output "$temp/release.tar.gz"

tar -tzf "$temp/release.tar.gz" > "$temp/contents.txt"
if grep -Eq '(^/|(^|/)\.\.(/|$))' "$temp/contents.txt" || \
   grep -Evq '^RVU-Commerce-Student(/.*)?$' "$temp/contents.txt"; then
  echo "The downloaded package has an unexpected directory structure."
  exit 1
fi
tar -xzf "$temp/release.tar.gz" -C "$temp"
source_dir="$temp/RVU-Commerce-Student"

for file in compose.yaml install.sh stop.sh reset.sh update.sh README_AR.md \
            infra/nginx.conf infra/init-db.sh images.tar.gz; do
  if [ ! -f "$source_dir/$file" ]; then
    echo "The downloaded package is incomplete: $file"
    exit 1
  fi
done

echo "Loading the updated Docker images..."
gzip -dc "$source_dir/images.tar.gz" | docker load >/dev/null

mkdir -p infra
for file in compose.yaml install.sh stop.sh reset.sh update.sh README_AR.md \
            infra/nginx.conf infra/init-db.sh; do
  cp -f "$source_dir/$file" "$file.next"
  mv -f "$file.next" "$file"
done
mv -f "$source_dir/images.tar.gz" images.tar.gz
chmod 755 install.sh stop.sh reset.sh update.sh

echo "Applying the updated containers (existing database volume is preserved)..."
docker compose up -d --force-recreate --wait --wait-timeout 180 --remove-orphans

echo ""
echo "RVU Commerce updated successfully: http://localhost:8081"
echo "Accounts: rvu / rvucamp and rvu_2 / rvucamp"
echo "To update again, run: bash update.sh"
