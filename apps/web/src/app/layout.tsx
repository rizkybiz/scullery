import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Fraunces } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { deploymentTag } from '../lib/deployment.ts'
import '../index.css'

// Every tab reads "Scullery", or "<page> · Scullery" once a page sets its own title. Outside
// production a tag follows, for example "Scullery [preview · a1b2c3d]" (see lib/deployment.ts).
const tag = deploymentTag()

// The headings' serif. next/font downloads it at build time and serves it from this app, so a
// visitor's browser never contacts Google. It is exposed as --font-fraunces (see index.css).
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })

export const metadata: Metadata = {
  title: { default: `Scullery${tag}`, template: `%s · Scullery${tag}` },
  // Files in public/. favicon.ico needs no tag: browsers ask for /favicon.ico on their own.
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
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
    // suppressHydrationWarning: next-themes sets the theme class on <html> before React loads
    // (so a dark page never flashes light), which React would otherwise report as a mismatch.
    // It applies to this element's attributes only.
    <html lang="en" className={fraunces.variable} suppressHydrationWarning>
      <body>
        {/* attribute="class": "dark" or "light" on <html>. Until a person chooses, the device
            setting decides; the choice is kept in localStorage. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
