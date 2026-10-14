import { api } from './client.ts'

// The generated client already knows GET /healthz returns `{ status: string }`, so
// there is no hand-written type or checker here. `data` is set on success and
// `error` otherwise; checking `error` first narrows `data` to defined.
//
// One trade-off: the types describe what the API promises. The browser does not
// re-check that the bytes arriving really match, so this trusts the API (we own
// both ends, and the API tests pin the contract).
export async function getHealth(signal: AbortSignal) {
  const { data, error, response } = await api.GET('/healthz', { signal })
  if (error) {
    throw new Error(`API responded ${response.status}`)
  }
  return data
}
