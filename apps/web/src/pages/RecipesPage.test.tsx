import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecipeSummary } from '../api/recipes.ts'
import { stubApi } from '../test/stubApi.ts'
import RecipesPage from './RecipesPage.tsx'

function recipe(n: number, overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    title: `Recipe ${n}`,
    description: '',
    servings: null,
    yield_text: null,
    cook_minutes: null,
    prep_minutes: null,
    is_favorite: false,
    updated_at: '2026-10-21T00:00:00Z',
    ...overrides,
  }
}

function page(recipes: RecipeSummary[], total = recipes.length, offset = 0) {
  return { body: { recipes, total, limit: 20, offset } }
}

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <RecipesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// What the list asked the API for, as a plain object, for the most recent call.
function lastQuery(fake: ReturnType<typeof stubApi>) {
  const request = fake.mock.calls.at(-1)?.[0] as Request
  return Object.fromEntries(new URL(request.url).searchParams)
}

describe('RecipesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists recipes with their details and links to each one', async () => {
    stubApi({
      '/api/recipes': () =>
        page([
          recipe(1, {
            title: 'Marinara',
            description: 'Quick sauce',
            servings: 4,
            prep_minutes: 10,
            cook_minutes: 25,
            is_favorite: true,
          }),
        ]),
    })
    renderAt('/recipes')

    const link = await screen.findByRole('link', { name: /Marinara/ })
    expect(link).toHaveAttribute('href', '/recipes/00000000-0000-0000-0000-000000000001')
    expect(link).toHaveTextContent('Quick sauce')
    expect(link).toHaveTextContent('Serves 4 · 35 min')
    expect(screen.getByLabelText('Favorite')).toBeInTheDocument()
  })

  it('says so when there are no recipes at all', async () => {
    stubApi({ '/api/recipes': () => page([]) })
    renderAt('/recipes')
    expect(await screen.findByText('No recipes yet.')).toBeInTheDocument()
  })

  it('searches as you type and says when nothing matches', async () => {
    const fake = stubApi({
      '/api/recipes': (url) => (url.searchParams.get('q') ? page([]) : page([recipe(1)])),
    })
    renderAt('/recipes')
    await screen.findByText('Recipe 1')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search recipes' }), 'soup')

    expect(await screen.findByText('No recipes match.')).toBeInTheDocument()
    expect(lastQuery(fake)).toMatchObject({ q: 'soup', offset: '0' })
  })

  it('filters to favorites', async () => {
    const fake = stubApi({ '/api/recipes': () => page([recipe(1)]) })
    renderAt('/recipes')
    await screen.findByText('Recipe 1')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Favorites only' }))

    await screen.findByText('Recipe 1')
    expect(lastQuery(fake)).toMatchObject({ favorite: 'true' })
  })

  it('restores search and page from the URL', async () => {
    const fake = stubApi({ '/api/recipes': () => page([recipe(21)], 45, 20) })
    renderAt('/recipes?q=soup&page=2')

    await screen.findByText('Recipe 21')
    expect(lastQuery(fake)).toMatchObject({ q: 'soup', offset: '20', limit: '20' })
    expect(screen.getByRole('searchbox')).toHaveValue('soup')
  })

  it('pages through the results', async () => {
    const fake = stubApi({
      '/api/recipes': (url) => {
        const offset = Number(url.searchParams.get('offset'))
        return page([recipe(offset + 1)], 45, offset)
      },
    })
    renderAt('/recipes')
    await screen.findByText('Recipe 1')
    expect(screen.getByText('1–1 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Recipe 21')).toBeInTheDocument()
    expect(lastQuery(fake)).toMatchObject({ offset: '20' })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  it('offers a way back from a page past the end', async () => {
    stubApi({
      '/api/recipes': (url) =>
        url.searchParams.get('offset') === '0' ? page([recipe(1)], 5) : page([], 5, 40),
    })
    renderAt('/recipes?page=3')

    await userEvent.click(await screen.findByRole('button', { name: 'Back to page 1' }))

    expect(await screen.findByText('Recipe 1')).toBeInTheDocument()
  })

  it('shows an error and lets you try again', async () => {
    let failing = true
    stubApi({
      '/api/recipes': () =>
        failing ? { status: 500, body: { title: 'oops' } } : page([recipe(1)]),
    })
    renderAt('/recipes')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load recipes (500)')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Recipe 1')).toBeInTheDocument()
  })
})
