// Where to send someone after they sign in. The destination comes from the URL
// (?next=/recipes/123), which anyone can write, so it is only followed if it is a path on
// THIS site. Otherwise a link like /login?next=https://evil.example would sign someone in
// and then send them to a lookalike page (an "open redirect"). Plain logic.
const DEFAULT_DESTINATION = '/recipes'
const MAX_LENGTH = 500

export function safeNext(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) {
    return DEFAULT_DESTINATION
  }
  // Must be a path on this site: one leading slash, not "//host" (protocol-relative) and
  // not "/\host" (some browsers treat a backslash as a slash).
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_DESTINATION
  }
  // No control characters (header splitting, odd parsing) and never back to the login page.
  for (const character of value) {
    const code = character.codePointAt(0)!
    if (code < 0x20 || code === 0x7f) return DEFAULT_DESTINATION
  }
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) {
    return DEFAULT_DESTINATION
  }
  return value
}
