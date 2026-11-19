import type { NextConfig } from 'next'

const config: NextConfig = {
  // Cache Components: caching is opt-in, per function or component, with
  // "use cache". Everything else renders at request time. See the README
  // (decision D5) for how the recipe pages use it.
  cacheComponents: true,
}

export default config
