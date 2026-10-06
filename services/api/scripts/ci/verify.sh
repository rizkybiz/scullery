#!/usr/bin/env bash
# Static checks and unit tests. Runs identically locally and in CI.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

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

echo "== go test"
go test ./...
