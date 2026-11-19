import { getApi } from './client.ts'

// The generated client already knows GET /healthz returns `{ status: string }`, so
// there is no hand-written type or checker here. `data` is set on success and
// `error` otherwise; checking `error` first narrows `data` to defined.
//
// One trade-off: the types describe what the API promises. This code does not
// re-check that the bytes arriving really match, so it trusts the API (we own
// both ends, and the API tests pin the contract).
export async function getHealth() {
  const { data, error, response } = await getApi().GET('/healthz')
  if (error) {
    throw new Error(`API responded ${response.status}`)
  }
  return data
}
