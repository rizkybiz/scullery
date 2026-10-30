import type { components } from './schema.d.ts'
import { api } from './client.ts'

export type Unit = components['schemas']['Unit']

// listUnits returns every unit of measure, for the ingredient unit dropdown.
export async function listUnits(signal: AbortSignal): Promise<Unit[]> {
  const { data, error, response } = await api.GET('/units', { signal })
  if (error) {
    throw new Error(`Could not load units (${response.status})`)
  }
  return data.units ?? []
}
