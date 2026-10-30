import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { listRecipes, type RecipeSummary } from '../api/recipes.ts'

const PAGE_SIZE = 20

export default function RecipesPage() {
  // The view's state lives in the address bar (?q=soup&favorite=true&page=2), not
  // in useState. That makes Back, reload, bookmarks and shared links all restore
  // exactly what you were looking at. Everything below is derived from the URL on
  // each render, so it cannot get out of step with it.
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const favoritesOnly = params.get('favorite') === 'true'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const offset = (page - 1) * PAGE_SIZE

  // The query key identifies the data: each distinct key is cached separately, so
  // revisiting a page you already loaded is instant. Anything the request depends
  // on belongs in the key. `keepPreviousData` shows the old rows until the new
  // ones arrive, so the list does not blink empty on every keystroke.
  const recipes = useQuery({
    queryKey: ['recipes', { q, favoritesOnly, offset }],
    queryFn: ({ signal }) => listRecipes({ q, favoritesOnly, limit: PAGE_SIZE, offset }, signal),
    placeholderData: keepPreviousData,
  })

  // Changing the search or filter replaces the history entry (so typing does not
  // fill the Back button) and returns to page 1 (page 3 of the old results may
  // not exist in the new ones).
  function setFilter(name: 'q' | 'favorite', value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(name, value)
        else next.delete(name)
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  // Moving between pages is a real navigation, so Back returns to the last page.
  function goToPage(target: number) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (target > 1) next.set('page', String(target))
      else next.delete('page')
      return next
    })
  }

  const filtering = q !== '' || favoritesOnly

  return (
    <>
      <div className="recipe-header">
        <h1>Recipes</h1>
        <Link to="/recipes/new" className="button" aria-label="New recipe">
          +
        </Link>
      </div>

      <div className="filters">
        <input
          type="search"
          aria-label="Search recipes"
          placeholder="Search titles and descriptions"
          value={q}
          onChange={(event) => setFilter('q', event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(event) => setFilter('favorite', event.target.checked ? 'true' : '')}
          />{' '}
          Favorites only
        </label>
      </div>

      {recipes.isPending && <p>Loading…</p>}

      {recipes.isError && (
        <p role="alert">
          {recipes.error.message}{' '}
          <button type="button" onClick={() => void recipes.refetch()}>
            Try again
          </button>
        </p>
      )}

      {recipes.isSuccess && (
        <>
          {recipes.data.total === 0 && <p>{filtering ? 'No recipes match.' : 'No recipes yet.'}</p>}

          {recipes.data.total > 0 && recipes.data.recipes.length === 0 && (
            <p>
              That page is past the end.{' '}
              <button type="button" onClick={() => goToPage(1)}>
                Back to page 1
              </button>
            </p>
          )}

          {recipes.data.recipes.length > 0 && (
            // aria-busy marks the list as "being replaced" while the next page loads.
            <ul className="recipe-list" aria-busy={recipes.isPlaceholderData}>
              {/* `key` tells React which row is which across renders, so it can
                  reuse the DOM for unchanged rows. Use a stable id, never the index. */}
              {recipes.data.recipes.map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} />
              ))}
            </ul>
          )}

          {recipes.data.total > PAGE_SIZE && (
            <nav className="pager" aria-label="Pages">
              <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </button>
              <span>
                {offset + 1}–{offset + recipes.data.recipes.length} of {recipes.data.total}
              </span>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= recipes.data.total}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
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
      <Link to={`/recipes/${recipe.id}`}>
        <span className="recipe-title">
          {recipe.title}
          {recipe.is_favorite && <span aria-label="Favorite"> ★</span>}
        </span>
        {recipe.description && <span className="recipe-description">{recipe.description}</span>}
        {facts.length > 0 && <span className="recipe-facts">{facts.join(' · ')}</span>}
      </Link>
    </li>
  )
}
