// Which deployment this is, for people: a tag like "[preview · a1b2c3d]" added to the browser
// tab title on every deployment except production, so a preview or a local build is never
// mistaken for the live site. Production gets no tag. Plain logic: takes the environment as an
// argument.
//
// The hash is the commit's short SHA (its first 7 characters, as git and GitHub show it). It is
// set from the first build of a branch, unlike the pull request number, which is empty until the
// PR exists and only appears after another push or a redeploy.
//
// It reads VERCEL_ENV and VERCEL_GIT_COMMIT_SHA, Vercel system variables set at build and run
// time, without the NEXT_PUBLIC_ prefix: only the resulting title text reaches the browser.
type Env = Record<string, string | undefined>

export function deploymentTag(env: Env = process.env): string {
  const name = env.VERCEL_ENV || 'local' // not on Vercel at all: next dev or a local build
  if (name === 'production') return ''
  const sha = env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) // empty for a CLI deploy without git
  return sha ? ` [${name} · ${sha}]` : ` [${name}]`
}
