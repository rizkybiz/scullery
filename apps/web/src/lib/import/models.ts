// Which models the recipe import uses, all through Vercel AI Gateway.
//
// A plain "provider/model" string given to the AI SDK goes to AI Gateway, which authenticates
// with the deployment's OIDC token (VERCEL_OIDC_TOKEN locally, from `vercel env pull`). There is
// no AI Gateway or provider API key anywhere in this app. Gateway routes the call, falls back to
// the next model if the first fails, and records cost and latency in the dashboard.
//
// Free tier only (a project rule): both models are on AI Gateway's free tier. The spike showed
// the free tier refusing anthropic/claude-haiku-5.5, so it is not used.
//
// Chosen by the eval set (evals/import; latest numbers in evals/import/RESULTS.md), 16 cases,
// 329 checks, third run:
// - google/gemini-2.5-flash-lite: 325/329 checks, median 1.9 s. Primary: as good as it needs to
//   be for a draft a person reviews, and 7.5 times faster.
// - openai/gpt-5-nano: 327/329 checks, median 14.4 s. A reasoning model: more careful, much
//   slower, and it rejects temperature, so its misses vary run to run. The fallback.
export const IMPORT_MODEL = 'google/gemini-2.5-flash-lite'
export const IMPORT_FALLBACK_MODELS: readonly string[] = ['openai/gpt-5-nano']

// The models the eval script may compare. Anything else would be a typo or a paid model.
export const EVAL_MODELS: readonly string[] = [IMPORT_MODEL, ...IMPORT_FALLBACK_MODELS]
