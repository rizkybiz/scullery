// The session cookie's name and settings, and where the signing secret comes from. One
// place, because the proxy, the login action and the data access layer must all agree.
// Plain logic: it takes the environment as an argument, so it can be tested.
import { SESSION_SECONDS } from './session.ts'

type Env = Record<string, string | undefined>

// On Vercel the site is served over HTTPS, so the cookie can be Secure and carry the
// "__Host-" prefix, which makes browsers refuse it unless it is Secure, set for this exact
// host, and sent for the whole site. Locally (plain http) neither applies. VERCEL is set by
// the platform, so a local `next start` still gets the local settings.
export function sessionCookie(env: Env = process.env) {
  const onVercel = Boolean(env['VERCEL'])
  return {
    name: onVercel ? '__Host-scullery-session' : 'scullery-session',
    options: {
      httpOnly: true, // JavaScript in the page cannot read it, so a script injected into a page cannot steal it
      secure: onVercel,
      sameSite: 'lax' as const, // not sent on cross-site POSTs (and Server Actions check the origin too)
      path: '/',
      maxAge: SESSION_SECONDS,
    },
  }
}

// The key the session tokens are signed with. A missing secret must stop everything
// loudly: carrying on would mean every request is unauthenticated, or worse, signed with
// nothing.
export function authSecret(env: Env = process.env): string {
  const secret = env['AUTH_SECRET']
  if (!secret) {
    throw new Error('AUTH_SECRET is not set. Sign-in cannot work without it (see .env.example).')
  }
  return secret
}
