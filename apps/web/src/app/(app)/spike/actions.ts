'use server'

// SPIKE (temporary): starts the spike workflow and waits for its result.
import { start } from 'workflow/api'
import { audit } from '../../../lib/audit.ts'
import { requireSession } from '../../../lib/auth/dal.ts'
import { spikeWorkflow, type SpikeResult } from '../../../workflows/spike.ts'

export type SpikeState =
  | { ok: true; runId: string; ms: number; result: SpikeResult }
  | { ok: false; runId?: string; error: string }
  | null

const ALLOWED = new Set([
  'anthropic/claude-haiku-5.5',
  'openai/gpt-5-nano',
  'google/gemini-2.5-flash-lite',
])

export async function runSpikeAction(_prev: SpikeState, form: FormData): Promise<SpikeState> {
  const session = await requireSession()
  const model = String(form.get('model') ?? '')
  if (!ALLOWED.has(model)) return { ok: false, error: 'Unknown model' }

  const started = Date.now()
  let runId: string | undefined
  try {
    const run = await start(spikeWorkflow, [model, []])
    runId = run.runId
    audit('spike.started', { user: session.name, model, runId })
    const result = await run.returnValue
    return { ok: true, runId, ms: Date.now() - started, result }
  } catch (error) {
    // A spike: show the real error, it is what we are here to learn.
    console.error('spike failed', error)
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return { ok: false, runId, error: message.slice(0, 2000) }
  }
}
