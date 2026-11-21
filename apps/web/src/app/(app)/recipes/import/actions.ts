'use server'

import { start } from 'workflow/api'
import { audit } from '../../../../lib/audit.ts'
import { listUnits, type Unit } from '../../../../lib/api/units.ts'
import { requireSession } from '../../../../lib/auth/dal.ts'
import { IMPORT_DISABLED_MESSAGE, isImportDisabled } from '../../../../lib/flags.ts'
import { MAX_SOURCE_CHARS } from '../../../../lib/import/source.ts'
import { importRecipeWorkflow, type ImportInput } from '../../../../workflows/importRecipe.ts'

export type StartImportState = { runId: string } | { error: string } | null

const MAX_URL = 2000

// Server Actions accept whatever a caller sends, so the shape is checked before anything else.
function readInput(value: unknown): ImportInput | string {
  if (typeof value !== 'object' || value === null) return 'Nothing to import.'
  const { kind, url, text } = value as Record<string, unknown>
  if (kind === 'url' && typeof url === 'string') {
    const trimmed = url.trim()
    if (trimmed === '') return 'Paste a link to a recipe.'
    if (trimmed.length > MAX_URL) return 'That link is too long.'
    return { kind: 'url', url: trimmed }
  }
  if (kind === 'text' && typeof text === 'string') {
    if (text.trim() === '') return 'Paste the recipe text.'
    if (text.length > MAX_SOURCE_CHARS) {
      return `That is too long to import (over ${MAX_SOURCE_CHARS.toLocaleString('en')} characters).`
    }
    return { kind: 'text', text }
  }
  return 'Nothing to import.'
}

// startImportAction starts an import and returns at once with the run's id; the page then asks
// /api/import/<runId> how it is going. An import can take from a second to half a minute (the
// fallback model is slow), longer than an action should hold a request open.
export async function startImportAction(
  _previous: StartImportState,
  value: unknown,
): Promise<StartImportState> {
  const session = await requireSession()
  // Checked on every call, whatever the page showed: a deployment can be switched off after the
  // page was loaded, and a Server Action can be called without the page at all.
  if (isImportDisabled()) {
    audit('import.refused', { user: session.name, reason: 'disabled' })
    return { error: IMPORT_DISABLED_MESSAGE }
  }
  const input = readInput(value)
  if (typeof input === 'string') return { error: input }

  let units: Unit[] = []
  try {
    units = await listUnits()
  } catch (error) {
    // Without units the draft has no units; the import still works and the form lets people pick.
    console.error('Could not load units for an import', error)
  }

  try {
    const run = await start(importRecipeWorkflow, [input, units])
    audit('import.started', { user: session.name, kind: input.kind, runId: run.runId })
    return { runId: run.runId }
  } catch (error) {
    console.error('Could not start an import', error)
    return { error: 'The import could not be started. Try again in a minute.' }
  }
}
