import { cn } from '@/lib/utils'
import { getHealth } from '../lib/api/health.ts'
import { getSession } from '../lib/auth/dal.ts'

// Splitting out try/catch business logic from rendering JSX
async function readHealth() {
  try {
    const health = await getHealth()
    return { state: 'success', text: `${health.status} (${health.version})` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { state: 'error', text: `Unreachable (${message})` }
  }
}

// An async Server Component: it runs on the server, waits for the API, and sends
// back finished HTML. There are no hooks and no loading state to manage here,
// because the component simply awaits its data.
export default async function ApiStatus() {
  // This calls the API, so it only runs for someone signed in.
  if (!(await getSession())) return null

  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'
  const { state, text } = await readHealth()
  const ok = state === 'success'
  // A dot and a line of small print. The dot's colour is not the only signal: the text says
  // "ok" or "unreachable" too.
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', ok ? 'bg-success' : 'bg-destructive')}
      />
      <span className="min-w-0 truncate">
        API {text} · web {version}
      </span>
    </p>
  )
}
