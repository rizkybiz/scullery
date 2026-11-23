'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  href: string
  prefix: string
  exclude?: string
  children: ReactNode
}

// One tab in the bottom tab bar. It marks itself as the current page (aria-current, which the
// style keys off too) when the path is `prefix` or under it, except `exclude`. Props are plain
// strings: the server layout cannot hand a function to a Client Component.
//
// Reading the path (usePathname) is request-time data, so with Cache Components it must sit
// inside <Suspense>: the static shell gets the tab with no marker, and the marker streams in.
export default function TabLink(props: Props) {
  return (
    <Suspense
      fallback={
        <Tab href={props.href} current={false}>
          {props.children}
        </Tab>
      }
    >
      <CurrentTab {...props} />
    </Suspense>
  )
}

function CurrentTab({ href, prefix, exclude, children }: Props) {
  const pathname = usePathname()
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  const current = under(prefix) && !(exclude && under(exclude))
  return (
    <Tab href={href} current={current}>
      {children}
    </Tab>
  )
}

function Tab({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 border-t-2 border-transparent text-xs font-medium text-muted-foreground no-underline hover:text-foreground hover:no-underline',
        current && 'border-primary text-primary hover:text-primary',
      )}
    >
      {children}
    </Link>
  )
}
