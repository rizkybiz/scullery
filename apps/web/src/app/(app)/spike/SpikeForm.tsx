'use client'

// SPIKE (temporary)
import { useActionState } from 'react'
import { runSpikeAction, type SpikeState } from './actions.ts'

const MODELS = ['anthropic/claude-haiku-5.5', 'openai/gpt-5-nano', 'google/gemini-2.5-flash-lite']

export function SpikeForm() {
  const [state, formAction, pending] = useActionState<SpikeState, FormData>(runSpikeAction, null)
  return (
    <form action={formAction} className="recipe-form">
      {MODELS.map((m) => (
        <button key={m} type="submit" name="model" value={m} disabled={pending}>
          {m}
        </button>
      ))}
      {pending && <p>Running…</p>}
      {state && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(state, null, 2)}</pre>}
    </form>
  )
}
