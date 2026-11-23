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

  // Public: the sign-in page (and the sign-in action that posts to it), and the overview at /
  // (static, no data).
  if (pathname === '/login' || pathname === '/') return NextResponse.next()

  const token = request.cookies.get(sessionCookie().name)?.value
  // authSecret() throws if AUTH_SECRET is missing, which fails the request with a 500:
  // closed and loud, never open.
  if (token && (await verifySession(token, authSecret()))) return NextResponse.next()

  const login = new URL('/login', request.url)
  login.searchParams.set('next', pathname + search)
  return NextResponse.redirect(login)
}

// Everything except Next's own static files, the icons and web manifest in public/ (the sign-in
// page shows them to visitors who are not signed in yet), and two platform prefixes:
// - /_vercel/ is served by the Vercel platform (Web Analytics' script and event endpoint).
//   Gating it redirected the analytics script to /login for anyone not yet signed in.
// - /.well-known/workflow/ is Workflow's internal queue delivery. A proxy that reads those
//   requests breaks execution (Workflow's Next.js guide). It is not exposed by skipping the
//   gate: on Vercel the route is a queue consumer, which Vercel documents as having no public
//   URL and being invocable only by its queue infrastructure.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_vercel/|\\.well-known/workflow/|favicon\\.ico$|favicon-\\d+x\\d+\\.png$|apple-touch-icon\\.png$|android-chrome-\\d+x\\d+\\.png$|site\\.webmanifest$).*)',
  ],
}
