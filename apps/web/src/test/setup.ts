// Adds matchers such as `toBeInTheDocument()` to Vitest's `expect`.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Remove what each test rendered. Testing Library does this by itself only when
// the test framework provides `afterEach` as a global, which Vitest does not by
// default; without it, one test's page is still in the DOM during the next.
afterEach(cleanup)
