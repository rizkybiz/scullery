import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import './index.css'

// One cache for all server data, shared by every component below it.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  // StrictMode adds extra checks in development only (for example it runs
  // effects twice to expose bugs); it does nothing in the production build.
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* BrowserRouter keeps the app in step with the address bar. */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
