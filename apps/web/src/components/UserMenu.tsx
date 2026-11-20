import { logoutAction } from '../app/login/actions.ts'
import { getSession } from '../lib/auth/dal.ts'

// Who is signed in, and a way to sign out. A Server Component: the Sign out button is a
// plain form wired to a Server Action, so it needs no client JavaScript. Renders nothing
// when nobody is signed in.
export default async function UserMenu() {
  const session = await getSession()
  if (!session) return null

  return (
    <form action={logoutAction} className="user-menu">
      <span>{session.name}</span>
      <button type="submit">Sign out</button>
    </form>
  )
}
