import Link from 'next/link'

// Shown when the recipe page calls notFound(): the id is well-formed or not, but
// there is no recipe behind it.
export default function RecipeNotFound() {
  return (
    <>
      <h1>Recipe not found</h1>
      <p>
        <Link href="/recipes">Back to recipes</Link>
      </p>
    </>
  )
}
