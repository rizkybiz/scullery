import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

// The quiet "back" link at the top of a page ("All recipes", "Back to the recipe").
export default function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex min-h-11 items-center gap-0.5 text-sm text-muted-foreground no-underline hover:text-foreground hover:no-underline"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {children}
    </Link>
  )
}
