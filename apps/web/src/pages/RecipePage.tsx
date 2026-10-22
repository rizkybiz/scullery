import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { getRecipe, RecipeNotFoundError } from '../api/recipes.ts'

// this function renders a single recipe to the browser
export default function RecipePage() {
  const { id } = useParams()
  if (!id) {
    return <p>No recipe id in the URL.</p>
  }
  return <RecipeView id={id}/>
}

function RecipeView({ id }: {id: string}) {
  const recipe = useQuery({
    queryKey: ['recipe', id],
    queryFn: ({signal}) => getRecipe(id, signal),
  })
  if (recipe.isPending) {
    return <p>Loading...</p>
  }
  if (recipe.isError) {
    if (recipe.error instanceof RecipeNotFoundError) {
      return (
        <>
          <h1>Recipe not found</h1>
          <Link to="/recipes">Back to recipes</Link>
        </>
      )
    }
    return (
      <>
        <p role="alert">{recipe.error.message}</p>
        <button type="button" onClick={() => void recipe.refetch()}>Try again</button>
      </>
    )
  }

  const r = recipe.data
  const facts = [
    r.servings !== null ? `Serves ${r.servings}` : null,
    r.prep_minutes !== null ? `Prep ${r.prep_minutes} min` : null,
    r.cook_minutes !== null ? `Cook ${r.cook_minutes} min` : null,
  ].filter((fact) => fact !== null)

  return (
    <>
      <Link to="/recipes">All recipes</Link>
      <h1>
        {r.title}
        {r.is_favorite && <span aria-label="Favorite"> ★</span>}
      </h1>
      {r.description && <p>{r.description}</p>}
      {facts.length > 0 && <p>{facts.join(' · ')}</p>}
      {r.ingredients.length > 0 && (
        <>
          <h2>Ingredients</h2>
          <ul>
            {r.ingredients.map((ingredient) => (
              <li key={ingredient.id}>{ingredient.raw_text}</li>
            ))}
          </ul>
        </>
      )}
      {r.steps.length > 0 && (
        <>
          <h2>Steps</h2>
          <ol>
            {r.steps.map((step) => (
              <li key={step.id}>{step.instruction}</li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}
