// The session is a signed token (HS256, via jose) held in an httpOnly cookie. It is
// stateless: nothing is stored on the server, so there is no session table to keep, and
// "revoke everyone" means changing AUTH_SECRET. Plain logic with no Next.js imports, so the
// same functions serve the proxy, the data access layer and the login action.
import { jwtVerify, SignJWT } from 'jose'

export const SESSION_SECONDS = 8 * 60 * 60 // eight hours

const MIN_SECRET_LENGTH = 32

function keyFrom(secret: string): Uint8Array {
  // A short secret can be guessed offline from a stolen token, so refuse one.
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`)
  }
  return new TextEncoder().encode(secret)
}

export type Session = { name: string }

export async function signSession(
  name: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(name)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + SESSION_SECONDS)
    .sign(keyFrom(secret))
}

// verifySession returns the session, or null for anything wrong with the token: a bad
// signature, expired, malformed, signed with another algorithm or another secret. It never
// throws on a bad token, so a caller cannot forget to handle it.
export async function verifySession(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: ['HS256'], // never accept "none" or an algorithm of the sender's choosing
      currentDate: now,
    })
    return typeof payload.sub === 'string' && payload.sub !== '' ? { name: payload.sub } : null
  } catch {
    return null
  }
}
