// The reverse of buildRecipe: turns a recipe in the API's shape into the form's state, so the
// form can start filled in. Used for an import's draft, and later for editing a saved recipe.
// Plain logic, no framework imports.
import type { NewRecipe } from '../api/recipes.ts'
import { newIngredientRow, type IngredientRow } from './ingredientRow.ts'
import { newStepRow, type StepRow } from './stepRow.ts'

export type RecipeFormFields = {
  title: string
  description: string
  servings: string
  prepMinutes: string
  cookMinutes: string
  yieldText: string
  sourceUrl: string
  notes: string
}

export type RecipeFormState = {
  fields: RecipeFormFields
  ingredients: IngredientRow[]
  steps: StepRow[]
}

const text = (value: string | null | undefined): string => value ?? ''
const number = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

// 90 seconds is shown as "1.5" minutes; buildRecipe turns it back into 90.
const minutes = (seconds: number | null | undefined): string =>
  seconds === null || seconds === undefined ? '' : String(Math.round((seconds / 60) * 100) / 100)

export function emptyFormState(): RecipeFormState {
  return fromRecipe({ title: '' })
}

// fromRecipe always gives at least one ingredient row and one step row, so there is a
// place to start typing even when the recipe has none.
export function fromRecipe(recipe: NewRecipe): RecipeFormState {
  const ingredients = (recipe.ingredients ?? []).map((ingredient): IngredientRow => ({
    ...newIngredientRow(),
    quantity: number(ingredient.quantity_min),
    quantityMax: number(ingredient.quantity_max),
    unitCode: text(ingredient.unit_code),
    name: ingredient.name,
    preparation: text(ingredient.preparation),
    note: text(ingredient.note),
    section: text(ingredient.section),
    optional: ingredient.optional ?? false,
  }))
  const steps = (recipe.steps ?? []).map((step): StepRow => ({
    ...newStepRow(),
    instruction: step.instruction,
    timerMinutes: minutes(step.timer_seconds),
    section: text(step.section),
  }))
  return {
    fields: {
      title: recipe.title,
      description: text(recipe.description),
      servings: number(recipe.servings),
      prepMinutes: number(recipe.prep_minutes),
      cookMinutes: number(recipe.cook_minutes),
      yieldText: text(recipe.yield_text),
      sourceUrl: text(recipe.source_url),
      notes: text(recipe.notes),
    },
    ingredients: ingredients.length > 0 ? ingredients : [newIngredientRow()],
    steps: steps.length > 0 ? steps : [newStepRow()],
  }
}
