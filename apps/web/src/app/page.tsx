import { redirect } from 'next/navigation'

// The app has no home page of its own: the front door is the recipe list.
export default function Home() {
  redirect('/recipes')
}
