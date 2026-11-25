import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Card } from '@/components/ui/card'
import LoginForm from '@/components/LoginForm.tsx'
import { getSession } from '@/lib/auth/dal.ts'
import { safeNext } from '@/lib/auth/redirect.ts'

// The sign-in page. The heading is part of the static shell; the form streams in behind
// <Suspense> because it depends on the URL (?next=) and on whether you are already in.
export default function LoginPage(props: PageProps<'/login'>) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm gap-6 p-6 sm:p-8">
        <div className="space-y-1 text-center">
          <h1>Scullery</h1>
          <p className="text-sm text-muted-foreground">Sign in to your recipes.</p>
        </div>
        <Suspense fallback={<p className="text-center text-muted-foreground">Loading…</p>}>
          <LoginContent searchParams={props.searchParams} />
        </Suspense>
      </Card>
    </main>
  )
}

async function LoginContent({
  searchParams,
}: {
  searchParams: PageProps<'/login'>['searchParams']
}) {
  const params = await searchParams
  const requested = Array.isArray(params.next) ? params.next[0] : params.next
  const next = safeNext(requested)

  // Already signed in: nothing to do here.
  if (await getSession()) redirect(next)

  return <LoginForm next={next} />
}
