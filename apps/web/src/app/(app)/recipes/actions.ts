'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit.ts'
import { requireSession } from '@/lib/auth/dal.ts'
import { isReadOnly, READ_ONLY_MESSAGE } from '@/lib/flags.ts'
import {
  buildRecipe,
  isRecipeFormInput,
  mapApiErrors,
  type FormErrors,
} from '@/forms/recipeForm.ts'
import {
  createRecipe,
  deleteRecipe,
  readRecipe,
  RecipeInUseError,
  RecipeInvalidError,
  RecipeNotFoundError,
  updateRecipe,
  type Recipe,
} from '@/lib/api/recipes.ts'

// What the delete form gets back when the delete did not happen. On success the
// action redirects instead of returning, so `null` is only the initial state.
export type DeleteState = { error: string } | null

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// deleteRecipeAction removes a recipe and sends the visitor back to the list.
//
// A Server Action is a public HTTP endpoint: anyone can POST to it directly, so it
// cannot rely on the page that shows the button, or on the proxy. It checks the session
// itself, FIRST, and then its own input (README, decision D2).
//
// `id` is bound by the form (deleteRecipeAction.bind(null, id)); `_previous` is the
// state useActionState passes in, which this action does not need.
export async function deleteRecipeAction(id: string, _previous: DeleteState): Promise<DeleteState> {
  const session = await requireSession()
  // The kill switch: when on, nothing is changed. Signed in first, so a signed-out visitor
  // learns nothing about the switch.
  if (isReadOnly()) return { error: READ_ONLY_MESSAGE }

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
  audit('recipe.deleted', { user: session.name, id })
  updateTag('recipes')
  updateTag(`recipe:${id}`)
  redirect('/recipes')
}

// What the recipe form gets back from a save (create or update) that did not happen. On success
// the action redirects instead of returning, so `null` is only the initial state.
export type SaveState = FormErrors | null

// createRecipeAction saves a new recipe from the form and opens it.
//
// Like every Server Action it is a public endpoint, so it trusts nothing it is sent: the
// session is checked first, then the shape, then the content (buildRecipe, then the API).
// Problems come back as messages for the form to show beside the right fields.
export async function createRecipeAction(_previous: SaveState, input: unknown): Promise<SaveState> {
  const session = await requireSession()
  if (isReadOnly()) return { message: READ_ONLY_MESSAGE }

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
  audit('recipe.created', { user: session.name, id: created.id })
  updateTag('recipes')
  redirect(`/recipes/${created.id}`)
}

// updateRecipeAction saves an edited recipe and opens it.
//
// The same checks as createRecipeAction, in the same order, plus the id. `id` is bound by the
// edit page (updateRecipeAction.bind(null, id)); a bound argument still arrives from the
// browser, so it is checked like any other input.
//
// The API's PUT replaces the whole recipe, and the form does not edit two of its fields: the
// favorite flag and the source name. They are read from the recipe as it is now (not from the
// cache) and sent back unchanged, so saving an edit never quietly clears them. Two people
// saving the same recipe at once: the last save wins (there is no version check).
export async function updateRecipeAction(
  id: string,
  _previous: SaveState,
  input: unknown,
): Promise<SaveState> {
  const session = await requireSession()
  if (isReadOnly()) return { message: READ_ONLY_MESSAGE }

  if (!UUID.test(id)) return { message: 'That is not a valid recipe.' }
  if (!isRecipeFormInput(input)) {
    return { message: 'That form could not be read. Reload the page and try again.' }
  }

  const built = buildRecipe(input)
  if (!built.ok) return built.errors

  const gone = { message: 'This recipe no longer exists. It may have been deleted.' }
  try {
    const current = await readRecipe(id)
    if (current === null) return gone
    await updateRecipe(id, {
      ...built.recipe,
      is_favorite: current.is_favorite,
      source_name: current.source_name,
    })
  } catch (error) {
    if (error instanceof RecipeInvalidError) {
      return mapApiErrors(error.errors, built.ingredientRows, built.stepRows)
    }
    if (error instanceof RecipeNotFoundError) return gone
    console.error('Could not update recipe', error)
    return { message: 'Could not save the recipe.' }
  }

  // As in the other actions: expire the list and this recipe's page, redirect last.
  audit('recipe.updated', { user: session.name, id })
  updateTag('recipes')
  updateTag(`recipe:${id}`)
  redirect(`/recipes/${id}`)
}
