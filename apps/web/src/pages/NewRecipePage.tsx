import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router'
import { createRecipe, RecipeInvalidError, type NewRecipe } from '../api/recipes.ts'
import { listUnits } from '../api/units.ts'
import FormField from '../components/FormField.tsx'
import IngredientRows from '../components/IngredientRows.tsx'
import { newIngredientRow, type IngredientRow } from '../forms/ingredientRow.ts'

// FormState is here to simplify manipulation of the form data
type FormState = {
  title: string
  description: string
  servings: string
  prepTime: string
  cookTime: string
}

// simple helper function to convert strings to numbers
function strToNumOrNull(i: string): number | null {
  if (i === '') {
    return null
  } else {
    return Number(i)
  }
}

// small helper function to take formState in and spit out a NewRecipe
function toNewRecipe(data: FormState): NewRecipe {
  return {
    title: data.title.trim(),
    description: data.description.trim(),
    servings: strToNumOrNull(data.servings),
    prep_minutes: strToNumOrNull(data.prepTime),
    cook_minutes: strToNumOrNull(data.cookTime),
  }
}

// NewRecipePage is the "add a recipe" form, shown at /recipes/new.
export default function NewRecipePage() {
  const [formData, setFormData] = useState<FormState>({
    title: '',
    description: '',
    servings: '',
    prepTime: '',
    cookTime: '',
  })
  const [rows, setRows] = useState<IngredientRow[]>([newIngredientRow()])
  const set = (name: keyof typeof formData) => (v: string) =>
    setFormData({ ...formData, [name]: v })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: createRecipe,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
      void navigate(`/recipes/${created.id}`)
    },
  })

  // Set when a submit was stopped because the title was blank. The message only
  // shows while the title is still blank, so it disappears once the user types.
  const [titleMissing, setTitleMissing] = useState(false)

  const units = useQuery({
    queryKey: ['units'],
    queryFn: ({ signal }) => listUnits(signal),
  })

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const recipe = toNewRecipe(formData)
    // The API would refuse this too, but with the framework's wording
    // ("expected length >= 1"), so catch it here with a friendlier message.
    if (recipe.title === '') {
      setTitleMissing(true)
      return
    }
    setTitleMissing(false)
    create.mutate(recipe)
  }

  function errorFor(fieldName: string): string | undefined {
    if (fieldName === 'title' && titleMissing && formData.title.trim() === '') {
      return 'Title is required'
    }
    if (!(create.error instanceof RecipeInvalidError)) {
      return undefined
    }
    return create.error.errors.find((e) => e.location === `body.${fieldName}`)?.message
  }

  return (
    <>
      <h1>New recipe</h1>
      <form onSubmit={handleSubmit}>
        <FormField
          label="Title"
          error={errorFor('title')}
          value={formData.title}
          onChange={set('title')}
        />
        <FormField
          label="Description"
          error={errorFor('description')}
          multiline={true}
          value={formData.description}
          onChange={set('description')}
        />
        <FormField
          label="Servings"
          error={errorFor('servings')}
          type="number"
          value={formData.servings}
          onChange={set('servings')}
        />
        <FormField
          label="Prep Minutes"
          error={errorFor('prep_minutes')}
          type="number"
          value={formData.prepTime}
          onChange={set('prepTime')}
        />
        <FormField
          label="Cook Minutes"
          error={errorFor('cook_minutes')}
          type="number"
          value={formData.cookTime}
          onChange={set('cookTime')}
        />
        <IngredientRows
          rows={rows}
          onChange={setRows}
          units={units.data ?? []}
          errorFor={() => undefined}
        />
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Save Recipe'}
        </button>
        {create.isError && !(create.error instanceof RecipeInvalidError) && (
          <p role="alert">{create.error.message}</p>
        )}
      </form>
    </>
  )
}
