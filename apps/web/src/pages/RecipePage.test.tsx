import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Recipe } from '../api/recipes.ts'
import { stubApi } from '../test/stubApi.ts'
import RecipePage from './RecipePage.tsx'

const ID = '01a15eb1-6431-756c-aa9b-c2060b5162d2'

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: ID,
    title: 'Weeknight marinara',
    description: 'A quick tomato sauce.',
    servings: 4,
    yield_text: null,
    prep_minutes: 10,
    cook_minutes: 25,
    source_url: null,
    source_name: null,
    notes: '',
    is_favorite: false,
    ingredients: [
      {
        id: 'i1',
        position: 0,
        section: null,
        raw_text: '2-3 clove garlic, minced',
        quantity_min: 2,
        quantity_max: 3,
        unit_code: 'clove',
        name: 'garlic',
        preparation: 'minced',
        note: null,
        optional: false,
      },
      {
        id: 'i2',
        position: 1,
        section: null,
        raw_text: '1 can crushed tomatoes',
        quantity_min: 1,
        quantity_max: null,
        unit_code: 'can',
        name: 'crushed tomatoes',
        preparation: null,
        note: null,
        optional: false,
      },
    ],
    steps: [
      {
        id: 's1',
        position: 0,
        section: null,
        instruction: 'Soften the garlic.',
        timer_seconds: null,
      },
      {
        id: 's2',
        position: 1,
        section: null,
        instruction: 'Simmer for 20 minutes.',
        timer_seconds: 1200,
      },
    ],
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
    ...overrides,
  }
}

// Renders the page the way the app does: inside a route whose path has `:id`, so
// useParams() has something to read.
function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/recipes/:id" element={<RecipePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RecipePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the API for the recipe whose id is in the URL', async () => {
    const fake = stubApi({ [`/api/recipes/${ID}`]: () => ({ body: recipe() }) })
    renderAt(`/recipes/${ID}`)

    await screen.findByRole('heading', { level: 1, name: 'Weeknight marinara' })
    const request = fake.mock.calls[0]?.[0] as Request
    expect(new URL(request.url).pathname).toBe(`/api/recipes/${ID}`)
  })

  it('shows the title, description and the numbers', async () => {
    stubApi({ [`/api/recipes/${ID}`]: () => ({ body: recipe() }) })
    renderAt(`/recipes/${ID}`)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Weeknight marinara' }),
    ).toBeInTheDocument()
    expect(screen.getByText('A quick tomato sauce.')).toBeInTheDocument()
    expect(screen.getByText(/Serves 4/)).toBeInTheDocument()
    expect(screen.getByText(/Prep 10 min/)).toBeInTheDocument()
    expect(screen.getByText(/Cook 25 min/)).toBeInTheDocument()
  })

  it('marks a favorite', async () => {
    stubApi({ [`/api/recipes/${ID}`]: () => ({ body: recipe({ is_favorite: true }) }) })
    renderAt(`/recipes/${ID}`)

    expect(await screen.findByLabelText('Favorite')).toBeInTheDocument()
  })

  it('lists the ingredients as written, then the steps in order', async () => {
    stubApi({ [`/api/recipes/${ID}`]: () => ({ body: recipe() }) })
    renderAt(`/recipes/${ID}`)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ingredients' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2-3 clove garlic, minced')).toBeInTheDocument()
    expect(screen.getByText('1 can crushed tomatoes')).toBeInTheDocument()

    expect(screen.getByRole('heading', { level: 2, name: 'Steps' })).toBeInTheDocument()
    const steps = screen.getAllByRole('listitem').filter((li) => li.closest('ol'))
    expect(steps.map((li) => li.textContent)).toEqual([
      'Soften the garlic.',
      'Simmer for 20 minutes.',
    ])
  })

  it('leaves out sections that are empty', async () => {
    stubApi({
      [`/api/recipes/${ID}`]: () => ({
        body: recipe({ ingredients: [], steps: [], description: '', servings: null }),
      }),
    })
    renderAt(`/recipes/${ID}`)

    await screen.findByRole('heading', { level: 1, name: 'Weeknight marinara' })
    expect(screen.queryByRole('heading', { name: 'Ingredients' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Steps' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Serves/)).not.toBeInTheDocument()
  })

  it('offers the recipe actions menu', async () => {
    stubApi({ [`/api/recipes/${ID}`]: () => ({ body: recipe() }) })
    renderAt(`/recipes/${ID}`)

    expect(await screen.findByRole('button', { name: 'Recipe actions' })).toBeInTheDocument()
  })

  it('links back to the list', async () => {
    stubApi({ [`/api/recipes/${ID}`]: () => ({ body: recipe() }) })
    renderAt(`/recipes/${ID}`)

    const back = await screen.findByRole('link', { name: /All recipes/ })
    expect(back).toHaveAttribute('href', '/recipes')
  })

  it('says so when the recipe does not exist', async () => {
    stubApi({
      [`/api/recipes/${ID}`]: () => ({ status: 404, body: { title: 'Not Found', status: 404 } }),
    })
    renderAt(`/recipes/${ID}`)

    expect(await screen.findByRole('heading', { name: 'Recipe not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to recipes' })).toHaveAttribute(
      'href',
      '/recipes',
    )
  })

  it('shows other failures as an error and lets you try again', async () => {
    let failing = true
    stubApi({
      [`/api/recipes/${ID}`]: () =>
        failing ? { status: 500, body: { title: 'oops' } } : { body: recipe() },
    })
    renderAt(`/recipes/${ID}`)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Weeknight marinara' }),
    ).toBeInTheDocument()
  })
})
