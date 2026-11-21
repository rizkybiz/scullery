// SPIKE (temporary, removed before the import agent lands): proves that on the Hobby plan
// a Workflow run can call AI Gateway with the deployment's OIDC identity and get
// structured output back. Fixed input, no user text, nothing written anywhere.
import { generateText, Output } from 'ai'
import { z } from 'zod'

const SAMPLE = `Garlic butter pasta. Serves 2.
200 g spaghetti
2-3 cloves garlic, minced
30 g butter
Salt to taste
Boil the pasta. Melt the butter, cook the garlic for 1 minute, toss with the pasta.`

const Draft = z.object({
  title: z.string(),
  servings: z.number().nullable(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      quantity_min: z.number().nullable(),
      quantity_max: z.number().nullable(),
      unit: z.string().nullable(),
      preparation: z.string().nullable(),
    }),
  ),
  steps: z.array(z.string()),
})

export type SpikeResult = {
  draft: z.infer<typeof Draft>
  requestedModel: string
  answeredBy: string | undefined
  inputTokens: number | undefined
  outputTokens: number | undefined
}

async function structureSample(model: string, fallbacks: string[]): Promise<SpikeResult> {
  'use step'
  const result = await generateText({
    model,
    instructions:
      'Extract the recipe in the text into the schema. Use null for anything the text does not say.',
    prompt: SAMPLE,
    output: Output.object({ schema: Draft }),
    providerOptions: { gateway: { models: fallbacks } },
  })
  return {
    draft: result.output,
    requestedModel: model,
    answeredBy: result.response.modelId,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  }
}

export async function spikeWorkflow(model: string, fallbacks: string[]): Promise<SpikeResult> {
  'use workflow'
  return structureSample(model, fallbacks)
}
