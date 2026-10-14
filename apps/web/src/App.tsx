import { Navigate, Route, Routes } from 'react-router'
import Shell from './Shell.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import RecipePage from './pages/RecipePage.tsx'
import RecipesPage from './pages/RecipesPage.tsx'

// The route table: which component shows for which URL. Everything inside the
// Shell route renders in the shell's <Outlet />. `*` matches any URL nothing
// else did.
export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        {/* "/" has no page of its own yet. When the week view exists, point this
            redirect at it and nothing else changes. */}
        <Route index element={<Navigate to="/recipes" replace />} />
        <Route path="recipes" element={<RecipesPage />} />
        <Route path="recipes/:id" element={<RecipePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
