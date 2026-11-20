import { cacheLife, cacheTag } from 'next/cache'
import { getApi } from './client.ts'
import type { components } from './schema.d.ts'

export type Unit = components['schemas']['Unit']

// listUnits returns every unit of measure, for the ingredient unit dropdown.
// Cached for days under the tag 'units': the list is fixed data that changes only when the
// API's migrations do.
export async function listUnits(): Promise<Unit[]> {
  'use cache'
  cacheTag('units')
  cacheLife('days')

  const { data, error, response } = await getApi().GET('/units')
  if (error) {
    throw new Error(`Could not load units (${response.status})`)
  }
  return data.units ?? []
}
