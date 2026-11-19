// The "new recipe" form, as plain logic with no framework imports: what the browser
// sends, turning it into the API's request, and turning the API's complaints back into
// messages for the right field. Keeping it free of Next.js lets it be tested on its own.
import type { ErrorDetail, NewRecipe } from '../lib/api/recipes.ts'
import { isBlankRow } from './ingredientRow.ts'

// What the browser sends. Every value is a string, exactly as typed: converting to
// numbers happens here, on the server, so there is one place that does it.
export type RecipeFormInput = {
  title: string
  description: string
  servings: string
  prepMinutes: string
  cookMinutes: string
  ingredients: { quantity: string; unitCode: string; name: string; preparation: string }[]
  steps: { instruction: string }[]
}

// Messages for the form, keyed so the form can find the one that belongs to a field.
// Ingredient and step errors are keyed by the row's position in the FORM, not in the
// request: blank rows are dropped before sending, so the API's numbering differs.
export type FormErrors = {
  message?: string
  fields?: Record<string, string>
  ingredients?: Record<number, Record<string, string>>
  steps?: Record<number, string>
}

const MAX_ROWS = 200 // the API's own limit

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string')
}

// A Server Action receives whatever a caller chooses to send, whatever the form does.
// Check the shape before trusting it. The API still validates the content.
export function isRecipeFormInput(value: unknown): value is RecipeFormInput {
  if (!isRecord(value)) return false
  if (!hasStrings(value, ['title', 'description', 'servings', 'prepMinutes', 'cookMinutes'])) {
    return false
  }
  const { ingredients, steps } = value
  return (
    Array.isArray(ingredients) &&
    ingredients.length <= MAX_ROWS &&
    ingredients.every(
      (row) => isRecord(row) && hasStrings(row, ['quantity', 'unitCode', 'name', 'preparation']),
    ) &&
    Array.isArray(steps) &&
    steps.length <= MAX_ROWS &&
    steps.every((step) => isRecord(step) && typeof step['instruction'] === 'string')
  )
}

// '' is "not given" (null), a number is a number, anything else is undefined.
function parseNumber(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

type Ingredient = NonNullable<NewRecipe['ingredients']>[number]

export type Built =
  | {
      ok: true
      recipe: NewRecipe
      // For each ingredient / step in the request, which form row it came from.
      ingredientRows: number[]
      stepRows: number[]
    }
  | { ok: false; errors: FormErrors }

// buildRecipe turns the form into the API's request, or says what is wrong with it.
// It catches what a person can fix straight away, with friendlier wording than the
// API's ("expected length >= 1"), and drops rows left completely blank.
export function buildRecipe(input: RecipeFormInput): Built {
  const fields: Record<string, string> = {}
  const ingredientErrors: Record<number, Record<string, string>> = {}

  const title = input.title.trim()
  if (title === '') fields['title'] = 'Title is required'

  const servings = parseNumber(input.servings)
  if (servings === undefined) fields['servings'] = 'Servings must be a number'
  const prepMinutes = parseNumber(input.prepMinutes)
  if (prepMinutes === undefined) fields['prep_minutes'] = 'Prep minutes must be a number'
  const cookMinutes = parseNumber(input.cookMinutes)
  if (cookMinutes === undefined) fields['cook_minutes'] = 'Cook minutes must be a number'

  const ingredients: Ingredient[] = []
  const ingredientRows: number[] = []
  input.ingredients.forEach((row, formIndex) => {
    if (isBlankRow(row)) return
    const problems: Record<string, string> = {}
    const quantity = parseNumber(row.quantity)
    if (quantity === undefined) problems['quantity_min'] = 'Quantity must be a number'
    if (row.name.trim() === '') problems['name'] = 'Ingredient name is required'
    if (Object.keys(problems).length > 0) ingredientErrors[formIndex] = problems

    ingredients.push({
      name: row.name.trim(),
      quantity_min: quantity ?? null,
      unit_code: row.unitCode === '' ? null : row.unitCode,
      preparation: row.preparation.trim() === '' ? null : row.preparation.trim(),
    })
    ingredientRows.push(formIndex)
  })

  const steps: { instruction: string }[] = []
  const stepRows: number[] = []
  input.steps.forEach((step, formIndex) => {
    if (step.instruction.trim() === '') return
    steps.push({ instruction: step.instruction.trim() })
    stepRows.push(formIndex)
  })

  const errors: FormErrors = {}
  if (Object.keys(fields).length > 0) errors.fields = fields
  if (Object.keys(ingredientErrors).length > 0) errors.ingredients = ingredientErrors
  if (errors.fields || errors.ingredients) return { ok: false, errors }

  return {
    ok: true,
    recipe: {
      title,
      description: input.description.trim(),
      servings: servings ?? null,
      prep_minutes: prepMinutes ?? null,
      cook_minutes: cookMinutes ?? null,
      ingredients,
      steps,
    },
    ingredientRows,
    stepRows,
  }
}

const KNOWN_FIELDS = new Set(['title', 'description', 'servings', 'prep_minutes', 'cook_minutes'])
const INGREDIENT = /^body\.ingredients\[(\d+)\]\.(\w+)$/
const STEP = /^body\.steps\[(\d+)\]\.(\w+)$/
const TOP_LEVEL = /^body\.(\w+)$/

// mapApiErrors turns the API's 422 details ("body.ingredients[1].name: must not be
// blank") into messages on the right field, translating the API's row numbers back to
// the form's. Anything it cannot place goes in a general message, so no complaint is
// lost.
export function mapApiErrors(
  details: ErrorDetail[],
  ingredientRows: number[],
  stepRows: number[],
): FormErrors {
  const errors: FormErrors = {}
  const unplaced: string[] = []

  for (const detail of details) {
    const location = detail.location ?? ''
    const message = detail.message ?? 'is not valid'

    const ingredient = INGREDIENT.exec(location)
    const step = STEP.exec(location)
    const top = TOP_LEVEL.exec(location)

    const ingredientRow = ingredient ? ingredientRows[Number(ingredient[1])] : undefined
    const stepRow = step ? stepRows[Number(step[1])] : undefined

    if (ingredient && ingredientRow !== undefined) {
      ;((errors.ingredients ??= {})[ingredientRow] ??= {})[ingredient[2]!] = message
    } else if (step && stepRow !== undefined) {
      ;(errors.steps ??= {})[stepRow] = message
    } else if (top && KNOWN_FIELDS.has(top[1]!)) {
      ;(errors.fields ??= {})[top[1]!] = message
    } else {
      unplaced.push(`${location || 'recipe'}: ${message}`)
    }
  }

  if (unplaced.length > 0) errors.message = unplaced.join('; ')
  if (Object.keys(errors).length === 0) errors.message = 'The recipe has errors.'
  return errors
}
