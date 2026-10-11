#!/bin/sh
# Typecheck, build and test everything in Docker. Judged by exit code only.
set -eu
cd "$(dirname "$0")/.."
docker volume create pnpm-store-postscript >/dev/null
rm -rf apps/api/dist apps/web/.output packages/types/dist
docker run --rm -v "$PWD":/repo -v pnpm-store-postscript:/pnpm/store -w /repo \
  -e VITE_API_URL=http://api.ps.test:3000 -e NODE_OPTIONS=--max-old-space-size=2560 node:22-alpine sh -c '
  corepack enable >/dev/null 2>&1
  pnpm install --frozen-lockfile --store-dir=/pnpm/store >/dev/null
  pnpm --filter @postscript/types build
  pnpm --filter @postscript/api typecheck
  pnpm --filter @postscript/web typecheck
  pnpm --filter @postscript/api build
  pnpm --filter @postscript/web build'
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.test.yml run --rm tests
docker compose -f docker-compose.test.yml down -v
echo "verify: OK"
