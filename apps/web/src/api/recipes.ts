import { api } from './client.ts'
import type { components } from './schema.d.ts'

// Types generated from the API, given short names. `components['schemas']` holds
// every named body in openapi.json.
export type RecipeList = components['schemas']['List']
export type RecipeSummary = components['schemas']['Summary']
export type Recipe = components['schemas']['Recipe']

export interface ListQuery {
  q: string
  favoritesOnly: boolean
  limit: number
  offset: number
}

// listRecipes returns a list of recipes. Various query parameters are respected
export async function listRecipes(query: ListQuery, signal: AbortSignal): Promise<RecipeList> {
  const { data, error, response } = await api.GET('/recipes', {
    params: {
      query: {
        q: query.q || undefined,
        favorite: query.favoritesOnly ? 'true' : undefined,
        limit: query.limit,
        offset: query.offset,
      },
    },
    signal,
  })
  if (error) {
    throw new Error(`Could not load recipes (${response.status})`)
  }
  return data
}

// Thrown when the API returns 404 for a specific recipe
export class RecipeNotFoundError extends Error {}

// Thrown when the API returns a 409 for a recipe in use
export class RecipeInUseError extends Error {}

// getRecipe returns a specific recipe by id from the path parameter
export async function getRecipe(id: string, signal: AbortSignal): Promise<Recipe> {
  const { data, error, response } = await api.GET('/recipes/{id}', {
    params: {
      path: {
        id,
      },
    },
    signal,
  })
  if (response.status === 404) {
    throw new RecipeNotFoundError(error?.detail ?? 'Recipe not found.')
  }
  if (error) {
    throw new Error(`Could not load the recipe (${response.status})`)
  }
  return data
}

// deleteRecipe removes a specific recipe
export async function deleteRecipe(id: string) {
  const { error, response } = await api.DELETE('/recipes/{id}', {
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
