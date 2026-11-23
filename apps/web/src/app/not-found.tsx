import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Shown for any URL that matches no route, and when a page calls notFound() without
// a closer not-found file of its own.
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1>Page not found</h1>
      <p className="text-muted-foreground">There is nothing at this address.</p>
      <Button asChild variant="outline">
        <Link href="/recipes" className="text-foreground no-underline hover:no-underline">
          Back to recipes
        </Link>
      </Button>
    </div>
  )
}
