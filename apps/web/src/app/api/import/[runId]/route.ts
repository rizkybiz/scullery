// How an import is going: GET /api/import/<runId>, polled by the import panel.
//
// Signed-in only, checked here (the proxy is a first gate, not the boundary). Any signed-in
// user can read any run: there are two users with the same permissions, run ids are random and
// never listed, and a run holds only a draft built from what that person pasted.
import { getRun } from 'workflow/api'
import { audit } from '../../../../lib/audit.ts'
import { getSession } from '../../../../lib/auth/dal.ts'
import type { ImportOutcome } from '../../../../workflows/importRecipe.ts'

export type ImportStatus =
  | { status: 'running' }
  | { status: 'done'; outcome: ImportOutcome }
  | { status: 'failed'; message: string }

const RUN_ID = /^wrun_[0-9A-Z]{20,40}$/

const json = (body: ImportStatus | { error: string }, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function GET(_request: Request, context: RouteContext<'/api/import/[runId]'>) {
  const session = await getSession()
  if (!session) return json({ error: 'Sign in first.' }, 401)

  const { runId } = await context.params
  if (!RUN_ID.test(runId)) return json({ error: 'Unknown import.' }, 404)

  const run = getRun<ImportOutcome>(runId)
  if (!(await run.exists)) return json({ error: 'Unknown import.' }, 404)

  const status = await run.status
  if (status === 'completed') {
    const outcome = await run.returnValue
    if (outcome.ok) {
      audit('import.finished', {
        user: session.name,
        runId,
        model: outcome.via.model,
        source: outcome.via.source,
      })
    }
    return json({ status: 'done', outcome })
  }
  if (status === 'failed' || status === 'cancelled') {
    // The run's own error can hold provider details; it is in the Workflow dashboard and the
    // server log, and the person gets plain words.
    audit('import.failed', { user: session.name, runId, status })
    return json({
      status: 'failed',
      message: 'The import did not finish. Try again, or paste the recipe text instead.',
    })
  }
  return json({ status: 'running' })
}
