# scullery-api

## Contributing
- Work on a feature branch and open a PR; never commit to `main`.

## Database

- The server needs `DATABASE_URL` and exits at startup if it is missing or the database does not answer. For local development: `make up` (Postgres, migrations and the API in Docker) or point `DATABASE_URL` at your own Postgres (see `.env.example`).
- **Queries are SQL, and the Go code for them is generated.** Write SQL in `internal/dbgen/queries/*.sql`, then run `make sqlc` to regenerate `internal/dbgen` and commit both. sqlc checks the queries against the migrations, so a query that disagrees with the schema fails at generate time. It is pinned in `tools/go.mod`; the first `make sqlc` compiles it (about a minute, needs gcc).
- **Tests use a real Postgres**, one fresh migrated database per test (`internal/db/dbtest`). `make verify` starts a throwaway Postgres 17 container for you. To run `go test` directly, set `TEST_DATABASE_URL` to any server you may create databases on, for example `postgres://scullery:scullery@127.0.0.1:5432/postgres?sslmode=disable`. Without it, database tests skip locally and **fail under `CI=true`**.

## Checks

The checks are scripts in `scripts/ci/`, and CI (`.github/workflows/ci.yml` at the repository
root, job `api`) runs them unchanged on every pull request, plus a check that `openapi.json`
regenerates from the code unchanged:

| Check | Command |
|---|---|
| gofmt, `go mod tidy -diff`, `go vet`, generated sqlc code is current, tests (database tests run against a throwaway Postgres when Docker is running) | `make verify` (works from any directory) |
| Built image: migrations up/down/up on Postgres 17, then `/health` | `scripts/ci/image-checks.sh <image>` |

The image is built and pushed to Artifact Registry by hand and deployed by pinning its digest
in `infra/terraform/api_image.auto.tfvars` (see [the infra README](../../infra/terraform/README.md)).
Planned: build, scan, sign and attest in CI on merge, then open a pull request that bumps
that digest.

## Image supply chain

What runs in production is one container image. This section records what was checked about it,
what was found, and how to keep it that way.

### What was found

Scanning the first deployed image (`grype`, and `govulncheck` on the extracted binary) found
**9 vulnerabilities (1 critical, 6 high, 2 medium), all in the Go standard library compiled into
our own binary** (`net/http`, `crypto/tls`, `crypto/x509`, `net/textproto`). None were in the
base image or in our dependencies. Every one is fixed in Go 1.26.9 to 1.26.11; the binary had
been built with 1.26.8.

The cause was not a missing patch. `golang:1.26` had already become 1.26.11 (published
2026-11-16), but a plain `docker build` reuses whatever copy of a tag is cached locally, and a
copy from 2026-10-06 was cached. **A floating tag plus a local cache gave a six-week-old compiler
with no warning.** `govulncheck` in source mode, run with the same toolchain, reported all nine
as reachable by call graph, so there was no honest case for dismissing them.

| | Go in the binary | Scanner findings |
|---|---|---|
| deployed image (stale cached builder) | 1.26.8 | 9 (1 critical, 6 high, 2 medium) |
| same Dockerfile built with `--pull` | 1.26.11 | **0** (and `govulncheck`: none) |
| an experimental Chainguard Go builder, same runtime base | 1.27.4 | 0 |

The runtime base was identical in all three, so the difference is the compiler, not the base
image. The size did not change (32.7 MB).

### What was done about it

Both base images in the `Dockerfile` are now **pinned by digest**, so a build cannot silently use
a different one. The distroless base's signature was verified with `cosign` before pinning:

```sh
cosign verify gcr.io/distroless/static-debian12:nonroot \
  --certificate-oidc-issuer https://accounts.google.com \
  --certificate-identity keyless@distroless.iam.gserviceaccount.com
```

The image is deployed by digest too (`infra/terraform/api_image.auto.tfvars`), and the digest
covers a build-provenance attestation that Docker's builder attaches.

### Checking an image before it ships

```sh
grype docker:<image>                                   # known vulnerabilities, by package version
docker create <image>; docker cp <id>:/scullery-api .  # take the binary out (the image has no shell)
govulncheck -mode=binary ./scullery-api                # which of them the binary can reach
```

### Updating the base images

Pick the new Go patch release, take its digest from
`docker buildx imagetools inspect golang:<version>`, put it in the `Dockerfile`, rebuild, and
re-run the checks above before pushing. For the runtime base, verify the signature first. An
update is then a reviewable change in git, not something that happens by accident.

### Not done yet

- **Chainguard comparison, deferred.** An experimental build with Chainguard's Go builder
  (Go 1.27.4; not kept in the repository) also produced a binary with no findings. A proper comparison of it against
  the current setup (vulnerability count, size, SBOM, signature and provenance verification) is
  planned but not done. Note that its `:latest` tag floats too, so it would need the same pinning.
- No SBOM is generated or published, the image is not signed by us, and scanning is manual.
  Building and scanning in CI, with signing and provenance checked at deploy time, is the
  intended next step.
