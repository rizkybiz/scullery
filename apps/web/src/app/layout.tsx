import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import type { ReactNode } from 'react'
import { deploymentTag } from '../lib/deployment.ts'
import '../index.css'

// Every tab reads "Scullery", or "<page> · Scullery" once a page sets its own title. Outside
// production a tag follows, for example "Scullery [preview · PR #8]" (see lib/deployment.ts).
const tag = deploymentTag()

export const metadata: Metadata = {
  title: { default: `Scullery${tag}`, template: `%s · Scullery${tag}` },
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

// Only what every page shares. The frame around the signed-in pages (header, tab bar) lives
// in the (app) route group's layout, so the login page does not get it, and does not call
// the API for the status line either.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
