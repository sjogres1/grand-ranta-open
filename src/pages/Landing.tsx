import { Suspense, lazy, useState } from 'react'

const HeroScene = lazy(() => import('../scene/HeroScene'))

interface Props {
  onStart?: () => void
  onContinue?: () => void
  /** When set, the page shows an admin login instead of the start button. Returns an error or null. */
  login?: (username: string, password: string) => Promise<string | null>
}

export function Landing({ onStart, onContinue, login }: Props) {
  return (
    <div className="landing">
      <div className="landing-canvas">
        <Suspense fallback={null}>
          <HeroScene />
        </Suspense>
      </div>
      {/* a little hail falls in the sky behind the title (the court below stays dry) */}
      <div className="hail" aria-hidden>
        {Array.from({ length: 70 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37 + (i % 7) * 11) % 100}%`,
              animationDelay: `${-((i * 0.37) % 2.4).toFixed(2)}s`,
              animationDuration: `${0.9 + ((i * 13) % 10) / 14}s`,
              opacity: 0.25 + ((i * 7) % 5) / 12,
            }}
          />
        ))}
      </div>
      <div className="landing-overlay">
        <p className="kicker">Doubles · Helsinki · Espoo · Vantaa · Turku</p>
        <h1 className="title">
          Grand Räntä <span>Open</span>
        </h1>
        <p className="tagline">Slush outside. Smash inside.</p>
        {login ? (
          <LoginForm login={login} />
        ) : (
          <>
            <button className="btn-start" onClick={onStart}>
              🏸 Start tournament
            </button>
            {onContinue && (
              <button className="btn-link" onClick={onContinue}>
                Continue the tournament in progress →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LoginForm({ login }: { login: NonNullable<Props['login']> }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const err = await login(username, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <h2>Organizer login</h2>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn-primary big full" type="submit" disabled={busy}>
        {busy ? 'Logging in…' : '🔓 Log in'}
      </button>
      <p className="muted small">Playing in the tournament? Open your team page – ask the organizer for your team's link.</p>
    </form>
  )
}
