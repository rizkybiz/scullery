'use client'

import { ClipboardPaste, Link2, LoaderCircle, Sparkles } from 'lucide-react'
import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
    <Card className="gap-4 p-4 sm:p-6">
      <section aria-labelledby="import-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="import-heading" className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-5 text-primary" />
            Import a recipe
          </h2>
          <p className="text-sm text-muted-foreground">
            Paste a link or the recipe text. An AI fills in the form below; check it before saving.
            Importing replaces what is in the form.
          </p>
        </div>
        {/* Link or pasted text: a two-way toggle (Radix ToggleGroup: arrow keys move between
            the two, and only one is ever on). */}
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(value) => {
            if (value === 'url' || value === 'text') setMode(value)
          }}
          aria-label="Import from"
        >
          <ToggleGroupItem value="url" className="px-4">
            <Link2 aria-hidden="true" />
            Link
          </ToggleGroupItem>
          <ToggleGroupItem value="text" className="px-4">
            <ClipboardPaste aria-hidden="true" />
            Pasted text
          </ToggleGroupItem>
        </ToggleGroup>
        <form
          action={() => startAction(mode === 'url' ? { kind: 'url', url } : { kind: 'text', text })}
          className="grid gap-3"
        >
          {mode === 'url' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="import-url">Recipe link</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="import-url"
                  type="url"
                  value={url}
                  placeholder="https://"
                  onChange={(event) => setUrl(event.target.value)}
                  className="min-w-0 flex-[1_1_14rem]"
                />
                <ImportButton busy={busy} />
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="import-text">Recipe text</Label>
                <Textarea
                  id="import-text"
                  value={text}
                  rows={8}
                  onChange={(event) => setText(event.target.value)}
                  className="min-h-40"
                />
              </div>
              <div>
                <ImportButton busy={busy} />
              </div>
            </>
          )}
        </form>
        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            Reading the recipe… this can take up to half a minute.
          </p>
        )}
        {(error ?? message) && (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
            <p role="alert" className="text-destructive">
              {error ?? message}
            </p>
            {/* A link that failed (often a site that blocks automated visits) has one way
                forward: the person copies the recipe from the page in their own browser. */}
            {mode === 'url' && message && (
              <Button type="button" variant="outline" onClick={() => setMode('text')}>
                <ClipboardPaste aria-hidden="true" />
                Paste the text instead
              </Button>
            )}
          </div>
        )}
      </section>
    </Card>
  )
}

function ImportButton({ busy }: { busy: boolean }) {
  return (
    <Button type="submit" disabled={busy}>
      {busy ? 'Importing…' : 'Import'}
    </Button>
  )
}
