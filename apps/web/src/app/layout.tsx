import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import '../index.css'

export const metadata: Metadata = {
  title: 'Scullery',
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

// The frame around every page: a header, the current page, and a tab bar along
// the bottom (within thumb reach on an iPad). Week and Shopping tabs will join
// Recipes when those features exist.
//
// This is a Server Component: it runs on the server and ships no JavaScript of
// its own. `children` is the slot where Next renders whichever page matches the
// URL, so pages never repeat the header or the tabs.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="shell-header">
            <strong>Scullery</strong>
          </header>

          <main className="app">{children}</main>

          <nav className="tabbar" aria-label="Main">
            <Link href="/recipes">Recipes</Link>
          </nav>
        </div>
      </body>
    </html>
  )
}
