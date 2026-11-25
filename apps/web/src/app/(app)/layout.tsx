import { BookOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import ApiStatus from '@/components/ApiStatus.tsx'
import TabLink from '@/components/TabLink.tsx'
import ThemeSwitch from '@/components/ThemeSwitch.tsx'
import UserMenu from '@/components/UserMenu.tsx'

// The frame around every signed-in page: a header, the current page, and a tab bar along
// the bottom (within thumb reach on an iPad): Recipes and New. Week and Shopping tabs will join
// them when those features exist.
//
// This is a Server Component: it runs on the server and ships no JavaScript of its own.
// `children` is the slot where Next renders whichever page matches the URL. The two pieces
// that depend on the request (the API status, and who is signed in) each sit in their own
// <Suspense>, so the frame itself stays part of the static shell.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b bg-background px-4 py-1">
        <Link
          href="/recipes"
          className="inline-flex min-h-11 items-center font-display text-xl font-semibold text-foreground no-underline hover:no-underline"
        >
          Scullery
        </Link>
        <div className="ml-auto">
          <ThemeSwitch />
        </div>
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>

      {/* Out of the way, at the end of every page: which API and which web build is running. */}
      <footer className="mx-auto w-full max-w-2xl px-4 pb-4">
        <Suspense fallback={null}>
          <ApiStatus />
        </Suspense>
      </footer>

      {/* Sticky, not fixed: it sits at the end of the page and pins to the bottom edge while the
          page scrolls. --tabbar-height is also what the recipe form's Save bar sits above. */}
      <nav
        aria-label="Main"
        className="sticky bottom-0 z-10 flex h-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <TabLink href="/recipes" prefix="/recipes" exclude="/recipes/new">
          <BookOpen aria-hidden="true" className="size-5" />
          Recipes
        </TabLink>
        <TabLink href="/recipes/new" prefix="/recipes/new">
          <Plus aria-hidden="true" className="size-5" />
          New
        </TabLink>
      </nav>
    </div>
  )
}
