// Which AI Gateway errors are worth retrying. The import workflow asks this when the model step
// fails: a permanent error ends the run at once (FatalError), anything else is retried by Workflow
// after a delay (RetryableError).
import type { GatewayError } from '@ai-sdk/gateway'

// A permanent error is one no retry can fix: the account has no credits or budget, the free tier
// refuses the model, authentication fails, or the request itself is bad.
//
// Order matters:
// 1. The message check comes first. Gateway reports "Free tier users do not have access to this
//    model" and similar with a status code that looks retryable, and the spike saw that retried
//    three times for nothing. The wording is the only signal, so if Gateway changes it the error
//    falls through to the rules below and is retried instead: slower, but never wrong.
// 2. Timeouts (408) and rate limits (429) are transient, whatever else is said about them. The
//    free tier's per-minute limit is the common case.
// 3. Everything else is permanent if Gateway says it is not retryable, or if it is a 4xx.
export function isPermanent(error: GatewayError): boolean {
  if (/free tier|insufficient|credit|budget/i.test(error.message)) return true
  if (error.statusCode === 408 || error.statusCode === 429) return false
  return !error.isRetryable || (error.statusCode >= 400 && error.statusCode < 500)
}
