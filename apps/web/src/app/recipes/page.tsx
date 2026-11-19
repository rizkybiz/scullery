import Form from 'next/form'
import Link from 'next/link'
import { Suspense } from 'react'
import {
  listRecipes,
  type ListQuery,
  type RecipeList,
  type RecipeSummary,
} from '../../lib/api/recipes.ts'

const PAGE_SIZE = 20

type RecipesResult = { state: 'success'; list: RecipeList } | { state: 'error'; message: string }

// Fetches the list. try/catch lives here, away from the JSX, because it can only
// catch the fetch failing (not rendering errors). The declared return type is what
// lets TypeScript narrow: after checking `state`, it knows which of `list` or
// `message` exists.
//
// The visitor sees fixed wording, and the real error goes to the server log. The
// error's own message is not usable here: listRecipes is cached, and in a
// production build Next replaces errors that cross that boundary with a generic
// text. A fixed message also keeps internal details away from the page.
async function readRecipes(query: ListQuery): Promise<RecipesResult> {
  try {
    const list = await listRecipes(query)
    return { state: 'success', list }
  } catch (error) {
    console.error('Could not load recipes', error)
    return { state: 'error', message: 'Could not load recipes.' }
  }
}

// The view's state lives in the address bar (?q=soup&favorite=true&page=2), so Back,
// reload, bookmarks and shared links restore exactly what you were looking at.
type View = { q: string; favoritesOnly: boolean; page: number }

// hrefFor builds the URL for a view. Empty values are left out, and page 1 has no
// page parameter. URLSearchParams does the escaping, so "mac & cheese" is safe.
function hrefFor({ q, favoritesOnly, page }: View): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (favoritesOnly) params.set('favorite', 'true')
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/recipes?${query}` : '/recipes'
}

// The page itself is synchronous. It does NOT await searchParams: it hands the
// promise down, so the heading can sit in the static shell while everything that
// depends on the URL streams in behind the Suspense boundary.
export default function RecipesPage(props: PageProps<'/recipes'>) {
  return (
    <>
      <div className="recipe-header">
        <h1>Recipes</h1>
      </div>
      <Suspense fallback={<p>Loading…</p>}>
        <RecipeListSection searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}

// A query value can be missing, a string, or an array (?q=a&q=b). Take the first.
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function RecipeListSection({
  searchParams,
}: {
  searchParams: PageProps<'/recipes'>['searchParams']
}) {
  const params = await searchParams // this await is what makes the section dynamic
  const q = first(params.q) ?? ''
  const favoritesOnly = first(params.favorite) === 'true'
  const page = Math.max(1, Number(first(params.page)) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const result = await readRecipes({ q, favoritesOnly, limit: PAGE_SIZE, offset })

  return (
    <>
      <Form action="/recipes" className="filters">
        <input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Search recipes"
          placeholder="Search titles and descriptions"
        />
        <label>
          <input type="checkbox" name="favorite" value="true" defaultChecked={favoritesOnly} />{' '}
          Favorites only
        </label>
        <button type="submit">Search</button>
      </Form>

      <Results result={result} view={{ q, favoritesOnly, page }} />
    </>
  )
}

// Results decides what to show below the filters. Each state is an early return, so
// the order below reads as a checklist: error, nothing found, past the end, then the
// list with its pager.
function Results({ result, view }: { result: RecipesResult; view: View }) {
  if (result.state === 'error') {
    return (
      <p role="alert">
        {result.message} <Link href={hrefFor(view)}>Try again</Link>
      </p>
    )
  }

  // `offset` comes back from the API, so the range shown always matches the rows.
  const { recipes: rows, total, offset } = result.list
  const filtering = view.q !== '' || view.favoritesOnly

  if (total === 0) {
    return <p>{filtering ? 'No recipes match.' : 'No recipes yet.'}</p>
  }

  if (rows.length === 0) {
    return (
      <p>
        That page is past the end. <Link href={hrefFor({ ...view, page: 1 })}>Back to page 1</Link>
      </p>
    )
  }

  const hasPrevious = view.page > 1
  const hasNext = offset + PAGE_SIZE < total

  return (
    <>
      <ul className="recipe-list">
        {/* `key` tells React which row is which across renders. Use a stable id,
            never the array index. */}
        {rows.map((recipe) => (
          <RecipeRow key={recipe.id} recipe={recipe} />
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <nav className="pager" aria-label="Pages">
          {hasPrevious ? (
            <Link className="pager-link" href={hrefFor({ ...view, page: view.page - 1 })}>
              Previous
            </Link>
          ) : (
            <span className="pager-link" aria-disabled="true">
              Previous
            </span>
          )}
          <span>
            {offset + 1}–{offset + rows.length} of {total}
          </span>
          {hasNext ? (
            <Link className="pager-link" href={hrefFor({ ...view, page: view.page + 1 })}>
              Next
            </Link>
          ) : (
            <span className="pager-link" aria-disabled="true">
              Next
            </span>
          )}
        </nav>
      )}
    </>
  )
}

function RecipeRow({ recipe }: { recipe: RecipeSummary }) {
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0)
  const facts = [
    recipe.servings != null ? `Serves ${recipe.servings}` : null,
    minutes > 0 ? `${minutes} min` : null,
  ].filter((fact) => fact !== null)

  return (
    <li>
      <Link href={`/recipes/${recipe.id}`}>
        <span className="recipe-title">
          {recipe.title}
          {recipe.is_favorite && (
            <span role="img" aria-label="Favorite">
              {' '}
              ★
            </span>
          )}
        </span>
        {recipe.description && <span className="recipe-description">{recipe.description}</span>}
        {facts.length > 0 && <span className="recipe-facts">{facts.join(' · ')}</span>}
      </Link>
    </li>
  )
}
