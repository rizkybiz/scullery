# scullery-web

## JS/TS architecture

> **Status:** this app is being ported from a Vite single-page app to Next.js
> (App Router). Until the port finishes, the sections below this one describe the
> Vite app and are still accurate for it. Each decision here is recorded before
> the code that implements it.

### Principle: server-first

The browser runs only what needs live interaction. Everything else, including every
call to the Scullery API, runs on the server. The API URL and any credentials never
reach the browser, so the API can stay closed to the public internet and accept
requests only from this app.

### Decisions

**D1. Server Components for reads (list and detail pages)**

- _Decision:_ pages fetch their own data on the server and send finished HTML.
- _Why:_ the API stays private, the browser downloads less JavaScript, and the same
  data can be cached once and shared instead of being fetched again by every browser.
- _Trade-off:_ a slow API slows the page unless the slow part streams in behind a
  `Suspense` boundary. The server's work also counts toward hosting cost.
- _Alternatives:_ a client-side SPA with TanStack Query (what this app was). It
  would need the API reachable from every browser, which conflicts with keeping the
  API private.

**D2. Server Actions for mutations (create, delete)**

- _Decision:_ writes are Server Actions: functions marked `"use server"` that run on
  the server and are invoked from a form or a client component.
- _Why:_ the write, the cache invalidation and the page refresh happen in one
  round trip, and the credential never leaves the server.
- _Trade-off:_ a Server Action is a public HTTP POST endpoint under the hood. A
  page-level login check does not protect it, so **every action re-checks the
  session and validates its input itself**. Return values are serialized to the
  browser, so actions return UI-shaped results, never raw API responses.
- _Alternatives:_ Route Handlers (explicit REST endpoints). More ceremony for the
  same result here, since only this app calls them.

**D3. A server-only data access layer**

- _Decision:_ all calls to the Scullery API go through one module that starts with
  `import 'server-only'`. Importing it from a client component fails the build.
- _Why:_ one place for the API URL, the auth token, error mapping and validation.
  Pages and actions stay thin.
- _Config:_ the API address is `SCULLERY_API_URL`, with no `NEXT_PUBLIC_` prefix
  (that prefix would bundle it into browser JavaScript).

**D4. The create-recipe form is a client component**

- _Decision:_ the form is `'use client'` and submits to a Server Action through
  `useActionState`.
- _Why:_ it holds interactive state (ingredient rows added, edited and removed
  before submit), which only exists in the browser. It is the one client island on
  the write path.
- _Trade-off:_ client JavaScript for this page. Kept to the form itself, not the
  page around it.

**D5. Cache Components for caching (planned)**

- _Decision:_ `cacheComponents` is enabled. Cached reads use `"use cache"` with an
  explicit `cacheLife` and a `cacheTag`: `recipes` for the list, `recipe:<id>` for
  a detail page. A Server Action that changes a recipe calls `updateTag` so the
  user sees their own change immediately.
- _Why:_ a static shell around cached data, with dynamic parts streamed in, gives
  fast pages without losing freshness.
- _Status:_ to be finalized with measurements in the last commit of the port.

**D6. No automated unit tests (for now)**

- _Decision:_ Vitest, Testing Library and the existing unit tests are removed.
- _Why:_ speed. The app is being rebuilt on a different rendering model, and the
  old tests were written for client-side pages that no longer exist. Rewriting
  them for Server Components would cost more than the port itself.
- _What still guards changes:_ strict TypeScript, lint, formatting checks, and an
  API contract generated from the Go service's OpenAPI spec (schema drift fails
  the type check). AI import behavior is covered separately by a small evaluation
  set (see the project write-up).
- _Trade-off:_ no automated check of behavior. Regressions in things like form
  error handling are caught by hand, not by a test. A real product would restore
  tests, starting with the data layer and the form.

### Planned layout

```
apps/web/src/
  app/                 routes (layout, page, not-found, recipes/...)
  lib/api/             server-only API client and data access layer
  components/          shared components (client components marked 'use client')
  forms/               form logic (pure functions)
```

### Security rules for this app

1. The browser never calls the Scullery API.
2. Every Server Action authenticates and validates input, whatever the page did.
3. Only `server-only` modules read secrets or call the API.
4. Cached data is shared across users (see below).

### Known limitations

- **Offline/PWA:** deferred. A server-first app makes offline viewing harder; it can
  be added later with a service worker.
- **Shared cache:** `"use cache"` is shared across users. That is correct for one
  household's recipes. A multi-tenant product would key the cache per tenant or use
  a private cache scope.
- **Cache storage:** `use cache` defaults to in-memory storage per deployment.
  How it behaves across serverless instances on Vercel still needs to be tested.

## Development

Needs Node 22+ (`.nvmrc` pins 24: `nvm install` then `nvm use`).

```sh
npm ci            # install exactly what package-lock.json says
npm run dev       # http://localhost:5173, proxies /api to http://localhost:8080
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
