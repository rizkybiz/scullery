// The one model call of an import: source text in, structured draft out, through AI Gateway.
// No tools are offered, so the model can only answer in the schema; it cannot fetch, save or act.
import { generateText, Output } from 'ai'
import type { Unit } from '../api/units.ts'
import { IMPORT_FALLBACK_MODELS, IMPORT_MODEL } from './models.ts'
import { IMPORT_INSTRUCTIONS, importPrompt } from './prompt.ts'
import { draftSchema, type Draft } from './schema.ts'
import type { ImportSource } from './source.ts'

export type Structured = {
  draft: Draft
  // What AI Gateway reports, for the audit log and the evals: which model actually answered
  // (a fallback shows here), and the provider that served it when Gateway says.
  requestedModel: string
  answeredBy: string
  provider: string | null
  inputTokens: number | null
  outputTokens: number | null
  ms: number
}

// Gateway's routing details are not a typed API ("additional fields may be added"), so only plain
// string fields are read, and only from where they are expected.
function providerFrom(metadata: unknown): string | null {
  const gateway = (metadata as { gateway?: { routing?: Record<string, unknown> } } | undefined)
    ?.gateway
  const routing = gateway?.routing
  for (const key of ['finalProvider', 'resolvedProvider', 'provider']) {
    const value = routing?.[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return null
}

export async function structureRecipe(
  source: ImportSource,
  units: readonly Unit[],
  options: { model?: string; fallbacks?: readonly string[] } = {},
): Promise<Structured> {
  const model = options.model ?? IMPORT_MODEL
  const fallbacks = options.fallbacks ?? IMPORT_FALLBACK_MODELS
  const started = Date.now()
  const result = await generateText({
    model,
    instructions: IMPORT_INSTRUCTIONS,
    prompt: importPrompt(source, units),
    output: Output.object({ schema: draftSchema(units.map((unit) => unit.code)) }),
    // Transcription, not creativity.
    temperature: 0,
    providerOptions: { gateway: { models: [...fallbacks] } },
  })
  return {
    draft: result.output,
    requestedModel: model,
    answeredBy: result.response.modelId,
    provider: providerFrom(result.providerMetadata),
    inputTokens: result.usage.inputTokens ?? null,
    outputTokens: result.usage.outputTokens ?? null,
    ms: Date.now() - started,
  }
}
