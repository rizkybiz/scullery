import 'server-only'

// One structured line per thing worth knowing about: who signed in, who failed to, who
// created or deleted what. It goes to the server log (Vercel's, when deployed), is easy to
// search, and never contains a password or a token.
export function audit(event: string, fields: Record<string, string | number | boolean> = {}): void {
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}
