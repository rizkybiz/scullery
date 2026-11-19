import createClient from 'openapi-fetch'
import type { paths } from './schema.d.ts'

// `paths` is generated from the API's openapi.json (npm run gen:api): one entry
// per URL, listing the methods, parameters and responses the API accepts. Handing
// it to createClient makes every call below checked by the compiler: a misspelled
// path, a missing query parameter or a wrong field in a request body is a compile
// error, and each response is typed by its status code.
//
// `baseUrl` is `/api` on the page's own origin: Vite proxies it in development and
// nginx in the container (see vite.config.ts), so no code contains an API address.
// It is spelled out in full because the client builds a `Request` object, which
// (unlike a browser's `fetch('/api/...')`) needs an absolute URL in tests.
//
// The `fetch` wrapper looks up `globalThis.fetch` on every call instead of once at
// startup, which lets tests replace it.
export const api = createClient<paths>({
  baseUrl: `${globalThis.location.origin}/api`,
  fetch: (request) => globalThis.fetch(request),
})
