import { ChevronLeft, ChevronRight, Clock, Plus, Search, Star, Users } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  listRecipes,
  type ListQuery,
  type RecipeList,
  type RecipeSummary,
} from '@/lib/api/recipes.ts'
import { requireSession } from '@/lib/auth/dal.ts'

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
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1>Recipes</h1>
        <Button asChild>
          <Link
            href="/recipes/new"
            className="text-primary-foreground no-underline hover:no-underline"
          >
            <Plus aria-hidden="true" />
            New recipe
          </Link>
        </Button>
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
  await requireSession() // before any data: the proxy is a first gate, not the boundary
  const params = await searchParams // this await is what makes the section dynamic
  const q = first(params.q) ?? ''
  const favoritesOnly = first(params.favorite) === 'true'
  const page = Math.max(1, Number(first(params.page)) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const result = await readRecipes({ q, favoritesOnly, limit: PAGE_SIZE, offset })

  return (
    <>
      <Form action="/recipes" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="relative min-w-0 flex-[1_1_14rem]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Search recipes"
            placeholder="Search titles and descriptions"
            className="pl-9"
          />
        </div>
        <Label className="min-h-11 cursor-pointer font-normal">
          <Checkbox name="favorite" value="true" defaultChecked={favoritesOnly} />
          Favorites only
        </Label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
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
      <Notice>
        <p role="alert">
          {result.message} <Link href={hrefFor(view)}>Try again</Link>
        </p>
      </Notice>
    )
  }

  // `offset` comes back from the API, so the range shown always matches the rows.
  const { recipes: rows, total, offset } = result.list
  const filtering = view.q !== '' || view.favoritesOnly

  if (total === 0) {
    return (
      <Notice>
        {filtering ? (
          <p>
            No recipes match. <Link href="/recipes">Show all recipes</Link>
          </p>
        ) : (
          <p>
            No recipes yet. <Link href="/recipes/new">Add the first one</Link>, typed in or imported
            from a link.
          </p>
        )}
      </Notice>
    )
  }

  if (rows.length === 0) {
    return (
      <Notice>
        <p>
          That page is past the end.{' '}
          <Link href={hrefFor({ ...view, page: 1 })}>Back to page 1</Link>
        </p>
      </Notice>
    )
  }

  const hasPrevious = view.page > 1
  const hasNext = offset + PAGE_SIZE < total

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <ul className="divide-y">
          {/* `key` tells React which row is which across renders. Use a stable id,
              never the array index. */}
          {rows.map((recipe) => (
            <RecipeRow key={recipe.id} recipe={recipe} />
          ))}
        </ul>
      </Card>

      {total > PAGE_SIZE && (
        <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Pages">
          <PagerLink href={hasPrevious ? hrefFor({ ...view, page: view.page - 1 }) : null}>
            <ChevronLeft aria-hidden="true" />
            Previous
          </PagerLink>
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{offset + rows.length} of {total}
          </span>
          <PagerLink href={hasNext ? hrefFor({ ...view, page: view.page + 1 }) : null}>
            Next
            <ChevronRight aria-hidden="true" />
          </PagerLink>
        </nav>
      )}
    </>
  )
}

// Previous or Next: a link when there is somewhere to go, a dimmed stand-in when there is not.
function PagerLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (href === null) {
    return (
      <Button variant="ghost" disabled aria-disabled="true">
        {children}
      </Button>
    )
  }
  return (
    <Button variant="ghost" asChild>
      <Link href={href} className="text-foreground no-underline hover:no-underline">
        {children}
      </Link>
    </Button>
  )
}

// A message in place of the list: an error, nothing found, or past the end.
function Notice({ children }: { children: ReactNode }) {
  return (
    <Card className="items-center px-6 py-10 text-center text-muted-foreground">{children}</Card>
  )
}

function RecipeRow({ recipe }: { recipe: RecipeSummary }) {
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0)
  return (
    <li>
      <Link
        href={`/recipes/${recipe.id}`}
        className="flex flex-col gap-1 px-4 py-3.5 text-foreground no-underline transition-colors hover:bg-accent/60 hover:no-underline"
      >
        <span className="flex items-start gap-2">
          <span className="font-display text-lg leading-snug font-semibold">{recipe.title}</span>
          {recipe.is_favorite && (
            <Star
              role="img"
              aria-label="Favorite"
              className="mt-1 size-4 shrink-0 fill-primary text-primary"
            />
          )}
        </span>
        {recipe.description && (
          <span className="line-clamp-2 text-sm text-muted-foreground">{recipe.description}</span>
        )}
        {(recipe.servings != null || minutes > 0) && (
          <span className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
            {recipe.servings != null && (
              <span className="inline-flex items-center gap-1.5">
                <Users aria-hidden="true" className="size-3.5" />
                Serves {recipe.servings}
              </span>
            )}
            {minutes > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Clock aria-hidden="true" className="size-3.5" />
                {minutes} min
              </span>
            )}
          </span>
        )}
      </Link>
    </li>
  )
}
