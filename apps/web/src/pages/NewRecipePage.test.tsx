import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubApi } from '../test/stubApi.ts'
import NewRecipePage from './NewRecipePage.tsx'

const units = [
  { code: 'cup', name: 'cup', dimension: 'volume', base_factor: 236.588236 },
  { code: 'tbsp', name: 'tablespoon', dimension: 'volume', base_factor: 14.786765 },
  { code: 'clove', name: 'clove', dimension: 'count', base_factor: null },
]

// stubApi, plus the units list every render of the form now fetches.
function stubForm(routes: Parameters<typeof stubApi>[0]) {
  return stubApi({ '/api/units': () => ({ body: { units } }), ...routes })
}

// The POSTs the page made (the units fetch is a GET, so it is left out).
function posts(fake: ReturnType<typeof stubApi>) {
  return fake.mock.calls.filter(([input]) => (input as Request).method === 'POST')
}

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
    const fake = stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
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
    const fake = stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
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
    const fake = stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), '  Toast  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    await screen.findByText(/Detail page/)
    expect((await lastBody(fake)).json).toMatchObject({ title: 'Toast' })
  })

  it('goes to the new recipe once it is saved', async () => {
    stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
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
    const fake = stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Title is required')
    expect(posts(fake)).toHaveLength(0)

    // The message goes away once there is a title, and the form can be saved.
    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(await screen.findByText(/Detail page/)).toBeInTheDocument()
  })

  it('shows the API’s complaint next to the field and stays on the form', async () => {
    // Servings below zero passes the browser's checks but not the API's.
    stubForm({
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
    stubForm({ '/api/recipes': () => ({ status: 500, body: { title: 'oops', status: 500 } }) })
    renderForm()

    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Toast')
  })
})

// The <li> rows of the ingredient list.
function ingredientRows() {
  return within(screen.getByRole('list', { name: 'Ingredients' })).getAllByRole('listitem')
}

describe('NewRecipePage ingredient rows', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with one empty row of structured fields', () => {
    stubForm({})
    renderForm()

    expect(screen.getByRole('heading', { level: 2, name: 'Ingredients' })).toBeInTheDocument()
    const rows = ingredientRows()
    expect(rows).toHaveLength(1)
    for (const label of ['Quantity', 'Unit', 'Ingredient', 'Preparation']) {
      expect(within(rows[0]!).getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Add ingredient' })).toBeInTheDocument()
  })

  it('fills the unit dropdown from the API, with "No unit" first', async () => {
    stubForm({})
    renderForm()

    const unit = within(ingredientRows()[0]!).getByLabelText('Unit')
    await within(unit).findByRole('option', { name: 'tablespoon' })
    const names = within(unit)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(names).toEqual(['No unit', 'cup', 'tablespoon', 'clove'])
  })

  it('adds a row and removes a row', async () => {
    stubForm({})
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    expect(ingredientRows()).toHaveLength(2)

    await userEvent.click(within(ingredientRows()[0]!).getByRole('button', { name: 'Remove' }))
    expect(ingredientRows()).toHaveLength(1)
  })

  it('keeps what was typed in the other rows when one is removed', async () => {
    stubForm({})
    renderForm()
    await userEvent.type(within(ingredientRows()[0]!).getByLabelText('Ingredient'), 'flour')
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await userEvent.type(within(ingredientRows()[1]!).getByLabelText('Ingredient'), 'sugar')

    await userEvent.click(within(ingredientRows()[0]!).getByRole('button', { name: 'Remove' }))

    expect(ingredientRows()).toHaveLength(1)
    expect(within(ingredientRows()[0]!).getByLabelText('Ingredient')).toHaveValue('sugar')
  })

  it('posts the ingredients in order, with the unit as its code', async () => {
    const fake = stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()
    await userEvent.type(screen.getByLabelText('Title'), 'Shortbread')

    const first = ingredientRows()[0]!
    await userEvent.type(within(first).getByLabelText('Quantity'), '2')
    await within(first).findByRole('option', { name: 'cup' })
    await userEvent.selectOptions(within(first).getByLabelText('Unit'), 'cup')
    await userEvent.type(within(first).getByLabelText('Ingredient'), 'flour')
    await userEvent.type(within(first).getByLabelText('Preparation'), 'sifted')

    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await userEvent.type(within(ingredientRows()[1]!).getByLabelText('Ingredient'), 'salt')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    await screen.findByText(/Detail page/)
    const { json } = await lastBody(fake)
    const ingredients = (json as { ingredients: Record<string, unknown>[] }).ingredients
    expect(ingredients[0]).toMatchObject({
      quantity_min: 2,
      unit_code: 'cup',
      name: 'flour',
      preparation: 'sifted',
    })
    expect(ingredients[1]).toMatchObject({ name: 'salt' })
    // Left blank means unknown: absent or null, never 0 or ''.
    for (const key of ['quantity_min', 'unit_code', 'preparation']) {
      expect(ingredients[1]![key] ?? null).toBeNull()
    }
  })

  it('leaves out a row that was never filled in', async () => {
    const fake = stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()
    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    await screen.findByText(/Detail page/)
    const { json } = await lastBody(fake)
    expect((json as { ingredients?: unknown[] }).ingredients ?? []).toHaveLength(0)
  })

  it('asks for a name, without calling the API, when a row has details but no name', async () => {
    const fake = stubForm({ '/api/recipes': () => ({ status: 201, body: created }) })
    renderForm()
    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.type(within(ingredientRows()[0]!).getByLabelText('Quantity'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    const row = ingredientRows()[0]!
    expect(await within(row).findByText('Ingredient is required')).toBeInTheDocument()
    expect(within(row).getByLabelText('Ingredient')).toHaveAccessibleDescription(
      'Ingredient is required',
    )
    expect(posts(fake)).toHaveLength(0)
  })

  it('shows an API complaint on the row it is about, even after blank rows were skipped', async () => {
    // Row 1 is blank and not sent, so the API's "ingredients[0]" is the SECOND row on screen.
    stubForm({
      '/api/recipes': () => ({
        status: 422,
        body: {
          title: 'Unprocessable Entity',
          status: 422,
          detail: 'validation failed',
          errors: [{ location: 'body.ingredients[0].name', message: 'name is no good' }],
        },
      }),
    })
    renderForm()
    await userEvent.type(screen.getByLabelText('Title'), 'Toast')
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await userEvent.type(within(ingredientRows()[1]!).getByLabelText('Ingredient'), 'flour')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))

    expect(await within(ingredientRows()[1]!).findByText('name is no good')).toBeInTheDocument()
    expect(within(ingredientRows()[0]!).queryByText('name is no good')).not.toBeInTheDocument()
  })
})
