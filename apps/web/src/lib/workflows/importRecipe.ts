// The recipe import as a durable Workflow run. Each step's result is recorded, so a crash or a
// redeploy resumes from the last finished step, and a failed step is retried on its own.
//
//   fetch the page (URL imports only) -> structure with a model -> tidy into the API's shape
//
// The run never saves anything: it ends with a draft that fills the recipe form, and a person
// saves it with the form's normal Save. Expected outcomes (not a recipe, a page that cannot be
// fetched) are returned as values for the page to show; only the unexpected fails the run.
import { GatewayError } from '@ai-sdk/gateway'
import { FatalError, RetryableError } from 'workflow'
import type { NewRecipe } from '../api/recipes.ts'
import type { Unit } from '../api/units.ts'
import { fetchPage, PageFetchError } from '../import/fetchPage.ts'
import { isPermanent } from '../import/gatewayError.ts'
import { normalizeDraft } from '../import/normalize.ts'
import type { Draft } from '../import/schema.ts'
import { sourceFromHtml, sourceFromText, type ImportSource } from '../import/source.ts'
import { structureRecipe } from '../import/structure.ts'

export type ImportInput = { kind: 'url'; url: string } | { kind: 'text'; text: string }

export type ImportOutcome =
  | {
      ok: true
      recipe: NewRecipe
      warnings: string[]
      // For the page and the audit log: where the draft came from and who made it.
      via: { source: 'jsonld' | 'text'; model: string; provider: string | null; ms: number }
    }
  | { ok: false; message: string }

type Fetched = { ok: true; source: ImportSource } | { ok: false; message: string }

async function readSource(input: ImportInput): Promise<Fetched> {
  'use step'
  if (input.kind === 'text') return { ok: true, source: sourceFromText(input.text) }
  try {
    const page = await fetchPage(input.url)
    return { ok: true, source: sourceFromHtml(page.html, page.url) }
  } catch (error) {
    if (error instanceof PageFetchError) {
      // A timeout or a 503 may pass: let Workflow retry the step. Anything else is the answer.
      if (error.retryable) throw new RetryableError(error.message, { retryAfter: '5s' })
      return { ok: false, message: error.message }
    }
    throw error
  }
}

type StructuredStep = {
  draft: Draft
  model: string
  provider: string | null
  ms: number
}

async function structure(source: ImportSource, units: Unit[]): Promise<StructuredStep> {
  'use step'
  try {
    const result = await structureRecipe(source, units)
    return {
      draft: result.draft,
      model: result.answeredBy,
      provider: result.provider,
      ms: result.ms,
    }
  } catch (error) {
    if (GatewayError.isInstance(error)) {
      if (isPermanent(error)) {
        throw new FatalError(`AI Gateway refused the request: ${error.message.slice(0, 300)}`)
      }
      // Gateway already tried the fallback model; give the free tier's per-minute limit time.
      throw new RetryableError(error.message.slice(0, 300), { retryAfter: '20s' })
    }
    throw error
  }
}

async function tidy(
  structured: StructuredStep,
  source: ImportSource,
  unitCodes: string[],
): Promise<ImportOutcome> {
  'use step'
  const result = normalizeDraft(structured.draft, source, new Set(unitCodes))
  if (!result.isRecipe) {
    return { ok: false, message: `That does not look like a recipe ("${result.title}").` }
  }
  return {
    ok: true,
    recipe: result.recipe,
    warnings: result.warnings,
    via: {
      source: source.kind,
      model: structured.model,
      provider: structured.provider,
      ms: structured.ms,
    },
  }
}

// `units` come from the caller (the Server Action has them cached), so the run itself never
// calls the Scullery API: it only reads the web and AI Gateway.
export async function importRecipeWorkflow(
  input: ImportInput,
  units: Unit[],
): Promise<ImportOutcome> {
  'use workflow'
  const read = await readSource(input)
  if (!read.ok) return { ok: false, message: read.message }
  const structured = await structure(read.source, units)
  return tidy(
    structured,
    read.source,
    units.map((unit) => unit.code),
  )
}
