'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  buildRecipe,
  isRecipeFormInput,
  mapApiErrors,
  type FormErrors,
} from '../../../forms/recipeForm.ts'
import {
  createRecipe,
  deleteRecipe,
  RecipeInUseError,
  RecipeInvalidError,
  RecipeNotFoundError,
  type Recipe,
} from '../../../lib/api/recipes.ts'

// What the delete form gets back when the delete did not happen. On success the
// action redirects instead of returning, so `null` is only the initial state.
export type DeleteState = { error: string } | null

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// deleteRecipeAction removes a recipe and sends the visitor back to the list.
//
// A Server Action is a public HTTP endpoint: anyone can POST to it directly, so it
// cannot rely on the page that shows the button. It checks its own input, and once
// sign-in exists it must check the session here too (README, decision D2).
//
// `id` is bound by the form (deleteRecipeAction.bind(null, id)); `_previous` is the
// state useActionState passes in, which this action does not need.
export async function deleteRecipeAction(id: string, _previous: DeleteState): Promise<DeleteState> {
  if (!UUID.test(id)) {
    return { error: 'That is not a valid recipe.' }
  }

  try {
    await deleteRecipe(id)
  } catch (error) {
    if (error instanceof RecipeInUseError) {
      // The API's own wording says which recipe uses this one.
      return { error: error.message }
    }
    // deleteRecipe is not cached, so these errors keep their class here. "Not found"
    // means it is already gone, which is the outcome the visitor asked for: carry on.
    if (!(error instanceof RecipeNotFoundError)) {
      console.error('Could not delete recipe', error)
      return { error: 'Could not delete the recipe.' }
    }
  }

  // Order matters. updateTag expires the cached list and this recipe's page so the
  // next read is fresh. redirect() works by throwing, so nothing after it runs, and it
  // must stay outside the try/catch above or the catch would swallow it.
  updateTag('recipes')
  updateTag(`recipe:${id}`)
  redirect('/recipes')
}

// What the create form gets back when the recipe was not saved. On success the action
// redirects instead of returning, so `null` is only the initial state.
export type CreateState = FormErrors | null

// createRecipeAction saves a new recipe from the form and opens it.
//
// Like every Server Action it is a public endpoint, so it does not trust what it is
// sent: the shape is checked first, and the content is checked by buildRecipe and then
// by the API. Once sign-in exists it must check the session here too (README, D2).
// Problems come back as messages for the form to show beside the right fields.
export async function createRecipeAction(
  _previous: CreateState,
  input: unknown,
): Promise<CreateState> {
  if (!isRecipeFormInput(input)) {
    return { message: 'That form could not be read. Reload the page and try again.' }
  }

  const built = buildRecipe(input)
  if (!built.ok) return built.errors

  let created: Recipe
  try {
    created = await createRecipe(built.recipe)
  } catch (error) {
    // createRecipe is not cached, so the error keeps its class and its details.
    if (error instanceof RecipeInvalidError) {
      return mapApiErrors(error.errors, built.ingredientRows, built.stepRows)
    }
    console.error('Could not create recipe', error)
    return { message: 'Could not save the recipe.' }
  }

  // As in deleteRecipeAction: expire the cached list first, redirect last and outside
  // the try/catch, since redirect() works by throwing.
  updateTag('recipes')
  redirect(`/recipes/${created.id}`)
}
