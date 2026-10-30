import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubApi } from '../test/stubApi.ts'
import NewRecipePage from './NewRecipePage.tsx'

const NEW_ID = '01a15eb1-6431-756c-aa9b-c2060b5162d2'

// What the API answers to a successful POST /recipes. Only `id` matters here: the
// page should use it to navigate.
const created = { id: NEW_ID, title: 'Weeknight marinara' }

// Renders the form at /recipes/new, with a stand-in for the detail page so a test
// can tell that navigation happened.
function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/recipes/new']}>
        <Routes>
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/:id" element={<p>Detail page for {NEW_ID}</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// The JSON body of the last request the page made.
async function lastBody(fake: ReturnType<typeof stubApi>) {
  const request = fake.mock.calls.at(-1)?.[0] as Request
  return { method: request.method, json: (await request.clone().json()) as unknown }
}

describe('NewRecipePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a labelled field for each basic property', () => {
    renderForm()

    expect(screen.getByRole('heading', { level: 1, name: 'New recipe' })).toBeInTheDocument()
    for (const label of ['Title', 'Description', 'Servings', 'Prep Minutes', 'Cook Minutes']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeInTheDocument()
  })

  it('posts what was typed, with numbers as numbers', async () => {
    const fake = stubApi({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), 'Weeknight marinara')
    await userEvent.type(screen.getByLabelText('Description'), 'A quick tomato sauce.')
    await userEvent.type(screen.getByLabelText('Servings'), '4')
    await userEvent.type(screen.getByLabelText('Prep Minutes'), '10')
    await userEvent.type(screen.getByLabelText('Cook Minutes'), '25')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    await screen.findByText(/Detail page/)
    const { method, json } = await lastBody(fake)
    expect(method).toBe('POST')
    expect(json).toMatchObject({
      title: 'Weeknight marinara',
      description: 'A quick tomato sauce.',
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 25,
    })
  })

  it('does not send an empty number field as 0', async () => {
    const fake = stubApi({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    await screen.findByText(/Detail page/)
    const { json } = await lastBody(fake)
    expect(json).toMatchObject({ title: 'Toast' })
    // Left blank means "unknown": the key is absent or null, never 0 or NaN.
    for (const key of ['servings', 'prep_minutes', 'cook_minutes']) {
      expect((json as Record<string, unknown>)[key] ?? null).toBeNull()
    }
  })

  it('trims the title', async () => {
    const fake = stubApi({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), '  Toast  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    await screen.findByText(/Detail page/)
    expect((await lastBody(fake)).json).toMatchObject({ title: 'Toast' })
  })

  it('goes to the new recipe once it is saved', async () => {
    stubApi({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), 'Weeknight marinara')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    expect(await screen.findByText(`Detail page for ${NEW_ID}`)).toBeInTheDocument()
  })

  it('disables the button and says so while saving', async () => {
    // A response that never arrives keeps the mutation pending.
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    const saving = await screen.findByRole('button', { name: 'Saving…' })
    expect(saving).toBeDisabled()
  })

  it('asks for a title without calling the API when it is blank', async () => {
    const fake = stubApi({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Title is required')
    expect(fake).not.toHaveBeenCalled()

    // The message goes away once there is a title, and the form can be saved.
    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(await screen.findByText(/Detail page/)).toBeInTheDocument()
  })

  it('shows the API’s complaint next to the field and stays on the form', async () => {
    // Servings below zero passes the browser's checks but not the API's.
    stubApi({
      '/api/recipes': () => ({
        status: 422,
        body: {
          title: 'Unprocessable Entity',
          status: 422,
          detail: 'validation failed',
          errors: [{ location: 'body.servings', message: 'expected number >= 0' }],
        },
      }),
    })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.type(screen.getByLabelText('Servings'), '-1')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    expect(await screen.findByText('expected number >= 0')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'New recipe' })).toBeInTheDocument()
    // Tie the message to its input for screen readers (aria-describedby).
    expect(screen.getByLabelText('Servings')).toHaveAccessibleDescription('expected number >= 0')
    // The button is usable again so the user can fix it and retry.
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeEnabled()
  })

  it('shows any other failure as an alert and keeps what was typed', async () => {
    stubApi({ '/api/recipes': () => ({ status: 500, body: { title: 'oops', status: 500 } }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Toast')
  })
})
