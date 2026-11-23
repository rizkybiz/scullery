'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SaveState } from '../app/(app)/recipes/actions.ts'
import { emptyFormState, type RecipeFormFields, type RecipeFormState } from '../forms/fromRecipe.ts'
import type { IngredientRow } from '../forms/ingredientRow.ts'
import type { RecipeFormInput } from '../forms/recipeForm.ts'
import type { StepRow } from '../forms/stepRow.ts'
import type { Unit } from '../lib/api/units.ts'
import FormField from './FormField.tsx'
import IngredientRows from './IngredientRows.tsx'
import StepRows from './StepRows.tsx'

type Fields = RecipeFormFields

// RecipeForm is the recipe form.
//
// It is a Client Component because the form is live state: ingredient and step rows are
// added, edited and removed in the browser before anything is saved. Saving, checking
// and everything that touches the API happen on the server, in `action`: createRecipeAction
// for a new recipe, updateRecipeAction (bound to the recipe's id) for an edit.
//
// `initial` fills it in (an import's draft or the recipe being edited, from fromRecipe). It is
// read once, when the form mounts: to load a different draft, the parent gives it a new `key`.
export default function RecipeForm({
  units,
  action,
  initial,
  submitLabel = 'Save recipe',
  cancelHref = '/recipes',
}: {
  units: Unit[]
  action: (previous: SaveState, input: RecipeFormInput) => Promise<SaveState>
  initial?: RecipeFormState
  submitLabel?: string
  cancelHref?: string
}) {
  const [start] = useState(() => initial ?? emptyFormState())
  const [fields, setFields] = useState<Fields>(start.fields)
  const [ingredients, setIngredients] = useState<IngredientRow[]>(start.ingredients)
  const [steps, setSteps] = useState<StepRow[]>(start.steps)

  // `state` is what the action last returned (the messages for the form, or null);
  // `isPending` is true from submit until the action finishes. Because every input
  // above is controlled by state, nothing the person typed is lost when the server
  // sends back errors.
  const [state, formAction, isPending] = useActionState(action, null)

  const set = (name: keyof Fields) => (value: string) =>
    setFields((previous) => ({ ...previous, [name]: value }))

  // The form's own `action` runs as a transition, which is what lets the action's
  // result and pending state update. Send plain data, minus the client-only row keys.
  function submit() {
    const input: RecipeFormInput = {
      ...fields,
      ingredients: ingredients.map(({ key: _key, ...row }) => row),
      steps: steps.map(({ key: _key, ...row }) => row),
    }
    formAction(input)
  }

  return (
    <form action={submit} className="space-y-8">
      <section aria-label="About the recipe" className="grid gap-4">
        <FormField
          label="Title"
          value={fields.title}
          error={state?.fields?.['title']}
          onChange={set('title')}
        />
        <FormField
          label="Description"
          multiline={true}
          value={fields.description}
          error={state?.fields?.['description']}
          onChange={set('description')}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField
            label="Servings"
            type="number"
            value={fields.servings}
            error={state?.fields?.['servings']}
            onChange={set('servings')}
          />
          <FormField
            label="Prep min"
            type="number"
            value={fields.prepMinutes}
            error={state?.fields?.['prep_minutes']}
            onChange={set('prepMinutes')}
          />
          <FormField
            label="Cook min"
            type="number"
            value={fields.cookMinutes}
            error={state?.fields?.['cook_minutes']}
            onChange={set('cookMinutes')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Makes (when servings does not fit)"
            value={fields.yieldText}
            error={state?.fields?.['yield_text']}
            onChange={set('yieldText')}
          />
          <FormField
            label="Source URL"
            value={fields.sourceUrl}
            error={state?.fields?.['source_url']}
            onChange={set('sourceUrl')}
          />
        </div>
      </section>

      <IngredientRows
        rows={ingredients}
        onChange={setIngredients}
        units={units}
        errorFor={(index, field) => state?.ingredients?.[index]?.[field]}
      />
      <StepRows
        rows={steps}
        onChange={setSteps}
        errorFor={(index, field) => state?.steps?.[index]?.[field]}
      />

      <section aria-labelledby="notes-heading" className="space-y-3">
        <h2 id="notes-heading">Notes</h2>
        <FormField
          label="Notes"
          multiline={true}
          value={fields.notes}
          error={state?.fields?.['notes']}
          onChange={set('notes')}
        />
      </section>

      {state?.message && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive"
        >
          {state.message}
        </p>
      )}

      {/* The form is long, so Save stays in reach: this bar sticks to the bottom of the screen,
          just above the tab bar (same --tabbar-height and safe area), and settles into place at
          the end of the form. The negative margins reach the page gutters. */}
      <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : submitLabel}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={cancelHref} className="text-foreground no-underline hover:no-underline">
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  )
}
