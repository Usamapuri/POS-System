#!/bin/sh
set -e
# ./frontend is bind-mounted over /app, so the image's node_modules is hidden. Docker Compose
# uses a volume at /app/node_modules, which can be empty, stale, or incomplete (e.g. missing
# @dnd-kit) even when a lockfile stamp still matches.
STAMP=node_modules/.lock-stamp
if [ -n "$DOCKER_FORCE_NPM_CI" ] && [ "$DOCKER_FORCE_NPM_CI" != "0" ]; then
  echo "pos-frontend: DOCKER_FORCE_NPM_CI is set — running npm ci…"
  npm ci
  [ -f package-lock.json ] && cp package-lock.json "$STAMP" || true
  exec "$@"
fi
NEED=0
[ ! -d node_modules ] && NEED=1
[ ! -f "$STAMP" ] && NEED=1
# Critical packages — if the volume predates a dependency, reinstall.
[ ! -d node_modules/@dnd-kit/core ] && NEED=1
[ ! -d node_modules/vite ] && NEED=1
if [ -f package-lock.json ] && [ -f "$STAMP" ] && ! cmp -s package-lock.json "$STAMP" 2>/dev/null; then
  NEED=1
fi
if [ "$NEED" -eq 1 ]; then
  echo "pos-frontend: installing dependencies (npm ci)…"
  npm ci
  cp package-lock.json "$STAMP"
fi
exec "$@"
