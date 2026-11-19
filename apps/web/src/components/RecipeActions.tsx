'use client'

import { useActionState, useState } from 'react'
import { deleteRecipeAction } from '../app/recipes/actions.ts'

// The recipe's actions menu: a kebab button, a menu with Delete, and a confirm step.
//
// This is a Client Component because the menu is interactive state (open, closed,
// confirming) that only exists in the browser. Everything that touches data stays on
// the server: submitting the confirm form runs deleteRecipeAction there.
export default function RecipeActions({ id }: { id: string }) {
  const [step, setStep] = useState<'closed' | 'menu' | 'confirm'>('closed')

  // useActionState wraps the Server Action and gives back:
  //  - state: what the action last returned (an error message, or null),
  //  - formAction: what to put on <form action>,
  //  - isPending: true from submit until the action finishes.
  // bind(null, id) fixes the first argument, so the form only has to submit.
  const [state, formAction, isPending] = useActionState(deleteRecipeAction.bind(null, id), null)

  return (
    <div
      className="actions"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setStep('closed')
      }}
    >
      <button
        type="button"
        className="actions-toggle"
        aria-label="Recipe actions"
        aria-expanded={step === 'menu'}
        onClick={() => setStep(step === 'menu' ? 'closed' : 'menu')}
      >
        ⋮
      </button>

      {step === 'menu' && (
        <div className="actions-menu">
          <button type="button" onClick={() => setStep('confirm')}>
            Delete
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <>
          <form action={formAction} className="actions-confirm">
            <span>Delete this recipe?</span>
            <button type="submit" disabled={isPending}>
              {isPending ? 'Deleting…' : 'Yes'}
            </button>
            <button type="button" disabled={isPending} onClick={() => setStep('closed')}>
              Cancel
            </button>
          </form>
          {state?.error && <p role="alert">{state.error}</p>}
        </>
      )}
    </div>
  )
}
