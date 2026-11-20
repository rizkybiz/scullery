#!/usr/bin/env bash
# Static checks and tests. Runs identically locally and in CI.
#
# Database tests need a real Postgres. If TEST_DATABASE_URL is already set it is
# used as is; otherwise a throwaway Postgres 17 container is started for the test
# run and removed afterwards, even on failure.
set -euo pipefail
# Run from services/api (two levels up from this script), not the git root: the
# API began as its own repository, and in the monorepo the root has no go.mod.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

pg=""
cleanup() {
  if [ -n "$pg" ]; then docker rm -f "$pg" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

echo "== gofmt"
unformatted="$(gofmt -l .)"
if [ -n "$unformatted" ]; then
  echo "gofmt needed on:" >&2
  echo "$unformatted" >&2
  exit 1
fi

echo "== go mod tidy -diff"
go mod tidy -diff

echo "== go vet"
go vet ./...

# The generated query code must match the SQL it came from. `sqlc diff` exits
# non-zero (and prints the difference) when it does not; fix it with `make sqlc`.
# CI runs the official image, pinned to the version in tools/go.mod, because the
# runner has no C compiler and building sqlc from source needs one.
echo "== sqlc generated code is up to date"
sqlc_version="$(go list -m -modfile=tools/go.mod -f '{{.Version}}' github.com/sqlc-dev/sqlc)"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker run --rm -v "$PWD:/src:ro" -w /src "sqlc/sqlc:${sqlc_version#v}" diff
else
  go tool -modfile=tools/go.mod sqlc diff
fi

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "== starting a throwaway postgres for the tests"
    pg="scullery-verify-$$-$(date +%s)"
    # Publish on a random loopback port: nothing else on the host is disturbed.
    docker run -d --name "$pg" \
      -e POSTGRES_USER=scullery -e POSTGRES_PASSWORD=scullery -e POSTGRES_DB=postgres \
      -p 127.0.0.1::5432 postgres:17 >/dev/null
    ready=0
    for _ in $(seq 1 60); do
      # -h 127.0.0.1 matters: during first-boot init the server listens on its
      # unix socket only, so a TCP check passes only once the real server is up.
      if docker exec "$pg" pg_isready -h 127.0.0.1 -U scullery -d postgres -q; then ready=1; break; fi
      sleep 1
    done
    [ "$ready" = 1 ] || { echo "postgres did not become ready" >&2; exit 1; }
    port="$(docker port "$pg" 5432/tcp | head -n1 | sed 's/.*://')"
    export TEST_DATABASE_URL="postgres://scullery:scullery@127.0.0.1:${port}/postgres?sslmode=disable"
  else
    # Without CI set, database tests skip; under CI they fail instead (see
    # internal/db/dbtest), so this cannot hide a broken pipeline.
    echo "== no TEST_DATABASE_URL and no usable Docker: database tests will be skipped"
  fi
fi

echo "== go test"
go test ./...
