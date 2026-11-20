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
- _Worked example (delete):_ the actions menu is a small Client Component (open, closed,
  confirming is browser state). Its confirm step is a `<form>` wired with
  `useActionState`, which supplies the pending state and the action's returned error.
  `deleteRecipeAction` checks its input, calls the API, treats "already gone" as
  success, returns the API's message when the recipe is used by another recipe, and on
  success calls `updateTag('recipes')` and `updateTag('recipe:<id>')` before
  `redirect('/recipes')`. The order matters: `redirect()` works by throwing, so nothing
  after it runs, and it must stay outside the `try/catch`.
- _Checked:_ none of `SCULLERY_API_URL`, the API address or any server-only code appears
  in the browser bundle (`.next/static`).
- _Worked example (sign-in):_ two fixed users, `admin` and `reviewer`, each configured by one
  environment variable holding a password HASH (scrypt, from Node's standard library; the
  cost is stored in the hash). Both have the same permissions; two exist so one can be
  revoked, and so the log says who did what. Sign-in sets a signed token (HS256, `jose`)
  in an `httpOnly`, `sameSite=lax` cookie that lasts 8 hours, `Secure` and `__Host-` on
  Vercel. The token is stateless, so there is no session table; revoking everyone means
  changing `AUTH_SECRET`. A failed sign-in always says "Invalid name or password.", an
  unknown name takes as long as a wrong password (about 56 ms against 57 ms measured), and
  `?next=` is followed only if it is a path on this site. Pages live in two route groups:
  `(app)` has the frame (header, tabs, API status, sign-out) and the login page has none,
  so signed-out visitors never trigger an API call (measured: 0 calls, against 1 signed in).
  The plain logic is in `src/lib/auth` with no framework imports. It was attack-tested
  outside the repo: tampered and forged tokens, `alg: none`, another algorithm, expiry, and
  a list of open-redirect tricks.
- _Two layers, tested separately:_ `proxy.ts` redirects a request without a valid cookie to
  `/login` before anything renders (a real 307, with the destination kept). It is not the
  boundary: every Server Action and every component that reads data calls `requireSession()`
  itself, which was tested first with no proxy in place (no cookie, a garbage cookie, or one
  signed with the wrong secret got no data, and create and delete did nothing). It fails
  closed: a signed cookie with no `AUTH_SECRET` on the server gets a 500, never access.
  `READ_ONLY` is a kill switch for every write; any value but an explicit off turns it on, so
  a hurried `1` or a typo cannot quietly do nothing.

**D3. A server-only data access layer**

- _Decision:_ all calls to the Scullery API go through one module that starts with
  `import 'server-only'`. Importing it from a client component fails the build.
- _Why:_ one place for the API URL, the auth token, error mapping and validation.
  Pages and actions stay thin.
- _Config:_ the API address is `SCULLERY_API_URL`, with no `NEXT_PUBLIC_` prefix
  (that prefix would bundle it into browser JavaScript).
- _Signing in to Cloud Run:_ `gcp-auth.ts` turns a Vercel OIDC token into a Google ID token
  for the API's URL (Vercel token, Google STS, a service account, ID token; see
  `infra/terraform`) and the API client adds it as `Authorization: Bearer`. No secret is
  stored. Tokens are cached per audience until five minutes before they expire, and a burst
  of requests shares one exchange. With none of the four `GCP_*` variables set nothing is
  added (local development); with only some set, it fails loudly. Checked against a real
  Cloud Run service: 200 with a valid identity, 401 for a token meant for another audience.

**D4. The create-recipe form is a client component**

- _Decision:_ the form is `'use client'` and submits to a Server Action through
  `useActionState`.
- _Why:_ it holds interactive state (ingredient rows added, edited and removed
  before submit), which only exists in the browser. It is the one client island on
  the write path.
- _Trade-off:_ client JavaScript for this page. Kept to the form itself, not the
  page around it.
- _Worked example (new recipe form):_ the form keeps every value as a string in `useState`
  and submits plain data to `createRecipeAction` through `useActionState`. Because the
  inputs are controlled, nothing typed is lost when the server sends errors back. The
  conversion lives in `src/forms/recipeForm.ts`, which imports nothing from the framework:
  it trims text, parses numbers, drops rows left blank, and catches what a person can fix
  at once. The API still validates, in two stages (schema rules, then rules such as "the
  unit exists"). Its error locations (`body.ingredients[1].unit_code`) are translated back
  to the form's row numbers, because blank rows were dropped before sending. Checked
  against the API's real 422 responses for both stages.
- _Units and the build:_ the unit dropdown's data is cached for days (tag `units`), and the
  form page calls `connection()` so it renders per request. Without that, Next would call
  the API while running `next build`. Verified by building with the API address pointed at
  a dead port.

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
- _Recipe page and "not found":_ `getRecipe` is cached under its own tag, `recipe:<id>`,
  so changing one recipe invalidates only its page and the list. A missing recipe comes
  back as `null` (the API answers 404 for an unknown id and 422 for one that is not a
  UUID), not as a thrown error, for two reasons: an error thrown from a cached function
  loses its message and probably its class in production, so the page could not tell
  "no such recipe" from "the API is down"; and a missing recipe is an expected answer.
  The page calls `notFound()` outside any `try/catch`, because it works by throwing.

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

- **Sign-in is deliberately minimal.** Two fixed users, no sign-up, no password reset. There
  is no rate limit on the login page yet (one Vercel firewall rule is allowed on Hobby,
  counted by IP, if wanted). There are no per-user quotas, since serverless instances do not
  share memory and that needs a shared store. The API cannot tell which user made a request:
  the app calls it as itself, so the user exists only in this app and its log. A token cannot
  be revoked individually (it is stateless); changing `AUTH_SECRET` signs everyone out. And
  `READ_ONLY` is an environment variable, so it takes effect with the next deployment (about
  a minute), not instantly. An instant stop is to remove the service account's `run.invoker`
  grant in `infra/terraform`.
- **Deletes are permanent:** the API deletes for good. A soft delete with an undo window
  would need an API change (a deleted-at column, a restore endpoint, a purge job).
- **Offline/PWA:** deferred. A server-first app makes offline viewing harder; it can
  be added later with a service worker.
- **Writes that bypass the app are not seen until the cache expires:** tested by deleting
  a recipe directly on the API; the cached list kept showing it. Changes made through this
  app invalidate the tags immediately; anything else waits out `cacheLife('minutes')`.
- **`next dev` does not invalidate promptly; a production build does:** the delete action
  was submitted for real (a temporary form on a throwaway page, since removed) on both. In a
  production build the recipe page and the list were fresh immediately. On the dev server
  both kept showing the deleted recipe for at least 10 seconds, and a hard reload (which
  bypasses the dev cache) showed it gone. The cause on the dev server is not established.
- **Client-side navigation can reuse a page:** responses carry `x-nextjs-stale-time: 300`
  (the `minutes` profile's 5 minute client window), so history navigation can show a page
  the browser already has. Opening a deleted recipe's page that way is harmless: deleting
  again counts as success.
- **The Vercel OIDC token inside a cached function is untested:** on Vercel the token arrives
  with the request, but `use cache` functions (`listRecipes`, `getRecipe`) run without request
  data, so whether they can still fetch it there is unknown. Locally the token comes from an
  environment variable, which hides the question. It has to be tested on a Vercel deployment.
- **Not yet tested on Vercel:** `use cache` is in-memory per deployment instance by default,
  so whether `updateTag` reaches every instance of a serverless deployment has to be
  measured there, not assumed from `next start`.
- **Shared cache:** `"use cache"` is shared across users. That is correct for one
  household's recipes. A multi-tenant product would key the cache per tenant or use
  a private cache scope.
- **Cache storage:** `use cache` defaults to in-memory storage per deployment.
  How it behaves across serverless instances on Vercel still needs to be tested.
- **Missing recipe returns HTTP 200:** the recipe page streams (the shell is sent before
  the recipe is fetched), so by the time `notFound()` runs the status line is already
  sent. Next adds a `noindex` tag, which is fine for a private app. A public site
  that needs a real 404 would look the recipe up before streaming starts, at the cost
  of the static shell on that route.

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

### Signing in

Sign-in needs three variables in `.env.local` (see `.env.example`):

```sh
openssl rand -base64 48                                        # AUTH_SECRET
read -rs PW && printf '%s' "$PW" | node scripts/hash-password.ts  # AUTH_USER_ADMIN_HASH (type a password of 12+ characters)
```

Do the same, with a different password, for `AUTH_USER_REVIEWER_HASH`. The script reads the
password from standard input, so it never lands in shell history or a file, and prints only
the hash. To give a reviewer access, set their hash and deploy; to take it away, delete the
variable and deploy. Use a different `AUTH_SECRET` for each environment.

## Deployment and CI

The app is built and served by Vercel, so there is no container image to build.
CI on GitHub-hosted runners is not set up yet.

## Contributing
- Work on a feature branch and open a PR; never commit to `main`.
