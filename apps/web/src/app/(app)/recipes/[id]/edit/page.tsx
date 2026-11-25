import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import BackLink from '@/components/BackLink.tsx'
import RecipeForm from '@/components/RecipeForm.tsx'
import { fromRecipe } from '@/forms/fromRecipe.ts'
import { readRecipe, type Recipe } from '@/lib/api/recipes.ts'
import { listUnits, type Unit } from '@/lib/api/units.ts'
import { requireSession } from '@/lib/auth/dal.ts'
import { updateRecipeAction } from '@/app/(app)/recipes/actions.ts'

// The edit page: the recipe form, filled in with the saved recipe. Same shape as the other
// pages: a static shell, and everything that needs the id or the API streams in behind <Suspense>.
export default function EditRecipePage(props: PageProps<'/recipes/[id]/edit'>) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <EditRecipe params={props.params} />
    </Suspense>
  )
}

// As on the new-recipe page: without units the form still works, with only "No unit".
async function readUnits(): Promise<Unit[]> {
  try {
    return await listUnits()
  } catch (error) {
    console.error('Could not load units', error)
    return []
  }
}

type Loaded = { state: 'success'; recipe: Recipe | null } | { state: 'error' }

// The recipe as it is now, not the cached copy: an edit should start from the latest version.
// try/catch stays here, away from notFound(), which works by throwing.
async function load(id: string): Promise<Loaded> {
  try {
    return { state: 'success', recipe: await readRecipe(id) }
  } catch (error) {
    console.error('Could not load recipe for editing', error)
    return { state: 'error' }
  }
}

async function EditRecipe({ params }: { params: PageProps<'/recipes/[id]/edit'>['params'] }) {
  // connection(): request-time work (the form's row keys are random ids made here).
  await connection()
  await requireSession() // before any data: the proxy is a first gate, not the boundary
  const { id } = await params

  const [result, units] = await Promise.all([load(id), readUnits()])
  if (result.state === 'error') {
    return (
      <p role="alert">
        Could not load the recipe. <Link href={`/recipes/${id}/edit`}>Try again</Link>
      </p>
    )
  }
  const recipe = result.recipe
  if (recipe === null) notFound()

  return (
    <>
      <BackLink href={`/recipes/${id}`}>Back to the recipe</BackLink>
      <h1 className="mb-6">
        <span className="block font-sans text-sm font-medium tracking-wider text-muted-foreground uppercase">
          Editing
        </span>
        {recipe.title}
      </h1>
      <RecipeForm
        units={units}
        action={updateRecipeAction.bind(null, id)}
        initial={fromRecipe(recipe)}
        submitLabel="Save changes"
        cancelHref={`/recipes/${id}`}
      />
    </>
  )
}
