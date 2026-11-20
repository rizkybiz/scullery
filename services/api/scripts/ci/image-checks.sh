#!/usr/bin/env bash
# Exercises a built API image the way a deploy would: runs the migrations
# up -> down -> up against a throwaway Postgres 17, then starts the API and
# requests /health. Cleans up after itself, even on failure.
#   usage: image-checks.sh <image>
set -euo pipefail
image="${1:?usage: image-checks.sh <image>}"

id="scullery-ci-$$-$(date +%s)"
net="$id-net"
pg="$id-pg"
api="$id-api"
db_url="postgres://scullery:scullery@$pg:5432/scullery?sslmode=disable"

cleanup() {
  docker rm -f "$api" "$pg" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$net" >/dev/null
docker run -d --name "$pg" --network "$net" \
  -e POSTGRES_USER=scullery -e POSTGRES_PASSWORD=scullery -e POSTGRES_DB=scullery \
  postgres:17 >/dev/null

echo "== waiting for postgres"
ready=0
for _ in $(seq 1 60); do
  # -h 127.0.0.1 matters: during first-boot init the server listens on its unix
  # socket only, so a TCP check passes only once the real server is up.
  if docker exec "$pg" pg_isready -h 127.0.0.1 -U scullery -d scullery -q; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "postgres did not become ready" >&2; exit 1; }

migrate() {
  docker run --rm --network "$net" -e DATABASE_URL="$db_url" "$image" migrate "$@"
}

echo "== migrate up"
migrate up
echo "== migrate down (most recent migration only)"
migrate down
echo "== migrate up again"
migrate up
status="$(migrate status)"
echo "$status"
if echo "$status" | grep -qi pending; then
  echo "migrations are still pending after 'migrate up'" >&2
  exit 1
fi

echo "== starting the API"
docker run -d --name "$api" --network "$net" \
  -e PORT=8080 -e DATABASE_URL="$db_url" "$image" >/dev/null

healthy=0
for _ in $(seq 1 30); do
  if docker run --rm --network "$net" busybox:1.37 wget -qO- "http://$api:8080/health" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  echo "API did not become healthy; container logs:" >&2
  docker logs "$api" >&2 || true
  exit 1
fi
echo "== /health OK"
