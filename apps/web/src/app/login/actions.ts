'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { audit } from '../../lib/audit.ts'
import { authSecret, sessionCookie } from '../../lib/auth/cookie.ts'
import { safeNext } from '../../lib/auth/redirect.ts'
import { signSession } from '../../lib/auth/session.ts'
import { checkLogin, loadUsers } from '../../lib/auth/users.ts'

// What the login form gets back when sign-in did not happen. On success the action
// redirects instead of returning, so `null` is only the initial state.
export type LoginState = { error: string } | null

// One message for every kind of failure. Saying "no such user" or "wrong password" would
// tell an attacker which names exist.
const INVALID = 'Invalid name or password.'

// loginAction checks the name and password and, if they match, sets the session cookie.
// Like every Server Action it is a public endpoint, so it checks the shape of its input.
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const name = formData.get('name')
  const password = formData.get('password')
  const next = formData.get('next')
  if (
    typeof name !== 'string' ||
    typeof password !== 'string' ||
    name.length === 0 ||
    name.length > 100 ||
    password.length === 0 ||
    password.length > 1000
  ) {
    return { error: INVALID }
  }

  const users = loadUsers(process.env)
  const user = await checkLogin(users, name, password)
  if (!user) {
    // Log whether the name was a real user, never the name itself: a mistyped password in
    // the name field must not end up in the logs.
    audit('login.failed', { knownUser: users.has(name.trim().toLowerCase() as never) })
    return { error: INVALID }
  }

  const cookie = sessionCookie()
  ;(await cookies()).set(cookie.name, await signSession(user, authSecret()), cookie.options)
  audit('login.succeeded', { user })

  // redirect() works by throwing, so it comes last and outside any try/catch.
  redirect(safeNext(typeof next === 'string' ? next : null))
}

// logoutAction ends the session. The token itself is not "cancelled" (it is stateless), but
// the browser forgets it; it expires on its own after eight hours either way.
export async function logoutAction(): Promise<void> {
  const cookie = sessionCookie()
  ;(await cookies()).delete({ name: cookie.name, path: cookie.options.path })
  audit('logout')
  redirect('/login')
}
