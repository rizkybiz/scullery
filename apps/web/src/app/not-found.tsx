import Link from 'next/link'

// Shown for any URL that matches no route, and when a page calls notFound() without
// a closer not-found file of its own.
export default function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link href="/recipes">Back to recipes</Link>
      </p>
    </>
  )
}
