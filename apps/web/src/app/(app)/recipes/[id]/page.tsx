import { Clock, ExternalLink, Flame, Package, Star, Timer, Users } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Fragment, Suspense } from 'react'
import BackLink from '@/components/BackLink.tsx'
import RecipeActions from '@/components/RecipeActions.tsx'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getRecipe, type Recipe } from '@/lib/api/recipes.ts'
import { requireSession } from '@/lib/auth/dal.ts'
import { formatTimer, groupBySection, ingredientLine, webAddress } from '@/lib/recipeDisplay.ts'

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
      <BackLink href="/recipes">All recipes</BackLink>
      <Suspense fallback={<p>Loading…</p>}>
        <RecipeView params={props.params} />
      </Suspense>
    </>
  )
}

async function RecipeView({ params }: { params: PageProps<'/recipes/[id]'>['params'] }) {
  await requireSession() // before any data: the proxy is a first gate, not the boundary
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

  // Only the parts a recipe actually has: a missing servings or prep time is left out instead
  // of showing "null". Each is a chip with an icon; the words carry the meaning on their own.
  const facts = [
    recipe.servings !== null && { icon: Users, text: `Serves ${recipe.servings}` },
    recipe.prep_minutes !== null && { icon: Clock, text: `Prep ${recipe.prep_minutes} min` },
    recipe.cook_minutes !== null && { icon: Flame, text: `Cook ${recipe.cook_minutes} min` },
    recipe.yield_text !== null && { icon: Package, text: `Makes ${recipe.yield_text}` },
  ].filter((fact) => fact !== false)
  const source = webAddress(recipe.source_url)

  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start gap-2">
          <h1 className="min-w-0 flex-1">
            {recipe.title}
            {recipe.is_favorite && (
              <Star
                role="img"
                aria-label="Favorite"
                className="ml-2 inline size-6 fill-primary align-[-0.1em] text-primary"
              />
            )}
          </h1>
          <RecipeActions id={recipe.id} />
        </div>
        {recipe.description && (
          <p className="text-lg text-muted-foreground">{recipe.description}</p>
        )}
        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="At a glance">
            {facts.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 text-sm font-normal">
                  <Icon aria-hidden="true" className="size-4" />
                  {text}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {source && (
          <p className="text-sm text-muted-foreground">
            From{' '}
            <a href={source} rel="noopener noreferrer">
              {new URL(source).hostname}
              <ExternalLink aria-hidden="true" className="ml-1 inline size-3.5 align-[-0.1em]" />
            </a>
          </p>
        )}
      </header>

      {recipe.ingredients.length > 0 && (
        <section aria-labelledby="ingredients" className="space-y-3">
          <h2 id="ingredients">Ingredients</h2>
          <Card className="gap-0 py-2">
            {/* Consecutive lines under the same heading form one list. `key` tells React which
                row is which across renders: use the id, never the index. */}
            {groupBySection(recipe.ingredients).map((group) => (
              <Fragment key={group.items[0]!.id}>
                {group.section && <h3 className={SECTION}>{group.section}</h3>}
                <ul className="divide-y">
                  {group.items.map((ingredient) => {
                    const line = ingredientLine(ingredient)
                    return (
                      <li key={ingredient.id} className="flex gap-3 px-4 py-2.5">
                        {/* The amount in its own column, so the names line up. */}
                        <span className="w-24 shrink-0 font-medium tabular-nums">
                          {line.amount}
                        </span>
                        <span>
                          {line.text}
                          {line.extras.length > 0 && (
                            <span className="text-muted-foreground">
                              {' '}
                              ({line.extras.join(', ')})
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Fragment>
            ))}
          </Card>
        </section>
      )}

      {recipe.steps.length > 0 && (
        <section aria-labelledby="steps" className="space-y-3">
          <h2 id="steps">Steps</h2>
          {/* One numbered list per section; `start` keeps the numbering running across them. */}
          {groupBySection(recipe.steps).map((group) => (
            <Fragment key={group.items[0]!.id}>
              {group.section && <h3 className={cn(SECTION, 'px-0')}>{group.section}</h3>}
              <ol start={group.start} className="space-y-4">
                {group.items.map((step, index) => (
                  <li key={step.id} className="flex gap-4">
                    {/* The number is real text, not aria-hidden: without list markers (the reset
                        removes them) some screen readers would not announce the step number. */}
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-display font-semibold text-primary-foreground">
                      {group.start + index}
                    </span>
                    <div className="space-y-2 pt-1">
                      <p>{step.instruction}</p>
                      {step.timer_seconds !== null && (
                        <Badge variant="outline" className="gap-1.5 font-normal">
                          <Timer aria-hidden="true" className="size-3.5" />
                          <span className="sr-only">Timer: </span>
                          {formatTimer(step.timer_seconds)}
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Fragment>
          ))}
        </section>
      )}

      {recipe.notes && (
        <section aria-labelledby="notes" className="space-y-3">
          <h2 id="notes">Notes</h2>
          <p className="rounded-lg border-l-4 border-primary/60 bg-muted px-4 py-3 whitespace-pre-line">
            {recipe.notes}
          </p>
        </section>
      )}
    </article>
  )
}

// A section heading inside the ingredients or steps ("To finish", "For the dough").
const SECTION =
  'px-4 pt-3 pb-1 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase'
