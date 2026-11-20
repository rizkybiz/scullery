import { NextResponse, type NextRequest } from 'next/server'
import { authSecret, sessionCookie } from './lib/auth/cookie.ts'
import { verifySession } from './lib/auth/session.ts'

// The first gate: anyone without a valid session cookie is sent to /login before anything
// renders, as a real HTTP redirect.
//
// This is NOT the security boundary. It only reads the cookie (no database, nothing slow:
// it runs on every request, prefetches included), and Next's own guidance is that
// authorization must be checked again where the data is: requireSession() in every Server
// Action and every component that reads data. This just makes the common case fast and tidy.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // The sign-in page, and the sign-in action that posts to it, must be reachable.
  if (pathname === '/login') return NextResponse.next()

  const token = request.cookies.get(sessionCookie().name)?.value
  // authSecret() throws if AUTH_SECRET is missing, which fails the request with a 500:
  // closed and loud, never open.
  if (token && (await verifySession(token, authSecret()))) return NextResponse.next()

  const login = new URL('/login', request.url)
  login.searchParams.set('next', pathname + search)
  return NextResponse.redirect(login)
}

// Everything except Next's own static files and the favicon.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
}
