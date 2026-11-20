'use client'

import { useActionState } from 'react'
import { loginAction } from '../app/login/actions.ts'

// The sign-in form. A Client Component only for useActionState, which supplies the pending
// state and the error message the action returns. `next` rides along as a hidden field and
// is checked again on the server before it is followed.
export default function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, null)

  return (
    <form action={formAction} className="recipe-form login-form">
      <input type="hidden" name="next" value={next} />
      <label>
        Name
        <input name="name" autoComplete="username" autoCapitalize="none" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
