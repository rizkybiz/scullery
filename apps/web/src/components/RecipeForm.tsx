'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { createRecipeAction } from '../app/(app)/recipes/actions.ts'
import { newIngredientRow, type IngredientRow } from '../forms/ingredientRow.ts'
import type { RecipeFormInput } from '../forms/recipeForm.ts'
import { newStepRow, type StepRow } from '../forms/stepRow.ts'
import type { Unit } from '../lib/api/units.ts'
import FormField from './FormField.tsx'
import IngredientRows from './IngredientRows.tsx'
import StepRows from './StepRows.tsx'

type Fields = {
  title: string
  description: string
  servings: string
  prepMinutes: string
  cookMinutes: string
}

// RecipeForm is the "new recipe" form.
//
// It is a Client Component because the form is live state: ingredient and step rows are
// added, edited and removed in the browser before anything is saved. Saving, checking
// and everything that touches the API happen on the server, in createRecipeAction.
export default function RecipeForm({ units }: { units: Unit[] }) {
  const [fields, setFields] = useState<Fields>({
    title: '',
    description: '',
    servings: '',
    prepMinutes: '',
    cookMinutes: '',
  })
  const [ingredients, setIngredients] = useState<IngredientRow[]>([newIngredientRow()])
  const [steps, setSteps] = useState<StepRow[]>([newStepRow()])

  // `state` is what the action last returned (the messages for the form, or null);
  // `isPending` is true from submit until the action finishes. Because every input
  // above is controlled by state, nothing the person typed is lost when the server
  // sends back errors.
  const [state, formAction, isPending] = useActionState(createRecipeAction, null)

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
    <form action={submit} className="recipe-form">
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
      <FormField
        label="Servings"
        type="number"
        value={fields.servings}
        error={state?.fields?.['servings']}
        onChange={set('servings')}
      />
      <FormField
        label="Prep minutes"
        type="number"
        value={fields.prepMinutes}
        error={state?.fields?.['prep_minutes']}
        onChange={set('prepMinutes')}
      />
      <FormField
        label="Cook minutes"
        type="number"
        value={fields.cookMinutes}
        error={state?.fields?.['cook_minutes']}
        onChange={set('cookMinutes')}
      />

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

      {state?.message && <p role="alert">{state.message}</p>}

      <div className="form-actions">
        <button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save recipe'}
        </button>
        <Link href="/recipes">Cancel</Link>
      </div>
    </form>
  )
}
