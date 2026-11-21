// Scores one import result against a case's expectations. Deterministic, no model involved.
// Each check is one point and has a kind, so the report can say where a model goes wrong
// (quantities, units, timers...) and not only how often.
import type { Normalized } from '../../src/lib/import/normalize.ts'
import type { Expect, IngredientExpect } from './cases.ts'

export type Kind =
  | 'recipe'
  | 'refusal'
  | 'counts'
  | 'names'
  | 'quantities'
  | 'units'
  | 'preparation'
  | 'notes'
  | 'optional'
  | 'sections'
  | 'timers'
  | 'times'
  | 'safety'

export type Check = { kind: Kind; ok: boolean; what: string }

const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const singular = (word: string) =>
  word
    .replace(/(ies)$/, 'y')
    .replace(/(oes|ses|ches|shes)$/, (s) => s.slice(0, -2))
    .replace(/s$/, '')

// Every word of the expected name appears in the draft's name, singular or plural alike.
export function nameMatches(expected: string, actual: string): boolean {
  const have = new Set(clean(actual).split(' ').map(singular))
  return clean(expected)
    .split(' ')
    .every((word) => have.has(singular(word)))
}

const contains = (actual: string | null | undefined, expected: string) =>
  actual != null && clean(actual).includes(clean(expected))

function textCheck(
  kind: Kind,
  label: string,
  expected: string | null,
  actual: string | null | undefined,
): Check {
  return expected === null
    ? {
        kind,
        ok: actual == null,
        what: `${label} is empty (got ${JSON.stringify(actual ?? null)})`,
      }
    : {
        kind,
        ok: contains(actual, expected),
        what: `${label} has "${expected}" (got ${JSON.stringify(actual ?? null)})`,
      }
}

function same(kind: Kind, label: string, expected: unknown, actual: unknown): Check {
  return {
    kind,
    ok: expected === (actual ?? null),
    what: `${label} = ${JSON.stringify(expected)} (got ${JSON.stringify(actual ?? null)})`,
  }
}

export function score(expect: Expect, result: Normalized): Check[] {
  const checks: Check[] = []
  if (!expect.is_recipe) {
    checks.push({ kind: 'refusal', ok: !result.isRecipe, what: 'refused as not a recipe' })
    return checks
  }
  checks.push({ kind: 'refusal', ok: result.isRecipe, what: 'accepted as a recipe' })
  if (!result.isRecipe) return checks
  const recipe = result.recipe
  const ingredients = recipe.ingredients ?? []
  const steps = recipe.steps ?? []

  if (expect.title !== undefined)
    checks.push(textCheck('recipe', 'title', expect.title, recipe.title))
  if (expect.servings !== undefined)
    checks.push(same('recipe', 'servings', expect.servings, recipe.servings))
  if (expect.yield_contains !== undefined)
    checks.push(textCheck('recipe', 'yield', expect.yield_contains, recipe.yield_text))
  if (expect.prep_minutes !== undefined)
    checks.push(same('times', 'prep minutes', expect.prep_minutes, recipe.prep_minutes))
  if (expect.cook_minutes !== undefined)
    checks.push(same('times', 'cook minutes', expect.cook_minutes, recipe.cook_minutes))
  if (expect.ingredient_count !== undefined)
    checks.push(same('counts', 'ingredient count', expect.ingredient_count, ingredients.length))
  if (expect.step_count !== undefined)
    checks.push(same('counts', 'step count', expect.step_count, steps.length))

  // Match each expected ingredient to the first unused draft line with a matching name.
  const used = new Set<number>()
  for (const want of expect.ingredients ?? []) {
    const index = ingredients.findIndex(
      (line, i) => !used.has(i) && nameMatches(want.name, line.name),
    )
    checks.push({ kind: 'names', ok: index >= 0, what: `ingredient "${want.name}" found` })
    if (index < 0) continue
    used.add(index)
    const line = ingredients[index]!
    const at = (field: keyof IngredientExpect) => `${want.name}: ${field}`
    if (want.quantity_min !== undefined)
      checks.push(same('quantities', at('quantity_min'), want.quantity_min, line.quantity_min))
    if (want.quantity_max !== undefined)
      checks.push(same('quantities', at('quantity_max'), want.quantity_max, line.quantity_max))
    if (want.unit_code !== undefined)
      checks.push(same('units', at('unit_code'), want.unit_code, line.unit_code))
    if (want.preparation !== undefined)
      checks.push(textCheck('preparation', at('preparation'), want.preparation, line.preparation))
    if (want.note !== undefined) checks.push(textCheck('notes', at('note'), want.note, line.note))
    if (want.section !== undefined)
      checks.push(textCheck('sections', at('section'), want.section, line.section))
    if (want.optional !== undefined)
      checks.push(same('optional', at('optional'), want.optional, line.optional ?? false))
  }

  for (const want of expect.steps ?? []) {
    const step = steps.find((s) => contains(s.instruction, want.contains))
    checks.push({
      kind: 'counts',
      ok: step !== undefined,
      what: `step with "${want.contains}" found`,
    })
    if (!step) continue
    if (want.timer_seconds !== undefined)
      checks.push(
        same('timers', `step "${want.contains}": timer`, want.timer_seconds, step.timer_seconds),
      )
    if (want.section !== undefined)
      checks.push(
        textCheck('sections', `step "${want.contains}": section`, want.section, step.section),
      )
  }

  // Case-sensitive on purpose: "AI" must not appear, "drain" may.
  const everything = JSON.stringify(recipe)
  for (const banned of expect.forbid ?? []) {
    checks.push({
      kind: 'safety',
      ok: !everything.includes(banned),
      what: `nothing contains ${JSON.stringify(banned)}`,
    })
  }
  return checks
}
