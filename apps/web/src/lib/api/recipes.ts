import { cacheLife, cacheTag } from 'next/cache'
import { getApi } from './client.ts'
import type { components } from './schema.d.ts'

// Types generated from the API, given short names. `components['schemas']` holds
// every named body in openapi.json.
export type RecipeList = components['schemas']['List']
export type RecipeSummary = components['schemas']['Summary']
export type Recipe = components['schemas']['Recipe']
export type NewRecipe = components['schemas']['NewRecipe']
export type ErrorDetail = components['schemas']['ErrorDetail']

export type ListQuery = {
  q: string
  favoritesOnly: boolean
  limit: number
  offset: number
}

// listRecipes returns a list of recipes. Various query parameters are respected.
//
// Cached: "use cache" stores the result keyed by the arguments, so each distinct
// search, filter and page is cached separately and shared by every visitor.
// Two things end an entry's life:
//  - the tag 'recipes': anything that creates, edits or deletes a recipe through
//    this app invalidates it, so the change shows up immediately;
//  - cacheLife('minutes'): the safety net for changes that bypass this app (a
//    direct write to the API), which can be stale for up to that window.
export async function listRecipes(query: ListQuery): Promise<RecipeList> {
  'use cache'
  cacheTag('recipes')
  cacheLife('minutes')

  const { data, error, response } = await getApi().GET('/recipes', {
    params: {
      query: {
        q: query.q || undefined,
        favorite: query.favoritesOnly ? 'true' : undefined,
        limit: query.limit,
        offset: query.offset,
      },
    },
  })
  if (error) {
    throw new Error(`Could not load recipes (${response.status})`)
  }
  return data
}

// Thrown by deleteRecipe when the API returns 404. (getRecipe returns null instead.)
export class RecipeNotFoundError extends Error {}

// Thrown when the API returns a 409 for a recipe in use
export class RecipeInUseError extends Error {}

// getRecipe returns a recipe by id, or null when there is no such recipe.
//
// Cached, tagged with this recipe's own tag so that editing or deleting one recipe
// invalidates only its page (and the list), not every other recipe.
//
// "Not found" is returned as a value (null), not thrown. An error thrown from a
// cached function loses its message in a production build (and so, very likely,
// its class), so the page could not reliably tell "no such recipe" from "the API
// is down" with instanceof. A missing recipe is an expected answer, not a failure.
// The API answers 404 for an unknown id and 422 for one that is not a UUID at all;
// to a visitor both mean there is nothing at this URL.
export async function getRecipe(id: string): Promise<Recipe | null> {
  'use cache'
  cacheTag(`recipe:${id}`)
  cacheLife('minutes')
  return readRecipe(id)
}

// readRecipe is getRecipe without the cache, for an action about to write: it must start from
// the recipe as it is now, not as it was up to a few minutes ago.
export async function readRecipe(id: string): Promise<Recipe | null> {
  const { data, error, response } = await getApi().GET('/recipes/{id}', {
    params: {
      path: {
        id,
      },
    },
  })
  if (response.status === 404 || response.status === 422) {
    return null
  }
  if (error) {
    throw new Error(`Could not load the recipe (${response.status})`)
  }
  return data
}

// deleteRecipe removes a specific recipe
export async function deleteRecipe(id: string) {
  const { error, response } = await getApi().DELETE('/recipes/{id}', {
    params: {
      path: {
        id,
      },
    },
  })
  if (response.status === 404) {
    throw new RecipeNotFoundError(error?.detail ?? 'Recipe not found.')
  }
  if (response.status === 409) {
    throw new RecipeInUseError(error?.detail ?? 'This recipe is used in another recipe.')
  }
  if (error) {
    throw new Error(`Could not delete the recipe (${response.status})`)
  }
}

// Thrown when the API returns a 422: the recipe was well-formed JSON but broke a
// rule. `errors` says which field and why; `location` looks like 'body.title'.
export class RecipeInvalidError extends Error {
  errors: ErrorDetail[]
  constructor(message: string, errors: ErrorDetail[]) {
    super(message)
    this.errors = errors
  }
}

// createRecipe takes a body shaped like NewRecipe and creates a new recipe.
export async function createRecipe(recipe: NewRecipe): Promise<Recipe> {
  const { data, error, response } = await getApi().POST('/recipes', {
    body: recipe,
  })
  if (response.status === 422) {
    throw new RecipeInvalidError(error?.detail ?? 'The recipe has errors', error?.errors ?? [])
  }
  if (error) {
    throw new Error(`Could not create the recipe (${response.status})`)
  }
  return data
}

// updateRecipe replaces a recipe: the API's PUT takes the whole recipe, ingredients and steps
// included, so anything left out of `recipe` is cleared, not kept.
export async function updateRecipe(id: string, recipe: NewRecipe): Promise<Recipe> {
  const { data, error, response } = await getApi().PUT('/recipes/{id}', {
    params: { path: { id } },
    body: recipe,
  })
  if (response.status === 404) {
    throw new RecipeNotFoundError(error?.detail ?? 'Recipe not found.')
  }
  if (response.status === 422) {
    throw new RecipeInvalidError(error?.detail ?? 'The recipe has errors', error?.errors ?? [])
  }
  if (error) {
    throw new Error(`Could not update the recipe (${response.status})`)
  }
  return data
}
