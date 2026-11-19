'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { deleteRecipe, RecipeInUseError, RecipeNotFoundError } from '../../lib/api/recipes.ts'

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
