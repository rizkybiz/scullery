#!/usr/bin/env bash
# Install, typecheck, lint, check formatting, test and build. Runs identically locally and in CI.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== npm ci"
npm ci

echo "== typecheck"
npm run typecheck

echo "== lint"
npm run lint

echo "== format"
npm run format:check

echo "== test"
npm test

echo "== build"
npm run build
