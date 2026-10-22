#!/usr/bin/env bash
# Cloudflare build. The builder's own pnpm install gives up after a 30s
# download of pnpm's native binary; npm's installer is slower to give up and
# we retry it. Set SKIP_DEPENDENCY_INSTALL=1 in Cloudflare so this runs instead.
#   Build command: bash scripts/cf-build.sh
set -euo pipefail

PNPM="$(node -p "require('./package.json').packageManager.split('+')[0]")"
for attempt in 1 2 3; do
  if npm install -g "$PNPM" --no-fund --no-audit; then break; fi
  if [ "$attempt" = 3 ]; then exit 1; fi
  echo "Installing $PNPM failed (attempt $attempt); retrying in 10s"
  sleep 10
done

pnpm --version
pnpm install --frozen-lockfile
pnpm --filter web build
