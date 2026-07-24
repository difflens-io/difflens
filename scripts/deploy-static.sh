#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${project_dir}/.env.deploy.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${project_dir}/.env.deploy.local"
  set +a
fi

source_dir="${project_dir}/dist/"
target_dir="${DIFFLENS_DEPLOY_TARGET:-}"

if [[ -z "$target_dir" ]]; then
  echo "DIFFLENS_DEPLOY_TARGET is not set." >&2
  echo "Set DIFFLENS_DEPLOY_TARGET to the static target directory before deploying." >&2
  exit 1
fi

if [[ ! -f "${source_dir}index.html" ]]; then
  echo "dist/index.html not found. Run npm run build first." >&2
  exit 1
fi

sudo install -d -m 755 "$target_dir"
sudo rsync -a --delete "$source_dir" "$target_dir"
sudo find "$target_dir" -type d -exec chmod 755 {} +
sudo find "$target_dir" -type f -exec chmod 644 {} +
