import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Cloud,
  Database,
  Globe,
  LogIn,
  Shield,
  Sparkles,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ThemeSwitch from '@/components/ThemeSwitch.tsx'

export const metadata: Metadata = { title: 'Overview' }

// The front door: a one-page overview of the project, written for the customer (and the people
// reviewing it). Public, with no data and no request-time code, so it is prerendered and served
// from Vercel's CDN. The app itself is one click away, behind sign-in.
//
// The sections are native <details>: collapsible with no JavaScript, keyboard and screen reader
// friendly, and the page stays fully static.
export default function Overview() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
        <span className="font-display text-xl font-semibold">Scullery</span>
        <div className="ml-auto">
          <ThemeSwitch />
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/recipes" className="text-foreground no-underline hover:no-underline">
            <LogIn aria-hidden="true" />
            Open the app
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 pt-8 pb-16">
        <section className="space-y-5">
          <Badge variant="secondary" className="px-2.5 py-1 text-sm font-normal">
            Solution overview
          </Badge>
          <h1 className="text-4xl sm:text-5xl">
            Scullery on Vercel: a faster, safer front end and an AI recipe import, with the data
            left where it is
          </h1>
          <p className="text-lg text-muted-foreground">
            Scullery is a recipe app for home cooks, built on a Go API and Postgres in Google Cloud.
            This page explains why the team moved the web app to Vercel, what was built, and the
            decisions behind it. The demo is live: open the app and sign in with the reviewer
            account.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat value="0" label="stored cloud keys: Vercel proves who it is with OIDC" />
            <Stat value="325/329" label="checks passed by the AI import in its eval set" />
            <Stat value="1.9 s" label="median time for the AI to draft an imported recipe" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link
                href="/recipes"
                className="text-primary-foreground no-underline hover:no-underline"
              >
                <BookOpen aria-hidden="true" />
                Open Scullery
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a
                href="https://github.com/rizkybiz/scullery"
                className="text-foreground no-underline hover:no-underline"
              >
                Read the code
              </a>
            </Button>
          </div>
        </section>

        <div className="space-y-3">
          <Section title="The problem" open>
            <p>
              The Scullery team had a working product: a Go API and a Postgres database on Google
              Cloud, and a React single-page app that called the API straight from the browser. It
              worked, but it held them back:
            </p>
            <ul>
              <li>
                <strong>The API was public by necessity.</strong> Every browser called it, so it
                needed open CORS, its address was in every bundle, and anything it trusted had to be
                safe to hand to a stranger.
              </li>
              <li>
                <strong>Slow first loads.</strong> The page arrived empty and filled in after a
                round of JavaScript and API calls.
              </li>
              <li>
                <strong>No safe place to try changes.</strong> One shared test environment, no
                preview of a change before it merged, and rollback meant a redeploy.
              </li>
              <li>
                <strong>AI was on the roadmap with no home.</strong> The most-asked feature was
                &ldquo;add a recipe from a link&rdquo;. That needs model calls, retries and
                guardrails, and the team did not want to run that infrastructure or move its data.
              </li>
            </ul>
          </Section>

          <Section title="What we built">
            <p>
              Vercel&rsquo;s role is to <strong>connect</strong>: it hosts the web app and the AI
              import, and the API and database stay in Google Cloud, untouched.
            </p>
            <ul>
              <li>
                <strong>A server-first Next.js app.</strong> Pages and writes run on Vercel; the
                browser never calls the API. A static shell is served at once from the CDN and the
                data streams in, cached and refreshed precisely when something changes.
              </li>
              <li>
                <strong>Keyless access to the API.</strong> Each Vercel deployment proves its
                identity with an OIDC token and gets a short-lived Google token for one job: calling
                its own API. Previews can reach only staging; only production reaches production.
              </li>
              <li>
                <strong>AI recipe import.</strong> Paste a link or the recipe text. A durable
                Workflow reads it, a small model fills the recipe form through AI Gateway, and the
                app checks the answer. A person always reviews the draft and saves it.
              </li>
              <li>
                <strong>A polished, accessible app:</strong> search, favorites, create, edit and
                delete, light and dark themes, keyboard-friendly menus and touch-sized controls for
                an iPad at the counter.
              </li>
            </ul>
          </Section>

          <Section title="Architecture">
            <ArchitectureDiagram />
            <ul>
              <li>
                <strong>The database has no public address.</strong> Only Cloud Run reaches it, over
                a private network.
              </li>
              <li>
                <strong>No stored secret to leak.</strong> Trust is configured once, in Terraform:
                which Vercel project and environment may act as which service account, which may
                only invoke its own API.
              </li>
              <li>
                <strong>Two environments, end to end.</strong> Production and staging each have
                their own API, database and service account; every pull request gets a preview wired
                to staging.
              </li>
            </ul>
          </Section>

          <Section title="The AI import, and how we know it works">
            <ul>
              <li>
                <strong>Vercel Workflow</strong> runs each import as durable steps (read the page,
                ask the model, tidy the answer), each retried on its own.
              </li>
              <li>
                <strong>AI SDK and AI Gateway:</strong> one structured-output call, Gemini 2.5
                Flash-Lite with GPT-5 nano as the fallback, authenticated by OIDC with no API key.
              </li>
              <li>
                <strong>Guardrails:</strong> the model has no tools and can only fill the schema;
                the page is treated as data, never instructions; links are fetched through an SSRF
                guard; units are checked against the source line; a person approves every draft.
              </li>
              <li>
                <strong>Measured, not assumed:</strong> an eval set of 16 real-world cases and 329
                checks, run against each model. Flash-Lite scored 325/329 in a median 1.9 s; nano
                327/329 in 14.4 s. Flash-Lite leads: nearly as accurate, 7.5&times; faster, and a
                person reviews every draft anyway. The runs drove three fixes before launch.
              </li>
            </ul>
          </Section>

          <Section title="The value">
            <ul>
              <li>
                <strong>Security:</strong> the API is no longer reachable from browsers, there are
                no long-lived cloud keys, and the database stays private.
              </li>
              <li>
                <strong>Speed:</strong> content arrives with the first response instead of after it;
                reads are cached at the edge of the app and refreshed on every write.
              </li>
              <li>
                <strong>Velocity:</strong> a preview for every pull request, required CI checks, and
                instant rollback on Vercel.
              </li>
              <li>
                <strong>AI without new infrastructure:</strong> durable runs, model fallback and
                observability come from the platform, and the data never leaves Google Cloud.
              </li>
            </ul>
          </Section>

          <Section title="Key decisions">
            <dl className="space-y-3">
              <Decision term="Connect, don’t migrate">
                The API and database stay in Google Cloud. Vercel adds the front end and the AI
                layer; nothing about the existing world has to move.
              </Decision>
              <Decision term="Server-first">
                Client JavaScript only where the page is interactive (the form, menus, the theme
                switch). Everything else renders on the server.
              </Decision>
              <Decision term="A human approves every AI draft">
                The import fills the form and stops. Saving goes through the same checks as a recipe
                typed by hand.
              </Decision>
              <Decision term="Kill switches over hope">
                READ_ONLY stops every write and every AI call; IMPORT_DISABLED stops only the AI.
                Both are one environment variable.
              </Decision>
              <Decision term="Free tier, on purpose">
                Hobby plan and the AI Gateway free tier. The design names what Pro would add
                (Rolling Releases for canaries, more firewall rules).
              </Decision>
            </dl>
          </Section>

          <Section title="Rollout and success measures">
            <ul>
              <li>
                <strong>Web:</strong> every change ships first as a preview against staging; merge
                to main is production. On Pro, Rolling Releases would canary a new deployment to a
                share of traffic; today, instant rollback restores the previous deployment in
                seconds.
              </li>
              <li>
                <strong>API:</strong> a new image is pinned by digest and applied to staging, then
                production. Database migrations stay backward compatible (expand, then contract), so
                either version of the app runs against the schema.
              </li>
              <li>
                <strong>Measures:</strong> Core Web Vitals from Speed Insights, usage from Web
                Analytics, import success rate and time from the run logs, and the eval score as a
                bar that any model or prompt change must clear.
              </li>
            </ul>
          </Section>

          <Section title="Limitations and risks">
            <ul>
              <li>
                The AI Gateway free tier allows 5 requests a minute per model; a burst falls back to
                the slower model, then waits.
              </li>
              <li>
                Two people editing one recipe: the last save wins (there is no version check yet).
              </li>
              <li>
                Sign-in is two fixed accounts, protected by a Firewall rate limit; there is no
                sign-up or per-user quota.
              </li>
              <li>
                The API image is built and published by hand; CI checks the code and the pipeline is
                designed but not built.
              </li>
            </ul>
            <p>
              The full list, with what each would take to fix, is in the{' '}
              <a href="https://github.com/rizkybiz/scullery#7-limitations-and-risks">README</a>.
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card className="gap-1 p-4">
      <span className="font-display text-3xl font-semibold text-primary">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Card>
  )
}

// One collapsible section. A native <details>: open and close need no JavaScript.
function Section({
  title,
  open = false,
  children,
}: {
  title: string
  open?: boolean
  children: ReactNode
}) {
  return (
    <details open={open} className="group rounded-xl border bg-card shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-primary transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <h2 className="text-xl">{title}</h2>
      </summary>
      <div className="space-y-3 px-4 pb-5 sm:px-6 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
        {children}
      </div>
    </details>
  )
}

function Decision({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold">{term}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  )
}

// The architecture as boxes and arrows: left to right from tablet width, top to bottom on a phone.
function ArchitectureDiagram() {
  return (
    <figure className="space-y-2">
      <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1.4fr_auto_1.4fr]">
        <Box icon={Globe} title="Browser">
          HTML and form posts only. Never sees the API.
        </Box>
        <Arrow label="HTTPS" />
        <Box icon={Shield} title="Vercel" accent>
          Firewall · Next.js (Server Components, Server Actions) · Workflow · AI Gateway
        </Box>
        <Arrow label="OIDC → short-lived Google token" />
        <Box icon={Cloud} title="Google Cloud">
          Cloud Run Go API (staging, production)
          <span className="mt-2 flex items-center gap-1.5">
            <Database aria-hidden="true" className="size-4" />
            Cloud SQL Postgres, private IP
          </span>
        </Box>
      </div>
      <figcaption className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-4 text-primary" />
        The AI import runs inside Vercel: Workflow steps call models through AI Gateway, then hand a
        draft to the form.
      </figcaption>
    </figure>
  )
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
      <ArrowRight aria-hidden="true" className="hidden size-5 sm:block" />
      <ArrowDown aria-hidden="true" className="size-5 sm:hidden" />
      {label}
    </div>
  )
}

function Box({
  icon: Icon,
  title,
  accent = false,
  children,
}: {
  icon: typeof Globe
  title: string
  accent?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={
        accent
          ? 'rounded-lg border-2 border-primary/60 bg-primary/5 p-3 text-sm'
          : 'rounded-lg border bg-muted/50 p-3 text-sm'
      }
    >
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        {title}
      </p>
      <div className="text-muted-foreground">{children}</div>
    </div>
  )
}
