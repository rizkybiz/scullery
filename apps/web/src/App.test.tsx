import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

// Render the app as if the browser were at `url`. MemoryRouter is the router with
// its "current address" held in memory instead of the address bar.
function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('routing', () => {
  beforeEach(() => {
    // The shell shows the API status, so every page makes a health request.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ status: 'ok', version: 'test' }))),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends / to the recipes page', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
  })

  it('passes the id in the URL to the recipe page', () => {
    renderAt('/recipes/abc-123')
    expect(screen.getByRole('heading', { name: 'Recipe abc-123' })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown URLs, still inside the shell', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('marks the current tab', () => {
    renderAt('/recipes')
    expect(screen.getByRole('link', { name: 'Recipes' })).toHaveAttribute('aria-current', 'page')
  })
})
