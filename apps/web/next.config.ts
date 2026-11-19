import type { NextConfig } from 'next'

const config: NextConfig = {
  // Cache Components: caching is opt-in, per function or component, with
  // "use cache". Everything else renders at request time. See the README
  // (decision D5) for how the recipe pages use it.
  cacheComponents: true,
  // Pin the project root to this folder. Without it, Next walks up the tree and
  // can pick an unrelated package-lock.json (one exists in the home directory),
  // which changes how it resolves dependencies.
  turbopack: {
    root: __dirname,
  },
}

export default config
