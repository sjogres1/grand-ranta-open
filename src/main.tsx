import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { TeamPage } from './pages/TeamPage'
import './styles.css'

function pathSlug(): string {
  let path = window.location.pathname
  try {
    path = decodeURIComponent(path)
  } catch {
    // malformed URL – use it as is
  }
  return path.replace(/^\/+|\/+$/g, '').replace(/^index\.html$/, '').toLowerCase()
}
const teamSlug = pathSlug()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* /<team-name> = read-only team page, / = organizer app */}
    {teamSlug ? <TeamPage slug={teamSlug} /> : <App />}
  </StrictMode>,
)
