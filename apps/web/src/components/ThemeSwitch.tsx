'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'

// Always true in the browser and false on the server, without an effect: React's documented
// way to render something only once the page is hydrated.
const noop = () => () => {}
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )

// The light/dark switch in the header: a pill with a knob. The word on it is the mode it
// switches TO, so a light page shows "Dark" and a dark page shows "Light". It is a button, not
// a role="switch": its visible word changes with the state, and a switch's name should not. Its
// accessible name ("Switch to dark mode") contains the visible word, as WCAG 2.5.3 asks.
//
// The theme is only known in the browser (it lives in localStorage, or comes from the device),
// so until hydration an empty pill of the same size holds the place: nothing jumps.
export default function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  const hydrated = useHydrated()
  const dark = resolvedTheme === 'dark'
  const target = dark ? 'light' : 'dark'

  const pill = 'relative block h-8 w-[5.5rem] rounded-full border bg-muted'
  if (!hydrated) {
    return (
      <span className="inline-flex h-11 items-center" aria-hidden="true">
        <span className={pill} />
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(target)}
      aria-label={`Switch to ${target} mode`}
      className="group inline-flex h-11 items-center rounded-full"
    >
      <span className={cn(pill, 'transition-colors group-hover:border-ring')}>
        {/* The knob: left with a sun on a light page, right with a moon on a dark one. */}
        <span
          className={cn(
            'absolute top-[3px] left-0.5 flex size-6 items-center justify-center rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none',
            dark && 'translate-x-[3.625rem]',
          )}
        >
          {dark ? (
            <Moon aria-hidden="true" className="size-3.5" />
          ) : (
            <Sun aria-hidden="true" className="size-3.5" />
          )}
        </span>
        {/* The word, on the side the knob is not. */}
        <span
          className={cn(
            'absolute inset-y-0 flex items-center text-xs font-medium text-muted-foreground capitalize',
            dark ? 'left-2.5' : 'right-2.5',
          )}
        >
          {target}
        </span>
      </span>
    </button>
  )
}
