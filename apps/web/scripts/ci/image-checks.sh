#!/usr/bin/env bash
# Exercises a built web image the way a deploy would: runs it next to the API
# image on a private network and checks the whole path through nginx. Cleans up
# after itself, even on failure.
#   usage: image-checks.sh <web-image>
#   env:   API_IMAGE  API image to run behind it
#                     (default: the latest published scullery/api:main)
set -euo pipefail
image="${1:?usage: image-checks.sh <web-image>}"
api_image="${API_IMAGE:-registry.example.com/scullery/api:main}"

id="scullery-web-ci-$$-$(date +%s)"
net="$id-net"
api="$id-api"
web="$id-web"

cleanup() {
  docker rm -f "$web" "$api" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$net" >/dev/null
docker run -d --name "$api" --network "$net" -e PORT=8080 "$api_image" >/dev/null
# API_UPSTREAM is how a deploy points nginx at the API.
docker run -d --name "$web" --network "$net" -e API_UPSTREAM="http://$api:8080" "$image" >/dev/null

# Requests are made from a throwaway container on the same network.
fetch() { # fetch <curl args...>; prints the response
  docker run --rm --network "$net" busybox:1.37 wget "$@"
}
status() { # status <path> -> HTTP status code
  fetch -q -S -O /dev/null "http://$web$1" 2>&1 | awk '/^  HTTP\//{print $2; exit}'
}

echo "== waiting for the web container"
up=0
for _ in $(seq 1 30); do
  if [ -n "$(status /)" ]; then up=1; break; fi
  sleep 1
done
if [ "$up" != 1 ]; then
  echo "web container did not come up; logs:" >&2
  docker logs "$web" >&2 || true
  exit 1
fi

failed=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (expected '$2', got '$3')" >&2; failed=1; fi
}

check "GET / serves the app"                   200 "$(status /)"
check "deep link falls back to index.html"     200 "$(status /recipes/42)"
check "missing asset is a real 404"            404 "$(status /assets/does-not-exist.js)"

body="$(fetch -q -O - "http://$web/")"
if echo "$body" | grep -q 'id="root"'; then echo "ok   index.html contains the app root"; else echo "FAIL index.html has no #root" >&2; failed=1; fi

# The proxy: /api/healthz must reach the API as /healthz.
health="$(fetch -q -O - "http://$web/api/healthz" 2>/dev/null || true)"
if echo "$health" | grep -q '"status":"ok"'; then echo "ok   /api/healthz is proxied to the API"; else echo "FAIL /api/healthz: '$health'" >&2; failed=1; fi

# Hashed assets are cached forever; index.html never is.
asset="$(echo "$body" | grep -o '/assets/[^"]*\.js' | head -1)"
cc_asset="$(fetch -q -S -O /dev/null "http://$web$asset" 2>&1 | awk -F': ' 'tolower($1)~/cache-control/{print $2}' | tr -d '\r' | head -1)"
case "$cc_asset" in *immutable*) echo "ok   assets are cached immutably" ;; *) echo "FAIL asset cache-control: '$cc_asset'" >&2; failed=1 ;; esac
cc_index="$(fetch -q -S -O /dev/null "http://$web/" 2>&1 | awk -F': ' 'tolower($1)~/cache-control/{print $2}' | tr -d '\r' | head -1)"
case "$cc_index" in *no-cache*) echo "ok   index.html is not cached" ;; *) echo "FAIL index cache-control: '$cc_index'" >&2; failed=1 ;; esac

exit "$failed"
