// From the model's answer to a draft the form can show. The answer is treated as untrusted input:
// it passed the schema, but values can still be out of range, too long or inconsistent. Every rule
// here is the API's own (services/api), applied so the draft the person sees is one the API would
// accept, plus a few tidy-ups the spike showed models need. Plain logic, no framework imports.
import type { NewRecipe } from '../api/recipes.ts'
import type { Draft } from './schema.ts'
import { parseIsoDuration, type ImportSource } from './source.ts'

export type Normalized =
  { isRecipe: true; recipe: NewRecipe; warnings: string[] } | { isRecipe: false; title: string }

const MAX_ROWS = 200
const MAX_AMOUNT = 999_999
const MAX_MINUTES = 525_600
const MAX_TIMER_SECONDS = 86_400

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed.slice(0, max)
}

function inRange(value: number | null | undefined, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null
}

export function normalizeDraft(
  draft: Draft,
  source: ImportSource,
  unitCodes: ReadonlySet<string>,
): Normalized {
  const title = text(draft.title, 200)
  if (!draft.is_recipe) return { isRecipe: false, title: title ?? 'Not a recipe' }

  const warnings: string[] = []

  const ingredients = draft.ingredients.slice(0, MAX_ROWS).flatMap((line) => {
    const name = text(line.name, 200)
    if (name === null) return []
    let min = inRange(line.quantity_min, 0, MAX_AMOUNT)
    let max = inRange(line.quantity_max, 0, MAX_AMOUNT)
    if (min === null && max !== null) [min, max] = [max, null] // "up to 3": keep the amount
    if (max !== null && min !== null && max <= min) max = null // "200 to 200" is just 200
    const unit = line.unit_code !== null && unitCodes.has(line.unit_code) ? line.unit_code : null
    return [
      {
        name,
        quantity_min: min,
        quantity_max: max,
        unit_code: unit,
        preparation: text(line.preparation, 200),
        note: text(line.note, 500),
        section: text(line.section, 200),
        optional: line.optional === true,
      },
    ]
  })

  const steps = draft.steps.slice(0, MAX_ROWS).flatMap((step) => {
    const instruction = text(step.instruction, 5000)
    if (instruction === null) return []
    const timer = inRange(step.timer_seconds, 1, MAX_TIMER_SECONDS)
    return [
      {
        instruction,
        timer_seconds: timer === null ? null : Math.round(timer),
        section: text(step.section, 200),
      },
    ]
  })

  if (draft.ingredients.length > MAX_ROWS || draft.steps.length > MAX_ROWS) {
    warnings.push(`Only the first ${MAX_ROWS} ingredients and steps were kept.`)
  }
  if (ingredients.length === 0) warnings.push('No ingredients were found. Check the source.')
  if (steps.length === 0) warnings.push('No steps were found. Check the source.')

  // JSON-LD states times exactly ("PT1H30M"); parse them instead of trusting the model's arithmetic.
  let prep = inRange(draft.prep_minutes, 0, MAX_MINUTES)
  let cook = inRange(draft.cook_minutes, 0, MAX_MINUTES)
  if (source.kind === 'jsonld') {
    prep = parseIsoDuration(source.recipe['prepTime']) ?? prep
    cook = parseIsoDuration(source.recipe['cookTime']) ?? cook
  }

  const servings = inRange(draft.servings, 0, MAX_AMOUNT)
  return {
    isRecipe: true,
    warnings,
    recipe: {
      title: title ?? 'Untitled recipe',
      description: text(draft.description, 5000) ?? '',
      servings: servings === 0 ? null : servings,
      yield_text: text(draft.yield_text, 200),
      prep_minutes: prep === null ? null : Math.round(prep),
      cook_minutes: cook === null ? null : Math.round(cook),
      source_url: source.url,
      ingredients,
      steps,
    },
  }
}
