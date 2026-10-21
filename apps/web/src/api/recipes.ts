import { api } from './client.ts'
import type { components } from './schema.d.ts'

// Types generated from the API, given short names. `components['schemas']` holds
// every named body in openapi.json.
export type RecipeList = components['schemas']['List']
export type RecipeSummary = components['schemas']['Summary']

export interface ListQuery {
  q: string
  favoritesOnly: boolean
  limit: number
  offset: number
}

// The API treats a missing `q` or `favorite` as "no filter", so only send what is
// set. `favorite` is the string "true" there because the API framework cannot take
// an optional boolean in a URL.
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
