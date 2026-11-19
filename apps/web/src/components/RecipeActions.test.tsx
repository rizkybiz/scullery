import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubApi } from '../test/stubApi.ts'
import RecipeActions from './RecipeActions.tsx'

const ID = '01a15eb1-6431-756c-aa9b-c2060b5162d2'
const PATH = `/api/recipes/${ID}`

// Renders the menu on the recipe's URL, with a stand-in list page to land on.
// Returns the cache so a test can look inside it.
function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/recipes/${ID}`]}>
        <Routes>
          <Route path="/recipes/:id" element={<RecipeActions id={ID} />} />
          <Route path="/recipes" element={<p>Recipe list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

const kebab = () => screen.getByRole('button', { name: 'Recipe actions' })

async function openMenu() {
  await userEvent.click(kebab())
}

async function startDelete() {
  await openMenu()
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
}

async function confirmDelete() {
  await startDelete()
  await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
}

// The most recent request that reached the fake API.
function lastRequest(fake: ReturnType<typeof stubApi>) {
  return fake.mock.calls.at(-1)?.[0] as Request
}

describe('RecipeActions menu', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts closed', () => {
    renderMenu()
    expect(kebab()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('opens and closes from the kebab button', async () => {
    renderMenu()

    await openMenu()
    expect(kebab()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    await openMenu()
    expect(kebab()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    renderMenu()
    await openMenu()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

describe('RecipeActions delete', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks before deleting, and sends nothing yet', async () => {
    const fake = stubApi({})
    renderMenu()

    await startDelete()

    expect(screen.getByText('Delete this recipe?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // The menu itself is closed once Delete was chosen.
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(fake).not.toHaveBeenCalled()
  })

  it('backs out on Cancel', async () => {
    const fake = stubApi({})
    renderMenu()
    await startDelete()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete this recipe?')).not.toBeInTheDocument()
    expect(kebab()).toBeInTheDocument()
    expect(fake).not.toHaveBeenCalled()
  })

  it('deletes the recipe and returns to the list', async () => {
    const fake = stubApi({ [PATH]: () => ({ status: 204 }) })
    renderMenu()

    await confirmDelete()

    expect(await screen.findByText('Recipe list')).toBeInTheDocument()
    expect(lastRequest(fake).method).toBe('DELETE')
    expect(new URL(lastRequest(fake).url).pathname).toBe(PATH)
  })

  it('refreshes the list and forgets the deleted recipe', async () => {
    stubApi({ [PATH]: () => ({ status: 204 }) })
    const client = renderMenu()
    client.setQueryData(['recipes', { q: '' }], { recipes: [], total: 0 })
    client.setQueryData(['recipe', ID], { id: ID })

    await confirmDelete()
    await screen.findByText('Recipe list')

    expect(client.getQueryState(['recipes', { q: '' }])?.isInvalidated).toBe(true)
    expect(client.getQueryData(['recipe', ID])).toBeUndefined()
  })

  it('treats a recipe that is already gone as deleted', async () => {
    stubApi({ [PATH]: () => ({ status: 404, body: { title: 'Not Found', status: 404 } }) })
    renderMenu()

    await confirmDelete()

    expect(await screen.findByText('Recipe list')).toBeInTheDocument()
  })

  it('explains why a recipe in use cannot be deleted, and stays put', async () => {
    stubApi({
      [PATH]: () => ({
        status: 409,
        body: { title: 'Conflict', status: 409, detail: 'Used by another recipe' },
      }),
    })
    renderMenu()

    await confirmDelete()

    expect(await screen.findByRole('alert')).toHaveTextContent('Used by another recipe')
    expect(screen.queryByText('Recipe list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument()
  })

  it('shows other failures and keeps the question open to try again', async () => {
    stubApi({ [PATH]: () => ({ status: 500, body: { title: 'oops' } }) })
    renderMenu()

    await confirmDelete()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the recipe (500)')
    expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled()
  })

  it('disables the buttons while the delete is in flight', async () => {
    // A fetch that stays pending until the test lets it finish.
    let finish: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    )
    renderMenu()

    await confirmDelete()

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    finish(new Response(null, { status: 204 }))
    expect(await screen.findByText('Recipe list')).toBeInTheDocument()
  })
})
