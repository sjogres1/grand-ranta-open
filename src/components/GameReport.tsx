import { useState } from 'react'
import type { Match, ScoreReport } from '../types'
import type { ReportActionInput } from '../../shared/reports.js'
import { maxScore, scoreError } from '../logic/schedule'

interface Props {
  match: Match
  /** this team */
  pairId: string
  opponentName: string
  /** the report for this game, if any */
  report: ScoreReport | null
  /** points per game */
  target: number
  act: (action: ReportActionInput) => Promise<string | null>
}

/**
 * Team page: report the score of a game, or accept / reject the score the other team reported.
 * A score only counts once the other team accepts it.
 */
export function GameReport({ match, pairId, opponentName, report, target, act }: Props) {
  const [open, setOpen] = useState(false)
  const [us, setUs] = useState('')
  const [them, setThem] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const weAreA = match.pairA === pairId
  const ours = (r: ScoreReport) => (weAreA ? r.scoreA : r.scoreB)
  const theirs = (r: ScoreReport) => (weAreA ? r.scoreB : r.scoreA)

  const run = async (action: ReportActionInput) => {
    setBusy(true)
    setError('')
    const err = await act(action)
    setBusy(false)
    if (err) setError(err)
    else setOpen(false)
    return !err
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const a = us === '' ? null : Number(us)
    const b = them === '' ? null : Number(them)
    const err = scoreError(a, b, target)
    if (err) return setError(err)
    if (await run({ type: 'report', matchId: match.id, us: a!, them: b! })) {
      setUs('')
      setThem('')
    }
  }

  const form = (
    <form className="report-form" onSubmit={send}>
      <div className="report-inputs">
        <label>
          <span>Us</span>
          <input inputMode="numeric" value={us} onChange={(e) => setUs(e.target.value.replace(/\D/g, ''))} placeholder="0" aria-label="Our score" />
        </label>
        <span className="report-dash">–</span>
        <label>
          <span>{opponentName}</span>
          <input inputMode="numeric" value={them} onChange={(e) => setThem(e.target.value.replace(/\D/g, ''))} placeholder="0" aria-label="Their score" />
        </label>
      </div>
      <p className="muted small">
        First to {target} (max {maxScore(target)}). {opponentName} must accept the score before it counts.
      </p>
      <div className="row">
        <button className="btn-primary small" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send for approval'}
        </button>
        <button type="button" className="btn-ghost small" onClick={() => { setOpen(false); setError('') }}>
          Cancel
        </button>
      </div>
    </form>
  )

  const errorLine = error && <p className="error small">{error}</p>

  // The other team reported – we decide.
  if (report?.status === 'pending' && report.by !== pairId) {
    const won = ours(report) > theirs(report)
    return (
      <div className="game-report confirm">
        <p>
          🔔 <b>{opponentName}</b> reported the score:
        </p>
        <p className="report-score">
          Us <b>{ours(report)}</b> – <b>{theirs(report)}</b> {opponentName}
          <span className={`result ${won ? 'won' : 'lost'}`}>{won ? 'W' : 'L'}</span>
        </p>
        <p className="muted small">Is this correct? The score counts when you accept it.</p>
        <div className="row">
          <button className="btn-primary small" disabled={busy} onClick={() => run({ type: 'accept', matchId: match.id })}>
            ✓ Accept
          </button>
          <button className="btn-ghost small" disabled={busy} onClick={() => run({ type: 'reject', matchId: match.id })}>
            ✗ Not correct
          </button>
        </div>
        {errorLine}
      </div>
    )
  }

  // We reported – waiting for the other team.
  if (report?.status === 'pending' && report.by === pairId) {
    return (
      <div className="game-report waiting">
        <p>
          ⏳ You sent <b>{ours(report)}–{theirs(report)}</b>. Waiting for <b>{opponentName}</b> to accept…
        </p>
        <button className="link-btn" disabled={busy} onClick={() => run({ type: 'cancel', matchId: match.id })}>
          Withdraw
        </button>
        {errorLine}
      </div>
    )
  }

  const rejected =
    report?.status === 'rejected' &&
    (report.by === pairId
      ? `❌ ${opponentName} did not accept your score ${ours(report)}–${theirs(report)}. Check it with them and send the correct one.`
      : `You rejected ${opponentName}'s score ${ours(report)}–${theirs(report)}. Send the correct score:`)

  return (
    <div className={`game-report ${rejected ? 'rejected' : ''}`}>
      {rejected && <p className="small">{rejected}</p>}
      {open || rejected ? (
        form
      ) : (
        <button className="btn-secondary small" onClick={() => setOpen(true)}>
          📝 Report result
        </button>
      )}
      {errorLine}
    </div>
  )
}
