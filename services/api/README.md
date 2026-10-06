# scullery-api

## Contributing
- One-time per clone: enable the versioned git hooks (Conventional Commit messages; staged-snapshot checks before each commit):
  ```
  make hooks   # or: git config core.hooksPath .githooks
  ```
- Work on a feature branch and open a PR; never commit to `main`.
- Commit conventions and the atomic-commit workflow are in `.claude/skills/atomic-commits/SKILL.md`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on the self-hosted `docker-build`
runner. The logic lives in `scripts/ci/` so it runs the same locally:

| Check | Local command |
|---|---|
| gofmt, `go mod tidy -diff`, `go vet`, unit tests | `make verify` |
| Conventional Commits for every commit in a PR | `scripts/ci/check-commits.sh <base> <head>` |
| Built image: migrations up/down/up on Postgres 17, then `/healthz` | `scripts/ci/image-checks.sh <image>` |

- **Pull requests** build and test but never publish.
- **Pushes to `main`** also push the image to `registry.example.com/scullery/api`
  as an immutable `sha-<short>` tag and a moving `main` tag. The run summary shows
  the digest; **deploy by pinning the `sha-` tag**, never `main`.
- `ZOT_CI_PASSWORD` (repository secret) is the registry password for the `ci` user.
- Dependabot opens weekly update PRs for Go modules, base images and Actions.
