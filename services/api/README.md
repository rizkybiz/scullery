# scullery-api

## Contributing
- One-time per clone: enable the versioned git hooks (Conventional Commit messages; staged-snapshot checks before each commit):
  ```
  make hooks   # or: git config core.hooksPath .githooks
  ```
- Work on a feature branch and open a PR; never commit to `main`.
- Commit conventions and the atomic-commit workflow are in `.claude/skills/atomic-commits/SKILL.md`.

## Database

- The server needs `DATABASE_URL` and exits at startup if it is missing or the database does not answer. For local development: `make up` (Postgres, migrations and the API in Docker) or point `DATABASE_URL` at your own Postgres (see `.env.example`).
- **Queries are SQL, and the Go code for them is generated.** Write SQL in `internal/dbgen/queries/*.sql`, then run `make sqlc` to regenerate `internal/dbgen` and commit both. sqlc checks the queries against the migrations, so a query that disagrees with the schema fails at generate time. It is pinned in `tools/go.mod`; the first `make sqlc` compiles it (about a minute, needs gcc).
- **Tests use a real Postgres**, one fresh migrated database per test (`internal/db/dbtest`). `make verify` starts a throwaway Postgres 17 container for you. To run `go test` directly, set `TEST_DATABASE_URL` to any server you may create databases on, for example `postgres://scullery:scullery@127.0.0.1:5432/postgres?sslmode=disable`. Without it, database tests skip locally and **fail under `CI=true`**.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on the self-hosted `docker-build`
runner. The logic lives in `scripts/ci/` so it runs the same locally:

| Check | Local command |
|---|---|
| gofmt, `go mod tidy -diff`, `go vet`, generated sqlc code is current, tests (database tests run against a throwaway Postgres) | `make verify` |
| Conventional Commits for every commit in a PR | `scripts/ci/check-commits.sh <base> <head>` |
| Built image: migrations up/down/up on Postgres 17, then `/healthz` | `scripts/ci/image-checks.sh <image>` |

- **Pull requests** build and test but never publish.
- **Pushes to `main`** also push the image to `registry.example.com/scullery/api`
  as an immutable `sha-<short>` tag and a moving `main` tag. The run summary shows
  the digest; **deploy by pinning the `sha-` tag**, never `main`.
- `ZOT_CI_PASSWORD` (repository secret) is the registry password for the `ci` user.
- Dependabot opens weekly update PRs for Go modules, base images and Actions.
