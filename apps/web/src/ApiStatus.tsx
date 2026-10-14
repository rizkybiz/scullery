import { useQuery } from '@tanstack/react-query'
import { getHealth } from './api/health.ts'

// A React component is a function that returns a description of the UI (JSX,
// the HTML-looking syntax below). React calls it to draw the screen, and calls
// it again whenever the data it depends on changes. You never edit the page
// directly: you change the data, and the function's next result is the new UI.
export default function ApiStatus() {
  // `useQuery` is a "hook" (a function whose name starts with `use`). It runs
  // the request, caches the result, and re-renders this component as the request
  // moves from pending to success or error. `signal` lets it cancel a request
  // that is no longer needed (like a Go context).
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
  })

  return (
    <p className="status" data-state={health.status}>
      API:{' '}
      {/* Each flag narrows the type: `health.data` only exists inside the
          isSuccess branch, `health.error` only inside isError. The compiler
          enforces it, much like handling every variant of a Go sum type. */}
      {health.isPending && 'checking…'}
      {health.isError && `unreachable (${health.error.message})`}
      {health.isSuccess && health.data.status}
    </p>
  )
}
