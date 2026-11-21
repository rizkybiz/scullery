import type { NextConfig } from 'next'
import { withWorkflow } from 'workflow/next'

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
  // enabling partialPrefetching as this will be default true in a future release
  partialPrefetching: true,
}

// withWorkflow compiles "use workflow" and "use step" functions and adds Workflow's
// internal routes under /.well-known/workflow/ (kept out of proxy.ts, see there).
export default withWorkflow(config)
