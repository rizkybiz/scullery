'use client'

import { useActionState, useEffect, useState } from 'react'
import { startImportAction, type StartImportState } from '../app/(app)/recipes/import/actions.ts'
import type { ImportStatus } from '../app/api/import/[runId]/route.ts'
import type { ImportOutcome } from '../workflows/importRecipe.ts'

type Done = Extract<ImportOutcome, { ok: true }>

const POLL_MS = 1500
const GIVE_UP_MS = 120_000

// ImportPanel starts an import (a link or pasted text) and waits for its draft. Starting is a
// Server Action that returns a run id at once; this component then polls /api/import/<runId>,
// because an import takes from a second to half a minute. The draft is handed to the parent,
// which fills the recipe form with it. Nothing is saved here.
export default function ImportPanel({ onDraft }: { onDraft: (draft: Done) => void }) {
  const [mode, setMode] = useState<'url' | 'text'>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [started, startAction, isStarting] = useActionState<StartImportState, unknown>(
    startImportAction,
    null,
  )
  // How the last finished run ended, if it did not produce a draft. Keyed by run, so starting
  // a new import hides the old message and "waiting" is derived instead of stored.
  const [finished, setFinished] = useState<{ runId: string; message: string | null } | null>(null)

  const runId = started && 'runId' in started ? started.runId : null
  const waiting = runId !== null && finished?.runId !== runId
  const message = runId !== null && finished?.runId === runId ? finished.message : null

  // A new run id starts a wait for it. The effect polls until the run is done, fails, or takes
  // too long, and stops if the component goes away or another import starts.
  useEffect(() => {
    if (!runId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = Date.now() + GIVE_UP_MS

    async function poll() {
      if (stopped) return
      const end = (message: string | null) => setFinished({ runId: runId!, message })
      if (Date.now() > deadline) {
        end('This is taking too long. Try again, or paste the recipe text instead.')
        return
      }
      try {
        const response = await fetch(`/api/import/${runId}`, { cache: 'no-store' })
        const body = (await response.json()) as ImportStatus | { error: string }
        if (stopped) return
        if ('error' in body) return end(body.error)
        if (body.status === 'done') {
          if (body.outcome.ok) onDraft(body.outcome)
          return end(body.outcome.ok ? null : body.outcome.message)
        }
        if (body.status === 'failed') return end(body.message)
      } catch {
        // A dropped poll is not the end of the import; try again on the next tick.
      }
      timer = setTimeout(poll, POLL_MS)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [runId, onDraft])

  const busy = isStarting || waiting
  const error = started && 'error' in started ? started.error : null

  return (
    <section aria-label="Import a recipe" className="import-panel">
      <h2>Import a recipe</h2>
      <p>
        Paste a link or the recipe text. An AI fills in the form below; check it before saving.
        Importing replaces what is in the form.
      </p>
      <div role="group" aria-label="Import from">
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'url'}
            onChange={() => setMode('url')}
          />
          Link
        </label>
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'text'}
            onChange={() => setMode('text')}
          />
          Pasted text
        </label>
      </div>
      <form
        action={() => startAction(mode === 'url' ? { kind: 'url', url } : { kind: 'text', text })}
      >
        {mode === 'url' ? (
          <label>
            Recipe link
            <input
              type="url"
              value={url}
              placeholder="https://"
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
        ) : (
          <label>
            Recipe text
            <textarea value={text} rows={8} onChange={(event) => setText(event.target.value)} />
          </label>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Importing…' : 'Import'}
        </button>
      </form>
      {busy && <p role="status">Reading the recipe… this can take up to half a minute.</p>}
      {(error ?? message) && <p role="alert">{error ?? message}</p>}
    </section>
  )
}
