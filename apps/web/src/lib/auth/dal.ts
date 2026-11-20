import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { authSecret, sessionCookie } from './cookie.ts'
import { verifySession, type Session } from './session.ts'

// The data access layer for sign-in: the one place server code asks "who is this?".
//
// The proxy also checks the cookie, but only as a quick first gate. It is not a security
// boundary: a Server Action can be called directly, so every action and every component that
// touches data asks here, itself. Nothing in this file trusts anything but the signed cookie.

// getSession reads and verifies the cookie. `cache` makes it run once per request however
// many components ask. It reads request data, so callers sit inside <Suspense>.
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(sessionCookie().name)?.value
  return token ? verifySession(token, authSecret()) : null
})

// requireSession is for code that must not run without someone signed in. redirect()
// works by throwing, so a caller never continues without a session, and it must not be
// called inside a try/catch.
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}
