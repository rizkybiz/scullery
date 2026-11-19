# scullery-web

## Development

Needs Node 22+ (`.nvmrc` pins 24: `nvm install` then `nvm use`).

```sh
npm ci            # install exactly what package-lock.json says
npm run dev       # http://localhost:5173, proxies /api to http://localhost:8080
npm test          # unit tests (Vitest + Testing Library)
npm run typecheck # TypeScript, strict mode
npm run lint      # oxlint
npm run format    # Prettier: rewrite files to the house style (format:check only reports)
npm run build     # production build into dist/
```

Point the dev server at a different API with `API_URL=http://host:port npm run dev`.
The browser only ever calls same-origin `/api/...`; Vite proxies it in development
and nginx does in the container, so no code contains an API address.

## Container image

`Dockerfile` builds the app with Node and serves it with nginx. Configuration is by
environment variable:

| Variable | Default | Meaning |
|---|---|---|
| `API_UPSTREAM` | `http://api:8080` | Where nginx forwards `/api/` (the prefix is stripped) |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on the self-hosted `docker-build`
runner. The logic lives in `scripts/ci/` so it runs the same locally:

| Check | Local command |
|---|---|
| install, typecheck, lint, test, build | `scripts/ci/verify.sh` |
| Conventional Commits for every commit in a PR | `scripts/ci/check-commits.sh <base> <head>` |
| Built image run beside the published API image: page, deep-link fallback, caching headers, `/api` proxy | `scripts/ci/image-checks.sh <image>` |

- **Pull requests** build and test but never publish.
- **Pushes to `main`** also push the image to `registry.example.com/scullery/web`
  as an immutable `sha-<short>` tag and a moving `main` tag. The run summary shows the
  digest; **deploy by pinning the `sha-` tag**, never `main`.
- `ZOT_CI_PASSWORD` (repository secret) is the registry password for the `ci` user.
- Dependabot opens weekly update PRs (npm minor/patch updates are grouped into one).

## Contributing
- One-time per clone: enable the versioned git hooks (Conventional Commit messages; staged-snapshot checks before each commit):
  ```
  git config core.hooksPath .githooks
  ```
- Work on a feature branch and open a PR; never commit to `main`.
- Commit conventions and the atomic-commit workflow are in `.claude/skills/atomic-commits/SKILL.md`.
