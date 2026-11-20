// Password hashing with scrypt from Node's standard library: no dependency, and the
// parameters are stored inside each hash, so they can be raised later without
// invalidating the hashes already issued. Plain logic: nothing here knows about Next.js.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const KEY_BYTES = 32
// N is the CPU/memory cost (2^15 uses about 32 MB and takes roughly 100 ms), r the block
// size, p the parallelism. These are the defaults for NEW hashes only.
const COST = { N: 2 ** 15, r: 8, p: 1 }
const MAX_N = 2 ** 20 // refuse absurd costs in a stored hash instead of trying to compute them

function derive(
  password: string,
  salt: Buffer,
  keyBytes: number,
  { N, r, p }: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt's default memory cap (32 MB) is exactly what N=2^15, r=8 needs, so raise it.
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyBytes,
      { N, r, p, maxmem: 128 * N * r * 2 },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

// A stored hash looks like  scrypt:<N>:<r>:<p>:<salt>:<key>  (base64url, no `$`, so it
// can sit in an .env file without being treated as a variable).
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, KEY_BYTES, COST)
  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join(':')
}

// verifyPassword compares in constant time, so how long it takes reveals nothing about
// how much of the password was right. A malformed stored hash is simply "no match".
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  const salt = Buffer.from(parts[4]!, 'base64url')
  const expected = Buffer.from(parts[5]!, 'base64url')
  const valid =
    Number.isInteger(N) &&
    N >= 2 &&
    N <= MAX_N &&
    (N & (N - 1)) === 0 && // a power of two
    Number.isInteger(r) &&
    r >= 1 &&
    r <= 32 &&
    Number.isInteger(p) &&
    p >= 1 &&
    p <= 16 &&
    salt.length >= 8 &&
    expected.length >= 16
  if (!valid) return false

  const actual = await derive(password, salt, expected.length, { N, r, p })
  return timingSafeEqual(actual, expected)
}

// A real hash of a password nobody has, built once. Checking a login for a name that does
// not exist against this takes as long as checking a real one, so response time does not
// reveal which names exist.
let dummy: Promise<string> | undefined
export function verifyAgainstDummy(password: string): Promise<boolean> {
  dummy ??= hashPassword(randomBytes(16).toString('base64url'))
  return dummy.then((hash) => verifyPassword(password, hash))
}
