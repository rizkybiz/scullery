import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { deleteRecipe, RecipeNotFoundError, RecipeInUseError } from '../api/recipes.ts'

// RecipeActions renders a menu onto the DOM for recipe actions
export default function RecipeActions({ id }: { id: string }) {
  const [step, setStep] = useState<'closed' | 'menu' | 'confirm'>('closed')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  function finish() {
    queryClient.removeQueries({ queryKey: ['recipe', id] })
    void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    void navigate('/recipes')
  }

  const remove = useMutation({
    mutationFn: deleteRecipe,
    onSuccess: finish,
    onError: (error) => {
      if (error instanceof RecipeNotFoundError) {
        finish()
      } else if (error instanceof RecipeInUseError) {
        setStep('closed')
      }
    },
  })

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
        <div className="actions-confirm">
          <span>Delete this recipe?</span>
          <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(id)}>
            {remove.isPending ? 'Deleting…' : 'Yes'}
          </button>
          <button type="button" disabled={remove.isPending} onClick={() => setStep('closed')}>
            Cancel
          </button>
        </div>
      )}
      {remove.isError && <p role="alert">{remove.error.message}</p>}
    </div>
  )
}
