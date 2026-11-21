// Which deployment this is, for people: a tag like "[preview · PR #8]" added to the browser tab
// title on every deployment except production, so a preview or a local build is never mistaken
// for the live site. Production gets no tag. Plain logic: takes the environment as an argument.
//
// It reads VERCEL_ENV and VERCEL_GIT_PULL_REQUEST_ID, Vercel system variables set at build and run
// time, without the NEXT_PUBLIC_ prefix: only the resulting title text reaches the browser.
type Env = Record<string, string | undefined>

export function deploymentTag(env: Env = process.env): string {
  const name = env.VERCEL_ENV || 'local' // not on Vercel at all: next dev or a local build
  if (name === 'production') return ''
  const pr = env.VERCEL_GIT_PULL_REQUEST_ID // empty on a branch pushed before its PR existed
  return pr ? ` [${name} · PR #${pr}]` : ` [${name}]`
}
