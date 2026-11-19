import { getApi } from './client.ts'
import type { components } from './schema.d.ts'

export type Unit = components['schemas']['Unit']

// listUnits returns every unit of measure, for the ingredient unit dropdown.
export async function listUnits(): Promise<Unit[]> {
  const { data, error, response } = await getApi().GET('/units')
  if (error) {
    throw new Error(`Could not load units (${response.status})`)
  }
  return data.units ?? []
}
