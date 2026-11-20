import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import RecipeActions from '../../../../components/RecipeActions.tsx'
import { getRecipe, type Recipe } from '../../../../lib/api/recipes.ts'

type RecipeResult =
  { state: 'success'; recipe: Recipe | null } | { state: 'error'; message: string }

// Fetches the recipe, keeping try/catch away from the JSX and, more importantly, away
// from notFound(): that works by throwing, so a catch here would swallow it. `null`
// means there is no such recipe. The visitor sees fixed wording on failure, and the
// real error goes to the server log.
async function readRecipe(id: string): Promise<RecipeResult> {
  try {
    const recipe = await getRecipe(id)
    return { state: 'success', recipe }
  } catch (error) {
    console.error('Could not load recipe', error)
    return { state: 'error', message: 'Could not load recipe.' }
  }
}

// Same pattern as the list: the page is synchronous and passes the params promise
// down, so everything that depends on the id streams in behind <Suspense>.
export default function RecipePage(props: PageProps<'/recipes/[id]'>) {
  return (
    <>
      <Link href="/recipes">All recipes</Link>
      <Suspense fallback={<p>Loading…</p>}>
        <RecipeView params={props.params} />
      </Suspense>
    </>
  )
}

async function RecipeView({ params }: { params: PageProps<'/recipes/[id]'>['params'] }) {
  const { id } = await params

  const result = await readRecipe(id)

  // Fetching failed. This is not the same as "no such recipe": the visitor sees fixed
  // wording (the real error is in the server log) and a link to try the same URL again.
  if (result.state === 'error') {
    return (
      <p role="alert">
        {result.message} <Link href={`/recipes/${id}`}>Try again</Link>
      </p>
    )
  }

  // No such recipe. notFound() throws a special error that Next catches higher up, which
  // is why it is called here and never inside readRecipe's try/catch. It returns
  // `never`, so after this line TypeScript knows `recipe` is not null.
  const recipe = result.recipe
  if (recipe === null) {
    notFound()
  }

  // Only the parts a recipe actually has: a missing servings or prep time is left out
  // of the facts line instead of showing "null".
  const facts = [
    recipe.servings !== null ? `Serves ${recipe.servings}` : null,
    recipe.prep_minutes !== null ? `Prep ${recipe.prep_minutes} min` : null,
    recipe.cook_minutes !== null ? `Cook ${recipe.cook_minutes} min` : null,
  ].filter((fact) => fact !== null)

  return (
    <>
      <div className="recipe-header">
        <h1>
          {recipe.title}
          {recipe.is_favorite && (
            <span role="img" aria-label="Favorite">
              {' '}
              ★
            </span>
          )}
        </h1>
        <RecipeActions id={recipe.id} />
      </div>

      {recipe.description && <p>{recipe.description}</p>}
      {facts.length > 0 && <p>{facts.join(' · ')}</p>}

      {recipe.ingredients.length > 0 && (
        <>
          <h2>Ingredients</h2>
          <ul>
            {/* `key` tells React which row is which across renders. Use the id. */}
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id}>{ingredient.raw_text}</li>
            ))}
          </ul>
        </>
      )}

      {recipe.steps.length > 0 && (
        <>
          <h2>Steps</h2>
          <ol>
            {recipe.steps.map((step) => (
              <li key={step.id}>{step.instruction}</li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}
