// Turns a password into the hash that goes in AUTH_USER_ADMIN_HASH or AUTH_USER_REVIEWER_HASH.
// The password is read from standard input, so it never appears in the command line, in
// shell history or in a file, and only the hash is printed.
//
//   read -rs PW && printf '%s' "$PW" | node scripts/hash-password.ts
//
// To invent a strong password first:  openssl rand -base64 18
import { hashPassword } from '../src/lib/auth/password.ts'

const MIN_LENGTH = 12

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
const password = Buffer.concat(chunks)
  .toString('utf8')
  .replace(/\r?\n$/, '')

if (password.length < MIN_LENGTH) {
  console.error(`The password must be at least ${MIN_LENGTH} characters (got ${password.length}).`)
  process.exit(1)
}

console.log(await hashPassword(password))
