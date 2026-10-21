import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApiStatus from './ApiStatus.tsx'

function renderStatus() {
  // A fresh cache per test so tests cannot leak into each other; retries off so
  // a failure shows up immediately instead of after several attempts.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  )
}

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

describe('ApiStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the API status when /healthz succeeds', async () => {
    respondWith({ status: 'ok', version: 'sha-abc1234' })
    renderStatus()
    expect(await screen.findByText(/API:\s*ok \(sha-abc1234\)/)).toBeInTheDocument()
  })

  it('shows which web build is running', () => {
    respondWith({ status: 'ok', version: 'x' })
    renderStatus()
    expect(screen.getByText(/Web: dev/)).toBeInTheDocument()
  })

  it('shows that the API is unreachable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    renderStatus()
    expect(await screen.findByText(/unreachable \(network down\)/)).toBeInTheDocument()
  })

  it('treats a non-200 status as an error', async () => {
    respondWith({}, 503)
    renderStatus()
    expect(await screen.findByText(/API responded 503/)).toBeInTheDocument()
  })
})
