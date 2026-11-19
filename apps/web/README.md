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
- _Worked example (API status in the header):_ `ApiStatus` is an async Server
  Component that calls the API on every request, so it cannot be part of the
  prerendered shell. The layout wraps it in `<Suspense>`: the header and tab bar
  are prerendered, the fallback ("API: checking...") sits in the shell, and the live
  status streams in at request time. `next build` reports the routes as
  `Partial Prerender`: static HTML with dynamic, server-streamed content. If the API
  is down, the status line shows an error and the rest of the page is unaffected,
  because only the fetch is wrapped in `try/catch` and the line degrades in place
  instead of replacing the page with an error boundary.
- _Worked example (recipe list):_ `listRecipes` is cached with `"use cache"`, the tag
  `recipes` and `cacheLife('minutes')`. The cache key is the arguments, so every
  distinct search, filter and page is cached separately and shared by all visitors.
  Changes made through this app will invalidate the tag; `cacheLife` is the safety net
  for changes that bypass it (a direct write to the API), which can be stale for up to
  that window. The page is synchronous and passes the `searchParams` promise to an
  async child inside `<Suspense>`, so the heading stays in the static shell and
  everything that depends on the URL streams in.
- _Search is a GET form_ (`next/form`), so the view lives in the URL (`?q=`, `favorite=`,
  `page=`) and Back, reload and shared links work with no client JavaScript. The cost
  is no search-as-you-type; that would be a small client component with a debounce.
- _Errors across the cache boundary:_ in a production build, Next replaces the message
  of an error thrown from a cached function with a generic one. The list therefore
  shows fixed wording and logs the real error on the server, which also keeps internal
  details off the page.

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
npm run dev       # Next.js dev server, http://localhost:3000
npm run typecheck # TypeScript, strict mode
npm run lint      # oxlint
npm run format    # Prettier: rewrite files to the house style (format:check only reports)
npm run build     # production build into .next/
npm run start     # serve the production build (run build first)
```

### Running against the API locally

The app calls the Scullery API from the server (see D3). Start the API, then tell
the app where it is:

```sh
(cd ../../services/api && docker compose up --build -d)   # Postgres + migration + API on :8080
cp .env.example .env.local                                # SCULLERY_API_URL=http://localhost:8080
npm run dev
```

| Variable | Meaning |
|---|---|
| `SCULLERY_API_URL` | Base URL of the Scullery API. Server-only: no `NEXT_PUBLIC_` prefix. If it is missing, the first API call fails with a message saying so. |

Stop the API with `docker compose down` (add `-v` to also delete the database).

## Deployment and CI

The app is built and served by Vercel, so there is no container image to build.
CI on GitHub-hosted runners is not set up yet.

## Contributing
- Work on a feature branch and open a PR; never commit to `main`.
