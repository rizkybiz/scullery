// The shape of the API's GET /healthz response.
//
// TypeScript types exist only while compiling: they are erased from the code
// that actually runs in the browser. So data that arrives over the network is
// `unknown` until we check it. `isHealth` is a "type guard": a runtime check
// whose return type (`value is Health`) also tells the compiler what we learned.
// Think of it like decoding JSON into a Go struct and validating the fields.
export interface Health {
  status: string
}

export function isHealth(value: unknown): value is Health {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof value.status === 'string'
  )
}

// `/api/...` is same-origin: Vite proxies it in development and nginx does in
// the container (see vite.config.ts and nginx/).
export async function getHealth(signal: AbortSignal): Promise<Health> {
  const response = await fetch('/api/healthz', { signal })
  if (!response.ok) {
    throw new Error(`API responded ${response.status}`)
  }
  const body: unknown = await response.json()
  if (!isHealth(body)) {
    throw new Error('Unexpected response from /healthz')
  }
  return body
}
