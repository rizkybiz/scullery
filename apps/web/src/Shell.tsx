import { NavLink, Outlet } from 'react-router'
import ApiStatus from './ApiStatus.tsx'

// The frame around every page: a header, the current page, and a tab bar along
// the bottom (within thumb reach on an iPad). Week and Shopping tabs will join
// Recipes when those features exist.
export default function Shell() {
  return (
    <div className="shell">
      <header className="shell-header">
        <strong>Scullery</strong>
        <ApiStatus />
      </header>

      {/* <Outlet /> is a slot: React Router renders whichever page matches the
          URL here, so pages never repeat the header or tabs. */}
      <main className="app">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/recipes">Recipes</NavLink>
      </nav>
    </div>
  )
}
