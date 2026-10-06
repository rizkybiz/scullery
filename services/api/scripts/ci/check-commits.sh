#!/usr/bin/env bash
# Validates every non-merge commit message in BASE..HEAD with the same rule as
# the local .githooks/commit-msg hook, so commits made outside a local clone
# (e.g. in the GitHub web UI) cannot skip it.
#   usage: check-commits.sh <base-sha> <head-sha>
set -euo pipefail
base="${1:?usage: check-commits.sh <base-sha> <head-sha>}"
head="${2:?usage: check-commits.sh <base-sha> <head-sha>}"
root="$(git rev-parse --show-toplevel)"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

failed=0
count=0
for sha in $(git rev-list --no-merges --reverse "$base..$head"); do
  count=$((count + 1))
  git log -1 --format=%B "$sha" > "$tmp"
  if ! out="$("$root/.githooks/commit-msg" "$tmp" 2>&1)"; then
    echo "::error::commit ${sha:0:7} is not a Conventional Commit: $(git log -1 --format=%s "$sha")"
    echo "$out" >&2
    failed=1
  fi
done

echo "checked $count commit(s)"
exit "$failed"
