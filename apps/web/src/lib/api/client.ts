import 'server-only'
import createClient from 'openapi-fetch'
import { getIdToken } from './gcp-auth.ts'
import type { paths } from './schema.d.ts'

// The one place this app talks to the Scullery API.
//
// `import 'server-only'` (above) is a tripwire: if a client component ever imports
// this file, directly or through another module, the build fails. That keeps the
// API address and any credentials out of the browser. Pages and Server Actions
// call the API from the server; the browser only ever receives rendered results.
//
// `paths` is generated from the API's openapi.json (npm run gen:api): one entry
// per URL, listing the methods, parameters and responses the API accepts. Handing
// it to createClient makes every call checked by the compiler: a misspelled path, a
// missing query parameter or a wrong field in a request body is a compile error,
// and each response is typed by its status code.

type ApiClient = ReturnType<typeof createClient<paths>>

// Headers the API requires on every request. Empty when the API runs on the local
// network. When it sits behind Cloud Run's IAM check, this adds the ID token that proves
// the request comes from our Vercel project (see gcp-auth.ts); no other code changes.
async function authHeaders(baseUrl: string): Promise<Record<string, string>> {
  const token = await getIdToken(baseUrl)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

let client: ApiClient | undefined

// getApi builds the client on first use rather than when the module loads. A
// missing setting then fails the request that needs it, with a clear message,
// instead of breaking every build or page that merely imports this file.
export function getApi(): ApiClient {
  if (client) return client

  // No NEXT_PUBLIC_ prefix: that prefix would copy the value into browser code.
  const baseUrl = process.env.SCULLERY_API_URL
  if (!baseUrl) {
    throw new Error(
      'SCULLERY_API_URL is not set. Point it at the Scullery API, for example ' +
        'http://localhost:8080 (see apps/web/.env.example).',
    )
  }

  client = createClient<paths>({
    baseUrl,
    // The wrapper looks up `globalThis.fetch` on every call and adds the auth
    // headers to the request the client has built.
    fetch: async (request) => {
      for (const [name, value] of Object.entries(await authHeaders(baseUrl))) {
        request.headers.set(name, value)
      }
      return globalThis.fetch(request)
    },
  })
  return client
}
