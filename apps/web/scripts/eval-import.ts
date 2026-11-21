// Runs the recipe import's eval set: the same source -> structure -> normalize code the app uses,
// on every fixture, for each model, then scores the drafts (evals/import).
//
//   vercel env pull <file> --environment development     # once: a 12-hour OIDC token for Gateway
//   VERCEL_OIDC_TOKEN=... node scripts/eval-import.ts [--model <id>] [--case <id>]
//
// Each case is one AI Gateway request per model (free tier). Models run without fallbacks, so a
// result belongs to the model named. Results go to evals/import/results/ and RESULTS.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { Unit } from '../src/lib/api/units.ts'
import { EVAL_MODELS } from '../src/lib/import/models.ts'
import { normalizeDraft, type Normalized } from '../src/lib/import/normalize.ts'
import { sourceFromHtml, sourceFromText } from '../src/lib/import/source.ts'
import { structureRecipe } from '../src/lib/import/structure.ts'
import { CASES } from '../evals/import/cases.ts'
import { score, type Check, type Kind } from '../evals/import/score.ts'

const dir = join(import.meta.dirname, '..', 'evals', 'import')
const { values } = parseArgs({ options: { model: { type: 'string' }, case: { type: 'string' } } })

if (!process.env['VERCEL_OIDC_TOKEN'] && !process.env['AI_GATEWAY_API_KEY']) {
  console.error('Set VERCEL_OIDC_TOKEN (vercel env pull) so AI Gateway can authenticate.')
  process.exit(1)
}
const models = values.model ? [values.model] : [...EVAL_MODELS]
for (const model of models) {
  if (!EVAL_MODELS.includes(model)) {
    console.error(`${model} is not one of ${EVAL_MODELS.join(', ')} (free-tier models only).`)
    process.exit(1)
  }
}
const cases = values.case ? CASES.filter((c) => c.id === values.case) : CASES
const units = JSON.parse(readFileSync(join(dir, 'units.json'), 'utf8')) as Unit[]
const unitCodes = new Set(units.map((unit) => unit.code))

type CaseResult = {
  id: string
  passed: number
  total: number
  ms: number | null
  inputTokens: number | null
  outputTokens: number | null
  answeredBy: string | null
  error: string | null
  failures: string[]
  checks: Check[]
  draft: Normalized | null
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? null : s[Math.floor((s.length - 1) / 2)]!
}

const summaries: string[] = []
mkdirSync(join(dir, 'results'), { recursive: true })

for (const model of models) {
  console.log(`\n== ${model}`)
  const results: CaseResult[] = []
  for (const c of cases) {
    const raw = readFileSync(join(dir, 'fixtures', c.file), 'utf8')
    const source = c.file.endsWith('.html')
      ? sourceFromHtml(raw, c.url ?? null)
      : sourceFromText(raw)
    let result: CaseResult
    try {
      const structured = await structureRecipe(source, units, { model, fallbacks: [] })
      const draft = normalizeDraft(structured.draft, source, unitCodes)
      const checks = score(c.expect, draft)
      result = {
        id: c.id,
        passed: checks.filter((x) => x.ok).length,
        total: checks.length,
        ms: structured.ms,
        inputTokens: structured.inputTokens,
        outputTokens: structured.outputTokens,
        answeredBy: structured.answeredBy,
        error: null,
        failures: checks.filter((x) => !x.ok).map((x) => `${x.kind}: ${x.what}`),
        checks,
        draft,
      }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      result = {
        id: c.id,
        passed: 0,
        total: 1,
        ms: null,
        inputTokens: null,
        outputTokens: null,
        answeredBy: null,
        error: message.slice(0, 500),
        failures: [message.slice(0, 200)],
        checks: [],
        draft: null,
      }
    }
    results.push(result)
    const mark = result.error ? 'ERROR' : result.passed === result.total ? 'pass ' : 'FAIL '
    console.log(
      `${mark} ${c.id.padEnd(26)} ${String(result.passed).padStart(2)}/${String(result.total).padEnd(2)} ${result.ms ?? '-'} ms`,
    )
    for (const failure of result.failures) console.log(`        - ${failure}`)
  }

  const checks = results.flatMap((r) => r.checks)
  const byKind = new Map<Kind, { ok: number; all: number }>()
  for (const check of checks) {
    const k = byKind.get(check.kind) ?? { ok: 0, all: 0 }
    k.all++
    if (check.ok) k.ok++
    byKind.set(check.kind, k)
  }
  const passedCases = results.filter((r) => !r.error && r.passed === r.total).length
  const okChecks = checks.filter((c) => c.ok).length
  const ms = results.flatMap((r) => (r.ms === null ? [] : [r.ms]))
  const tokensIn = results.reduce((n, r) => n + (r.inputTokens ?? 0), 0)
  const tokensOut = results.reduce((n, r) => n + (r.outputTokens ?? 0), 0)
  const slug = model.replace(/[^a-z0-9.-]+/gi, '_')
  writeFileSync(
    join(dir, 'results', `${slug}.json`),
    JSON.stringify({ model, ranAt: new Date().toISOString(), results }, null, 2) + '\n',
  )

  const lines = [
    `### \`${model}\``,
    '',
    `- **Cases fully right:** ${passedCases} of ${results.length}`,
    `- **Checks passed:** ${okChecks} of ${checks.length} (${((100 * okChecks) / Math.max(1, checks.length)).toFixed(1)}%)`,
    `- **Latency:** median ${median(ms) ?? '-'} ms, slowest ${ms.length ? Math.max(...ms) : '-'} ms`,
    `- **Tokens, whole set:** ${tokensIn} in, ${tokensOut} out`,
    '',
    '| Check kind | Passed |',
    '|---|---|',
    ...[...byKind.entries()].map(([kind, k]) => `| ${kind} | ${k.ok}/${k.all} |`),
    '',
    '<details><summary>Failed checks</summary>',
    '',
    ...results.flatMap((r) => r.failures.map((f) => `- \`${r.id}\`: ${f}`)),
    results.every((r) => r.failures.length === 0) ? '- none' : '',
    '',
    '</details>',
    '',
  ]
  summaries.push(lines.join('\n'))
  console.log(
    `\n${model}: ${passedCases}/${results.length} cases, ${okChecks}/${checks.length} checks, median ${median(ms)} ms`,
  )
}

if (!values.case) {
  const header = `# Recipe import eval results\n\nGenerated by \`scripts/eval-import.ts\` on ${new Date().toISOString().slice(0, 10)} over ${cases.length} cases (see \`cases.ts\`). Each model ran alone, without fallbacks. Raw drafts and every check are in \`results/\`.\n\n`
  writeFileSync(join(dir, 'RESULTS.md'), header + summaries.join('\n'))
  console.log(`\nwrote ${join('evals', 'import', 'RESULTS.md')}`)
}
