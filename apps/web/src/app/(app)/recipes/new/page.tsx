import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import NewRecipeEditor from '../../../../components/NewRecipeEditor.tsx'
import { listUnits, type Unit } from '../../../../lib/api/units.ts'
import { requireSession } from '../../../../lib/auth/dal.ts'

// The page itself is a static shell: a link, a heading and a fallback. The form (with the
// import panel above it) needs the list of units from the API, so it streams in behind <Suspense>.
export default function NewRecipePage() {
  return (
    <>
      <Link href="/recipes">All recipes</Link>
      <h1>New recipe</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <NewRecipeForm />
      </Suspense>
    </>
  )
}

// Units are optional on an ingredient, so if they cannot be loaded the form still
// works, with only "No unit" to choose. The real error goes to the server log.
async function readUnits(): Promise<Unit[]> {
  try {
    return await listUnits()
  } catch (error) {
    console.error('Could not load units', error)
    return []
  }
}

async function NewRecipeForm() {
  // connection() marks this as request-time work. Without it, Next would call the API
  // while building the site (the units are cached and need no request data), which
  // would make `next build` depend on the API being reachable.
  await connection()
  await requireSession() // before any data: the proxy is a first gate, not the boundary
  const units = await readUnits()
  return <NewRecipeEditor units={units} />
}
