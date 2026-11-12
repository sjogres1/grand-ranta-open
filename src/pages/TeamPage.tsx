import { useEffect, useMemo, useState } from 'react'
import type { Match, Pair, Player, ScoreReport, Tournament } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { useTeamData } from '../useLiveTournament'
import { findPairBySlug } from '../logic/slug'
import { slotTime, winnerOf } from '../logic/schedule'
import { computeStandings, finalRanking } from '../logic/standings'
import { Standings } from '../components/Standings'
import { Avatar } from '../components/Avatar'
import { GameReport } from '../components/GameReport'
import type { ReportActionInput } from '../../shared/reports.js'

const STAGE_LABEL: Record<Match['stage'], string> = {
  round1: 'Round 1',
  round2: 'Round 2',
  final: '🏆 Final',
  bronze: '🥉 Bronze match',
}
const MEDALS = ['🥇', '🥈', '🥉']

const pwKey = (slug: string) => `uo-team-pw:${slug}`

/** Read-only page for one team: /<team-name-slug>. Needs the team password (given by the organizer). */
export function TeamPage({ slug }: { slug: string }) {
  // A link like /lucky-otters?pw=... logs in directly; otherwise use the password saved on this device.
  const [password, setPassword] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('pw')
    return fromUrl ?? localStorage.getItem(pwKey(slug)) ?? ''
  })
  const { state, reports, status, updatedAt, offline, act } = useTeamData(slug, password)

  useEffect(() => {
    if (status !== 'ok') return
    localStorage.setItem(pwKey(slug), password)
    // don't leave the password in the address bar / browser history
    if (window.location.search.includes('pw=')) window.history.replaceState(null, '', window.location.pathname)
  }, [status, slug, password])

  const forget = () => {
    localStorage.removeItem(pwKey(slug))
    setPassword('')
  }

  if (status === 'not-found') return <TeamNotFound slug={slug} />
  if (status === 'need-password' || status === 'wrong' || status === 'no-password') {
    return <PasswordGate slug={slug} status={status} onSubmit={setPassword} />
  }
  if (status === 'error') {
    return (
      <TeamShell>
        <p className="error">Something went wrong. Please reload the page.</p>
      </TeamShell>
    )
  }
  const pair = state && findPairBySlug(state, slug)
  if (!state || !pair) {
    return (
      <TeamShell>
        {offline ? <p className="error">Can't reach the tournament server. Retrying…</p> : <div className="loading small-loading">🏸</div>}
      </TeamShell>
    )
  }
  return <TeamView state={state} pair={pair} reports={reports} act={act} updatedAt={updatedAt} error={offline} onLogout={forget} />
}

function TeamShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="team-page">
      <header className="team-top">
        <span className="brand static">
          🏸 Grand Räntä <span>Open</span>
        </span>
      </header>
      {children}
    </div>
  )
}

function PasswordGate({ slug, status, onSubmit }: { slug: string; status: string; onSubmit: (pw: string) => void }) {
  const [value, setValue] = useState('')
  const [teamName, setTeamName] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/teams')
      .then((r) => r.json())
      .then((list: { name: string; slug: string }[]) => setTeamName(list.find((t) => t.slug === slug)?.name ?? null))
      .catch(() => undefined)
  }, [slug])

  return (
    <TeamShell>
      <form
        className="panel team-login"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onSubmit(value.trim())
        }}
      >
        <h1>{teamName ?? 'Team page'}</h1>
        <p className="muted">🔒 Enter your team password. You get it from the organizer.</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. lucky-otter-482"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          aria-label="Team password"
        />
        {status === 'wrong' && <p className="error">Wrong password – check it with the organizer.</p>}
        {status === 'no-password' && <p className="error">This team has no password yet – ask the organizer.</p>}
        <button className="btn-primary big full" type="submit">
          Open team page
        </button>
      </form>
    </TeamShell>
  )
}

function TeamNotFound({ slug }: { slug: string }) {
  const [teams, setTeams] = useState<{ name: string; slug: string }[] | null>(null)
  useEffect(() => {
    fetch('/api/teams')
      .then((r) => r.json())
      .then(setTeams)
      .catch(() => setTeams([]))
  }, [])
  return (
    <TeamShell>
      <div className="panel">
        <h2>Team "{slug}" not found</h2>
        {teams === null ? (
          <div className="loading small-loading">🏸</div>
        ) : teams.length === 0 ? (
          <p className="muted">The pairs haven't been drawn yet. Check back soon!</p>
        ) : (
          <>
            <p className="muted">Team names change when pairs are reshuffled. Pick your team:</p>
            <ul className="team-link-list">
              {teams.map((t) => (
                <li key={t.slug}>
                  <a href={`/${t.slug}`}>{t.name}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </TeamShell>
  )
}

function TeamView({
  state,
  pair,
  reports,
  act,
  updatedAt,
  error,
  onLogout,
}: {
  state: Tournament
  pair: Pair
  reports: ScoreReport[]
  act: (action: ReportActionInput) => Promise<string | null>
  updatedAt: Date | null
  error: boolean
  onLogout: () => void
}) {
  const s = { ...DEFAULT_SETTINGS, ...state.settings }
  const pairs = useMemo(() => new Map(state.pairs.map((p) => [p.id, p])), [state.pairs])
  const players = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players])
  const standings = useMemo(() => computeStandings(state.pairs, state.matches), [state.pairs, state.matches])

  const mine = state.matches.filter((m) => m.pairA === pair.id || m.pairB === pair.id)
  const upcoming = mine.filter((m) => !winnerOf(m)).sort((a, b) => a.slot - b.slot)
  const played = mine.filter((m) => winnerOf(m)).sort((a, b) => b.slot - a.slot)
  // game blocks still to be played (any team), to say how many come before ours
  const openSlots = [...new Set(state.matches.filter((m) => m.pairA && m.pairB && !winnerOf(m)).map((m) => m.slot))].sort((a, b) => a - b)

  const final = state.matches.find((m) => m.stage === 'final')
  const bronze = state.matches.find((m) => m.stage === 'bronze')
  const finished = state.finals === false || Boolean(final && bronze && winnerOf(final) && winnerOf(bronze))
  const place = finished ? finalRanking(standings, state.matches).indexOf(pair.id) : standings.findIndex((r) => r.pairId === pair.id)
  const row = standings.find((r) => r.pairId === pair.id)!

  const opponent = (m: Match) => pairs.get((m.pairA === pair.id ? m.pairB : m.pairA) ?? '')
  const names = (p: Pair | undefined) => p?.playerIds.map((id) => players.get(id)?.name ?? '?').join(' & ') ?? ''
  const when = (m: Match) => slotTime(s.startTime, m.slot, s.minutesPerGame)
  const reportOf = (m: Match) => reports.find((r) => r.matchId === m.id && r.pairA === m.pairA && r.pairB === m.pairB) ?? null
  const toConfirm = upcoming.filter((m) => {
    const r = reportOf(m)
    return r?.status === 'pending' && r.by !== pair.id
  }).length

  return (
    <TeamShell>
      <section className="team-hero">
        <h1>{pair.name}</h1>
        <div className="team-members">
          {pair.playerIds.map((id) => {
            const p = players.get(id)
            return p ? <Member key={id} player={p} /> : null
          })}
        </div>
      </section>

      <section className="team-stats">
        <div className="stat">
          <span className="stat-num">{finished && place < 3 ? MEDALS[place] : `#${place + 1}`}</span>
          <span className="stat-label">{finished ? 'final place' : `of ${state.pairs.length} pairs`}</span>
        </div>
        <div className="stat">
          <span className="stat-num">{row.points}</span>
          <span className="stat-label">points ({row.wins}W / {row.losses}L)</span>
        </div>
        <div className="stat">
          <span className={`stat-num ${row.diff > 0 ? 'pos' : row.diff < 0 ? 'neg' : ''}`}>{row.diff > 0 ? `+${row.diff}` : row.diff}</span>
          <span className="stat-label">
            ball difference ({row.ballsFor}–{row.ballsAgainst})
          </span>
        </div>
      </section>

      {finished && place === 0 && <div className="team-banner gold">🏆 You are the Grand Räntä Open champions! 🎉</div>}
      {toConfirm > 0 && (
        <a className="team-banner alert" href="#next-games">
          🔔 {toConfirm === 1 ? 'A score is' : `${toConfirm} scores are`} waiting for your confirmation
        </a>
      )}

      <section className="panel" id="next-games">
        <h3>Next games</h3>
        {upcoming.length === 0 ? (
          <p className="muted">
            {finished
              ? 'The tournament is over – thanks for playing! 🏸'
              : state.matches.length === 0
                ? "The program hasn't been made yet. Check back soon!"
                : 'No more games scheduled for you right now. Keep an eye on the standings – the final and bronze match are decided after the round.'}
          </p>
        ) : (
          <ul className="game-list">
            {upcoming.map((m, i) => {
              const before = openSlots.filter((x) => x < m.slot).length
              const opp = opponent(m)
              return (
                <li key={m.id} className={`game upcoming ${i === 0 ? 'first' : ''}`}>
                  <div className="game-when">
                    <span className="game-time">{when(m)}</span>
                    <span className="game-court">Court {m.court}</span>
                  </div>
                  <div className="game-what">
                    <span className="game-stage">{STAGE_LABEL[m.stage]}</span>
                    <b>vs {opp?.name ?? 'to be decided'}</b>
                    {opp && <small className="muted">{names(opp)}</small>}
                  </div>
                  <div className="game-status">
                    {before === 0 ? <span className="badge">Up next!</span> : <span className="muted small">{before} game block{before === 1 ? '' : 's'} before</span>}
                  </div>
                  {opp && (
                    <GameReport
                      match={m}
                      pairId={pair.id}
                      opponentName={opp.name}
                      report={reportOf(m)}
                      target={s.pointsPerGame}
                      act={act}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <p className="muted small">Times are planned times – games may start a bit earlier or later.</p>
      </section>

      {played.length > 0 && (
        <section className="panel">
          <h3>Played games</h3>
          <ul className="game-list">
            {played.map((m) => {
              const won = winnerOf(m) === pair.id
              const [us, them] = m.pairA === pair.id ? [m.scoreA, m.scoreB] : [m.scoreB, m.scoreA]
              return (
                <li key={m.id} className={`game ${won ? 'won' : 'lost'}`}>
                  <span className={`result ${won ? 'won' : 'lost'}`}>{won ? 'W' : 'L'}</span>
                  <div className="game-what">
                    <span className="game-stage">{STAGE_LABEL[m.stage]}</span>
                    <b>vs {opponent(m)?.name}</b>
                    <small className="muted">{names(opponent(m))}</small>
                  </div>
                  <span className="game-score">
                    {us}–{them}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3>Scoreboard</h3>
        <p className="muted small">Win = 1 point. Equal points → better ball difference. Top 2 → final, #3 & #4 → bronze match.</p>
        <div className="table-scroll">
          <Standings rows={standings} pairs={pairs} players={players} highlightRow={pair.id} />
        </div>
      </section>

      <p className={`live-note ${error ? 'warn' : 'muted'}`}>
        {error ? '⚠️ Connection lost – retrying…' : `🔄 Updates automatically · last update ${updatedAt?.toLocaleTimeString() ?? '–'}`}
      </p>
      <button className="btn-ghost small team-logout" onClick={onLogout}>
        🔒 Log out of this team page
      </button>
    </TeamShell>
  )
}

function Member({ player }: { player: Player }) {
  return (
    <div className="member">
      <Avatar name={player.name} />
      <div>
        <b>{player.name}</b> <span className="age">{player.age}</span>
        {player.quality && <div className="quality">✨ {player.quality}</div>}
      </div>
    </div>
  )
}
