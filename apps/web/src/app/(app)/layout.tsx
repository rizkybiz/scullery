import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import ApiStatus from '../../components/ApiStatus.tsx'

// The frame around every signed-in page: a header, the current page, and a tab bar along
// the bottom (within thumb reach on an iPad). Week and Shopping tabs will join Recipes when
// those features exist.
//
// This is a Server Component: it runs on the server and ships no JavaScript of its own.
// `children` is the slot where Next renders whichever page matches the URL. The API status
// depends on the request, so it sits in its own <Suspense> and the frame itself stays part of
// the static shell.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="shell-header">
        <strong>Scullery</strong>
        <Suspense fallback={<p className="status">API: checking...</p>}>
          <ApiStatus />
        </Suspense>
      </header>

      <main className="app">{children}</main>

      <nav className="tabbar" aria-label="Main">
        <Link href="/recipes">Recipes</Link>
      </nav>
    </div>
  )
}
