import { useParams } from 'react-router'

// Placeholder: the real detail view arrives in a later step.
export default function RecipePage() {
  // `:id` in the route path ("/recipes/:id") shows up here, by name. It is typed
  // `string | undefined` because the hook cannot know which route it is used in.
  const { id } = useParams()
  return <h1>Recipe {id}</h1>
}
