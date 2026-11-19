import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { healthRoute, stubApi } from './test/stubApi.ts'

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
    // The shell shows the API status and /recipes lists recipes, so both answer.
    stubApi({
      ...healthRoute,
      '/api/recipes': () => ({ body: { recipes: [], total: 0, limit: 20, offset: 0 } }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends / to the recipes page', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
  })

  it('opens the recipe whose id is in the URL', async () => {
    stubApi({
      ...healthRoute,
      '/api/recipes/abc-123': () => ({
        body: { id: 'abc-123', title: 'Pasta', description: '', ingredients: [], steps: [] },
      }),
    })
    renderAt('/recipes/abc-123')
    expect(await screen.findByRole('heading', { name: 'Pasta' })).toBeInTheDocument()
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
