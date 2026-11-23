import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Shown when the recipe page calls notFound(): the id is well-formed or not, but
// there is no recipe behind it.
export default function RecipeNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1>Recipe not found</h1>
      <p className="text-muted-foreground">It may have been deleted, or the link is wrong.</p>
      <Button asChild variant="outline">
        <Link href="/recipes" className="text-foreground no-underline hover:no-underline">
          Back to recipes
        </Link>
      </Button>
    </div>
  )
}
