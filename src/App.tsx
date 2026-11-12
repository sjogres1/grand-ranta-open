import type { Step } from './types'
import { useTournament } from './useTournament'
import { Landing } from './pages/Landing'
import { MIN_PLAYERS, Players } from './pages/Players'
import { Pairs } from './pages/Pairs'
import { Schedule } from './pages/Schedule'
import { Finals } from './pages/Finals'

const STEPS: { id: Step; label: string }[] = [
  { id: 'players', label: 'Players' },
  { id: 'pairs', label: 'Pairs' },
  { id: 'schedule', label: 'Program' },
  { id: 'finals', label: 'Finals & results' },
]

export default function App() {
  const { state, update, reset, loaded, saveError, auth, login, logout, reports, clearReport } = useTournament()

  if (!loaded) return <div className="loading">🏸</div>

  // Online version: the main page is the organizer login.
  if (auth.required && !auth.loggedIn) return <Landing login={login} />

  if (state.step === 'landing') {
    const inProgress = state.players.length > 0
    return (
      <Landing
        onStart={async () => {
          if (inProgress) {
            if (!confirm('A tournament is already in progress. Start a brand new one? (All players and results will be deleted.)')) return
            await reset()
          }
          update({ step: 'players' })
        }}
        onContinue={inProgress ? () => update({ step: lastReachable() }) : undefined}
      />
    )
  }

  function reachable(step: Step): boolean {
    switch (step) {
      case 'players': return true
      case 'pairs': return state.players.length >= MIN_PLAYERS && state.players.length % 2 === 0
      case 'schedule': return state.pairs.length > 0
      case 'finals': return state.finals !== null
      default: return false
    }
  }
  function lastReachable(): Step {
    return [...STEPS].reverse().find((s) => reachable(s.id))?.id ?? 'players'
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => update({ step: 'landing' })}>
          🏸 Grand Räntä <span>Open</span>
        </button>
        <nav className="steps">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={`step ${state.step === s.id ? 'active' : ''}`}
              disabled={!reachable(s.id)}
              onClick={() => update({ step: s.id })}
            >
              <span className="step-num">{i + 1}</span> {s.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          {saveError && <span className="warn small" title="Is the server running? Reload the page to retry.">⚠️ Not saved to server</span>}
          <button
            className="btn-ghost small"
            onClick={async () => {
              if (confirm('Reset everything? All players, pairs and results will be deleted.')) await reset()
            }}
          >
            Reset
          </button>
          {auth.required && (
            <button className="btn-ghost small" onClick={logout}>
              Log out
            </button>
          )}
        </div>
      </header>
      <main>
        {state.step === 'players' && <Players state={state} update={update} />}
        {state.step === 'pairs' && <Pairs state={state} update={update} />}
        {state.step === 'schedule' && <Schedule state={state} update={update} reports={reports} clearReport={clearReport} />}
        {state.step === 'finals' && <Finals state={state} update={update} reports={reports} clearReport={clearReport} />}
      </main>
    </div>
  )
}
