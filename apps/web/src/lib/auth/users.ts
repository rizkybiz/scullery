// The people who can sign in. There are exactly two, named in code and configured by
// environment variable, because this app has no sign-up and no user table:
//
//   admin     AUTH_USER_ADMIN_HASH
//   reviewer  AUTH_USER_REVIEWER_HASH   (unset it to revoke the reviewer)
//
// Each value is a password hash from hashPassword, never a password. Both users have the
// same permissions; having two is for revoking one without the other and for knowing who
// did what. Plain logic: nothing here knows about Next.js.
import { verifyAgainstDummy, verifyPassword } from './password.ts'

const USER_VARIABLES = {
  admin: 'AUTH_USER_ADMIN_HASH',
  reviewer: 'AUTH_USER_REVIEWER_HASH',
} as const

export type UserName = keyof typeof USER_VARIABLES

export function loadUsers(env: Record<string, string | undefined>): Map<UserName, string> {
  const users = new Map<UserName, string>()
  for (const name of Object.keys(USER_VARIABLES) as UserName[]) {
    const hash = env[USER_VARIABLES[name]]?.trim()
    if (hash) users.set(name, hash)
  }
  return users
}

// checkLogin returns the user's name when the name and password match, otherwise null.
// It does one scrypt either way, and the caller must not say WHICH part was wrong.
export async function checkLogin(
  users: Map<UserName, string>,
  name: string,
  password: string,
): Promise<UserName | null> {
  const key = name.trim().toLowerCase()
  const hash = users.get(key as UserName)
  if (hash === undefined) {
    await verifyAgainstDummy(password)
    return null
  }
  return (await verifyPassword(password, hash)) ? (key as UserName) : null
}
