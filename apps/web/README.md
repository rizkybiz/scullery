# scullery-web

## JS/TS architecture

The app was ported from a Vite single-page app to Next.js (App Router). Each decision below
was recorded before the code that implements it.

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
- _Checking expiry reads the clock:_ `getSession()` calls `connection()` after reading the
  cookie and before verifying it. Next can prerender with cookies available, but it refuses
  the current time there, and without this every signed-in page logged an "unstable value
  `new Date()`" error.
- _The proxy skips `/_vercel/`:_ those paths are served by the platform (Web Analytics), not
  the app. Gating them sent the analytics script to `/login` for visitors not signed in.
- _Sign-in is rate limited_ by a Vercel Firewall rule: `POST /login`, 10 per minute per IP,
  then 429. The limit is enforced before the request reaches a function, so blocked attempts
  cost nothing.

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

**D4. The recipe form is a client component**

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
- _Every field the API stores:_ ingredient ranges ("2 to 3"), note, section and optional; step
  timer (entered in minutes, sent as `timer_seconds`) and section; the recipe's yield, source URL
  and notes. Note, section, optional and timer sit under a per-row "More" that starts open when
  any of them has a value or an error, so nothing filled in is hidden. `buildRecipe` mirrors the
  API's rules (a range needs a first quantity and must not shrink) and turns an equal top into no
  range, since the API would store "200 to 200 g" as `200-200`. The source must be http(s): it is
  shown as a link.
- _Starting filled in:_ `fromRecipe` turns an API-shaped recipe into the form's state (the
  reverse of `buildRecipe`; a round trip gives back the same request), so the import's draft
  and editing use the same form.
- _Editing:_ `/recipes/[id]/edit` (Edit in the recipe's ⋮ menu) is the same form, filled in from
  the recipe as it is now (read past the cache) and saved by `updateRecipeAction`, which takes the
  form's save action as a prop. The API's `PUT` replaces the whole recipe, and the form does not
  edit the favorite flag or the source name, so the action reads them fresh and sends them back
  unchanged; otherwise every edit would quietly clear them. Checked end to end against the local
  API with the real action called over HTTP: the edit saved (title, servings, ingredients and
  steps replaced), favorite and source name kept, the recipe page fresh straight after; a blank
  title, a malformed id, an unknown id and a missing session were each refused, leaving the
  recipe unchanged.
- _Checked end to end_ against the local API: a draft through `fromRecipe` and `buildRecipe` was
  accepted (201), and the recipe page showed the range, section heading, note, optional marker,
  timer, yield, source link and notes, with step numbers running on across sections.
- _Units and the build:_ the unit dropdown's data is cached for days (tag `units`), and the
  form page calls `connection()` so it renders per request. Without that, Next would call
  the API while running `next build`. Verified by building with the API address pointed at
  a dead port.

**D5. Cache Components for caching**

- _Decision:_ `cacheComponents` is enabled. Cached reads use `"use cache"` with an
  explicit `cacheLife` and a `cacheTag`: `recipes` for the list, `recipe:<id>` for
  a detail page. A Server Action that changes a recipe calls `updateTag` so the
  user sees their own change immediately.
- _Why:_ a static shell around cached data, with dynamic parts streamed in, gives
  fast pages without losing freshness.
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
  the type check). The AI import is checked by its own evaluation set
  ([`evals/import`](evals/import/README.md)): 16 fixed inputs, scored field by field, run by hand
  against each model through AI Gateway.
- _Trade-off:_ no automated check of behavior. Regressions in things like form
  error handling are caught by hand, not by a test. A real product would restore
  tests, starting with the data layer and the form.

**D7. Durable AI work runs on Vercel Workflow, models through AI Gateway**

- _Decision:_ the recipe import agent runs as a Workflow run whose steps call models through AI
  Gateway with the AI SDK. `withWorkflow()` wraps `next.config.ts`.
- _Why:_ an import is several slow, failure-prone steps (fetch a page, extract, call a model,
  validate). Workflow makes each step durable, retried and visible in the dashboard. AI Gateway
  gives one model ID format, fallbacks and spend in one place.
- _No stored AI secret:_ a plain `provider/model` string goes to AI Gateway, which authenticates
  with the deployment's OIDC token. There is no AI Gateway or provider API key anywhere.
- _How an import runs_ (`src/workflows/importRecipe.ts`): the new recipe page's import panel calls
  `startImportAction` (session and input checked, cached units passed in), which starts the run
  and returns its id at once; the panel polls `GET /api/import/<runId>` every 1.5 s. The run's
  steps: read the source (fetch the link through `fetchPage`'s SSRF guard, or take the text), one
  model call (`lib/import/structure.ts`), normalize. It never saves: the draft re-mounts the recipe
  form, and the person saves with the form's normal Save. Expected outcomes (not a recipe, a page
  that cannot be fetched) come back as values; timeouts and 5xx are retried; permanent Gateway
  refusals fail at once (the spike saw one retried three times).
- _Kill switches:_ `READ_ONLY` stops the import as well as every write (it is the switch for a
  demo that is being abused or spending money); `IMPORT_DISABLED` stops only the import. The
  action checks on every call and logs `import.refused`; the page shows a note instead of the
  panel. Checked on a local build under each setting.
- _Checked end to end_ on a local production build (local Workflow world, real AI Gateway): pasted
  text gave a correct draft in 1.9 s; a link to a local address and `https://example.com/` were
  refused with plain messages; bad input, no session, and bad or unknown run ids were refused.
- _Proved by a spike first_ (preview only, since removed; see the `spike(web)` commit):
  - one run with one AI step completed on the Hobby plan;
  - the free tier refused `anthropic/claude-haiku-5.5` and allowed `google/gemini-2.5-flash-lite`
    (1.8 s, about 450 tokens) and `openai/gpt-5-nano` (13 s);
  - run inputs and outputs are encrypted at rest.
- _`proxy.ts` skips `/.well-known/workflow/`:_ Workflow's guide requires it (a proxy that reads
  those requests breaks delivery). That does not expose the flow route: on Vercel it is a queue
  consumer with no public URL. Checked from outside through the preview's protection bypass: `GET`
  and `POST` (with queue-style headers) both got 404, while runs completed internally.
- _Dependencies:_ `workflow` 5.4.0, `ai` 7.0.164, `zod` 4.6.7, each the newest release at least two
  weeks old. `overrides` in `package.json` force patched `zod` and `undici` under Workflow's
  packages (the pinned ones had high-severity advisories, and `@workflow/core` uses `zod` at
  runtime). They also give `openapi-typescript` the project's TypeScript 6: it declares `^5`, which
  npm had tolerated until Workflow's plugin added another TypeScript peer and Vercel's install
  stopped with `ERESOLVE`.

### Layout

```
apps/web/src/
  app/(app)/           signed-in pages with the app frame (recipes list, page, new)
  app/login/           sign-in page and its Server Action (no frame, no API calls)
  lib/api/             server-only API client, data access layer, Cloud Run sign-in
  lib/auth/            sessions, password hashes, users, requireSession()
  lib/audit.ts         one-line JSON audit log entries
  lib/flags.ts         the READ_ONLY kill switch
  components/          shared components (client components marked 'use client')
  forms/               form logic (pure functions)
  proxy.ts             first gate: redirects to /login without a valid cookie
```

### Security rules for this app

1. The browser never calls the Scullery API.
2. Every Server Action authenticates and validates input, whatever the page did.
3. Only `server-only` modules read secrets or call the API.
4. Cached data is shared across users (see below).

### Known limitations

- **Sign-in is deliberately minimal.** Two fixed users, no sign-up, no password reset. The
  only brake on guessing is the Firewall rate limit (10 attempts per minute per IP). Its
  counters are per region, so an attacker spread across regions gets roughly 10 per minute
  in each, and there is no account lockout. That is acceptable for 12+ character passwords
  stored as scrypt hashes. It also uses the one custom rule Hobby allows. There are no
  per-user quotas, since serverless instances do not
  share memory and that needs a shared store. The API cannot tell which user made a request:
  the app calls it as itself, so the user exists only in this app and its log. A token cannot
  be revoked individually (it is stateless); changing `AUTH_SECRET` signs everyone out. And
  `READ_ONLY` is an environment variable, so it takes effect with the next deployment (about
  a minute), not instantly. An instant stop is to remove the service account's `run.invoker`
  grant in `infra/terraform`.
- **Two people editing the same recipe: the last save wins.** The API has no version check (it
  locks the row, so two saves take turns, but the second overwrites the first). An `updated_at`
  precondition on `PUT` would turn that into a "this recipe changed, reload" message.
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
- **The Vercel OIDC token works inside a cached function:** tested on the first preview
  deployment (2026-11-20). `listRecipes` and `getRecipe` run without request data, and the
  signed-in list still rendered from the staging API.
- **`updateTag` on Vercel is observed, not proven:** one signed-in user deleted a recipe
  on a preview deployment; the list and the recipe page were fresh immediately. One browser
  session cannot show that every serverless instance sees the invalidation, and it was not
  tested under concurrent load. `use cache` is in memory per instance by default.
- **Shared cache:** `"use cache"` is shared across users. That is correct for one
  household's recipes. A multi-tenant product would key the cache per tenant or use
  a private cache scope.
- **Accepted audit findings:** `npm audit` reports 20 moderate findings, all one `minimatch`
  advisory (pattern-amplification denial of service) in Workflow's build and CLI tooling and in
  `@vercel/queue`. The patterns it matches come from this app's own route configuration, never from
  a visitor. The fix is a major version that could break those tools. No high or critical findings
  remain.
- **Import: the free tier's rate limit.** AI Gateway's free tier allows each model 5 requests a
  minute for the whole team. A sixth import in a minute falls back to `gpt-5-nano` (slower, about
  15 s); if both are limited, the step is retried after 20 s. Fine for a demo; a real product would
  buy credits or bring its own provider key.
- **Import: DNS can change between the check and the fetch.** `fetchPage` checks every address a
  host resolves to, then `fetch` resolves it again, so a hostile DNS server could answer
  differently the second time (DNS rebinding). Closing it needs a fetch that connects to the
  checked address. Accepted: these functions run on Vercel, outside the Google Cloud network, and
  the Scullery API is reached by a signed request, not by network position.
- **Import: any signed-in user can read any import run** by id. There are two users with the same
  permissions, ids are random and never listed, and a run holds only a draft of what was pasted.
- **Import: some sites refuse automatic visits** (bot protection, sign-in walls) and answer 403 or
  a challenge page; the import says so, and pasting the text works instead.
- **Workflow's webhook route is public by design:** `/.well-known/workflow/v1/webhook/[token]` is
  reachable and authorized only by the token in its URL. This app never creates webhooks, so every
  token is unknown and the route answers 404.
- **Missing recipe returns HTTP 200:** the recipe page streams (the shell is sent before
  the recipe is fetched), so by the time `notFound()` runs the status line is already
  sent. Next adds a `noindex` tag, which is fine for a private app. A public site
  that needs a real 404 would look the recipe up before streaming starts, at the cost
  of the static shell on that route.

## Development

Needs Node 24 (`engines` in `package.json`, `.nvmrc`, and `mise.toml` at the repository
root). With mise, run `mise install` once from the repository root.

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

The app is built and served by Vercel, so there is no container image to build. Every pull
request gets a preview deployment wired to the staging API, and merging to `main` deploys
production. Vercel Web Analytics is on (`<Analytics />` in the root layout); it uses no
cookies.

CI (`.github/workflows/ci.yml` at the repository root) runs on every pull request and every push
to `main`: for this app `npm ci`, typecheck, oxlint, Prettier, and a check that the API types
regenerate from `openapi.json` unchanged. Alongside it run the API's checks, gitleaks over the
change's commits, and a Conventional Commits check. Those jobs and the Vercel build are required
to merge. No `next build` in CI (Vercel's build is that check) and no evals (they spend
free-tier AI Gateway requests).

The Vercel project's Root Directory is `apps/web`, so `vercel deploy` must run from the
repository root (link it there with `vercel link`; `.vercel/` is git-ignored). Running it
inside `apps/web` fails with "Root Directory does not exist". `.vercelignore` keeps the
upload under the 100 MB limit by leaving out `node_modules`, `.next`, `infra` and
`services`.

## Contributing
- Work on a feature branch and open a PR; never commit to `main`.
