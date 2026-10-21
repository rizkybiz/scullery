import { vi } from 'vitest'

type Handler = (url: URL) => { status?: number; body: unknown }

// Replaces `fetch` with a fake API for the duration of a test. `routes` maps a
// path such as '/api/recipes' to a function that builds the response from the
// request URL (so a test can answer differently per page or search). Any path
// without a route fails the test loudly instead of hanging.
// Returns the fake, so a test can assert on the requests that were made.
export function stubApi(routes: Record<string, Handler>) {
  const fake = vi.fn((input: Request | string) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    const handler = routes[url.pathname]
    if (!handler) {
      return Promise.reject(new Error(`unexpected request: ${url.pathname}`))
    }
    const { status = 200, body } = handler(url)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  })
  vi.stubGlobal('fetch', fake)
  return fake
}

// The health check every page makes, because the shell shows the API status.
export const healthRoute: Record<string, Handler> = {
  '/api/healthz': () => ({ body: { status: 'ok', version: 'test' } }),
}
