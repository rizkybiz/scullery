'use client'

import { useCallback, useState } from 'react'
import { fromRecipe, type RecipeFormState } from '../forms/fromRecipe.ts'
import type { Unit } from '../lib/api/units.ts'
import type { ImportOutcome } from '../workflows/importRecipe.ts'
import ImportPanel from './ImportPanel.tsx'
import RecipeForm from './RecipeForm.tsx'

type Done = Extract<ImportOutcome, { ok: true }>

// The "new recipe" page's client part: the import panel above the recipe form. An imported
// draft re-mounts the form (a new `key`) filled in with it, so the person reviews and saves it
// with the same form, the same checks and the same Server Action as a recipe typed by hand.
export default function NewRecipeEditor({ units }: { units: Unit[] }) {
  const [draft, setDraft] = useState<{ key: number; state: RecipeFormState; from: Done } | null>(
    null,
  )
  const onDraft = useCallback(
    (done: Done) =>
      setDraft((previous) => ({
        key: (previous?.key ?? 0) + 1,
        state: fromRecipe(done.recipe),
        from: done,
      })),
    [],
  )

  return (
    <>
      <ImportPanel onDraft={onDraft} />
      {draft && (
        <div role="status" className="import-result">
          <p>
            Filled in from{' '}
            {draft.from.via.source === 'jsonld' ? "the page's recipe data" : 'the text'} by{' '}
            {draft.from.via.model} through AI Gateway, in {(draft.from.via.ms / 1000).toFixed(1)} s.
            Check every field before saving.
          </p>
          {draft.from.warnings.length > 0 && (
            <ul>
              {draft.from.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <RecipeForm key={draft?.key ?? 0} units={units} initial={draft?.state} />
    </>
  )
}
