import { useEffect, useState } from 'react'
import type { Match, Pair, Player, ScoreReport } from '../types'
import { maxScore, scoreError, winnerOf } from '../logic/schedule'

interface Props {
  match: Match
  pairs: Map<string, Pair>
  players: Map<string, Player>
  onSave: (scoreA: number | null, scoreB: number | null) => void
  title?: string
  /** Points needed to win (11–21). */
  target: number
  /** Score reported from a team page for this game, if any. */
  report?: ScoreReport | null
}

export function TeamLabel({ pair, players }: { pair: Pair | undefined; players: Map<string, Player> }) {
  if (!pair) return <span className="muted">To be decided</span>
  return (
    <span className="team-label">
      <b>{pair.name}</b>
      <small>{pair.playerIds.map((id) => players.get(id)?.name ?? '?').join(' & ')}</small>
    </span>
  )
}

export function MatchCard({ match, pairs, players, onSave, title, target, report }: Props) {
  const done = winnerOf(match) !== null
  const [editing, setEditing] = useState(!done)
  const [a, setA] = useState(match.scoreA?.toString() ?? '')
  const [b, setB] = useState(match.scoreB?.toString() ?? '')
  const [error, setError] = useState('')

  useEffect(() => {
    setA(match.scoreA?.toString() ?? '')
    setB(match.scoreB?.toString() ?? '')
    setEditing(winnerOf(match) === null)
  }, [match.scoreA, match.scoreB, match.pairA, match.pairB])

  const ready = match.pairA && match.pairB
  const winner = winnerOf(match)
  const showInputs = Boolean(ready) && (editing || !done)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const na = a === '' ? null : Number(a)
    const nb = b === '' ? null : Number(b)
    const err = scoreError(na, nb, target)
    if (err) return setError(err)
    setError('')
    onSave(na, nb)
    setEditing(false)
  }

  return (
    <form className={`match-card ${done ? 'done' : ''} ${!ready ? 'pending' : ''}`} onSubmit={save}>
      <div className="match-meta">
        <span>{title ?? `Court ${match.court}`}</span>
        {match.rotation > 0 && <span className="muted">Rotation {match.rotation}</span>}
      </div>
      <div className="match-body">
        <div className={`side ${winner && winner === match.pairA ? 'win' : ''}`}>
          <TeamLabel pair={match.pairA ? pairs.get(match.pairA) : undefined} players={players} />
        </div>
        <div className="score">
          {showInputs ? (
            <>
              <input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} placeholder="0" aria-label="Score team A" />
              <span>–</span>
              <input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} placeholder="0" aria-label="Score team B" />
            </>
          ) : done ? (
            <button type="button" className="final-score" title="Click to edit" onClick={() => setEditing(true)}>
              {match.scoreA} – {match.scoreB}
            </button>
          ) : (
            <span className="muted">vs</span>
          )}
        </div>
        <div className={`side right ${winner && winner === match.pairB ? 'win' : ''}`}>
          <TeamLabel pair={match.pairB ? pairs.get(match.pairB) : undefined} players={players} />
        </div>
      </div>
      {report && <ReportNote match={match} report={report} pairs={pairs} done={done} onApprove={() => onSave(report.scoreA, report.scoreB)} />}
      {showInputs && (
        <div className="match-actions">
          {error ? <span className="error">{error}</span> : <span className="muted small">First to {target} (max {maxScore(target)})</span>}
          <div className="row">
            {done && (
              <button type="button" className="btn-ghost small" onClick={() => { setEditing(false); setError('') }}>
                Cancel
              </button>
            )}
            {done && (
              <button type="button" className="btn-ghost small" onClick={() => onSave(null, null)}>
                Clear
              </button>
            )}
            <button type="submit" className="btn-primary small">Save</button>
          </div>
        </div>
      )}
    </form>
  )
}

/** Organizer view of a score reported from the team pages. */
function ReportNote({
  match,
  report,
  pairs,
  done,
  onApprove,
}: {
  match: Match
  report: ScoreReport
  pairs: Map<string, Pair>
  done: boolean
  onApprove: () => void
}) {
  const name = (id: string) => pairs.get(id)?.name ?? '?'
  const by = name(report.by)
  const other = name(report.by === match.pairA ? match.pairB ?? '' : match.pairA ?? '')
  const score = `${report.scoreA}–${report.scoreB}`
  if (report.status === 'accepted') {
    return done && match.scoreA === report.scoreA && match.scoreB === report.scoreB ? (
      <p className="report-note ok">📱 Reported by {by}, accepted by {other}</p>
    ) : null
  }
  if (done) return null
  return (
    <div className={`report-note ${report.status}`}>
      <span>
        {report.status === 'pending' ? (
          <>
            ⏳ <b>{by}</b> reported <b>{score}</b> – waiting for {other} to accept
          </>
        ) : (
          <>
            ⚠️ {other} rejected <b>{by}</b>'s score <b>{score}</b> – check with the teams
          </>
        )}
      </span>
      <button type="button" className="btn-ghost small" onClick={onApprove} title="Save this score now as the organizer">
        Approve {score}
      </button>
    </div>
  )
}
