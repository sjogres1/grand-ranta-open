import { useMemo } from 'react'
import type { Tournament } from '../types'
import type { ReportProps, UpdateFn } from '../useTournament'
import { reportFor } from '../../shared/reports.js'
import { slotTime, winnerOf } from '../logic/schedule'
import { computeStandings, finalRanking, isRoundRobin } from '../logic/standings'
import { MatchCard } from '../components/MatchCard'
import { Standings } from '../components/Standings'
import { VictorySounds } from '../components/VictorySounds'

const MEDALS = ['🥇', '🥈', '🥉']

export function Finals({ state, update, reports, clearReport }: { state: Tournament; update: UpdateFn } & ReportProps) {
  const pairs = useMemo(() => new Map(state.pairs.map((p) => [p.id, p])), [state.pairs])
  const players = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players])
  const standings = useMemo(() => computeStandings(state.pairs, state.matches), [state.pairs, state.matches])
  const final = state.matches.find((m) => m.stage === 'final')
  const bronze = state.matches.find((m) => m.stage === 'bronze')

  const finished = state.finals === false || Boolean(final && bronze && winnerOf(final) && winnerOf(bronze))
  const ranking = finalRanking(standings, state.matches)
  const rows = ranking.map((id) => standings.find((r) => r.pairId === id)!)
  const champion = finished ? ranking[0] : null
  const rounds = state.secondRound ? 'rounds 1 + 2' : 'round 1'

  const save = (id: string, scoreA: number | null, scoreB: number | null) => {
    update((t) => ({ matches: t.matches.map((m) => (m.id === id ? { ...m, scoreA, scoreB } : m)) }))
    // the organizer's score decides – a team report for this game is no longer needed
    if (reports[id]) clearReport(id)
  }

  const time = (slot: number) => slotTime(state.settings.startTime, slot, state.settings.minutesPerGame)
  const names = (id: string | null | undefined) =>
    id ? pairs.get(id)?.playerIds.map((pid) => players.get(pid)?.name).join(' & ') : '—'

  const finalsStarted = [final, bronze].some((m) => m && m.scoreA !== null)
  const undo = () => {
    if (finalsStarted && !confirm('Final / bronze results will be deleted. Continue?')) return
    update((t) => ({
      matches: t.matches.filter(isRoundRobin),
      finals: null,
      secondRound: t.secondRound === false ? null : t.secondRound,
      step: 'schedule',
    }))
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>{state.finals ? 'Final & bronze match' : 'Results'}</h2>
        <p className="muted">
          {state.finals
            ? `Final: #1 vs #2 · Bronze match: #3 vs #4, seeded from the standings after ${rounds}.`
            : `No final played – the winner is decided by the standings after ${rounds}: points first, then ball difference.`}
        </p>
      </div>

      {champion && (
        <div className="champion">
          <div className="confetti" aria-hidden>
            {Array.from({ length: 40 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.25}s`, background: ['#c6ff3d', '#ff4d6d', '#4cc9f0', '#ffd166'][i % 4] }} />
            ))}
          </div>
          <VictorySounds />
          <div className="trophy">🏆</div>
          <h2>{pairs.get(champion)?.name}</h2>
          <p className="champ-names">{names(champion)}</p>
          <p className="muted">Grand Räntä Open champions!</p>
          <div className="podium">
            {ranking.slice(0, 3).map((id, i) => (
              <div key={id} className="podium-step">
                <span className="medal">{MEDALS[i]}</span>
                <b>{pairs.get(id)?.name}</b>
                <small>{names(id)}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.finals && (
        <div className="bracket">
          {final && (
            <MatchCard match={final} report={reportFor(final, reports)} target={state.settings.pointsPerGame ?? 21} pairs={pairs} players={players} title={`🏆 Final (#1 vs #2) · ${time(final.slot)} · Court ${final.court}`} onSave={(a, b) => save(final.id, a, b)} />
          )}
          {bronze && (
            <MatchCard match={bronze} report={reportFor(bronze, reports)} target={state.settings.pointsPerGame ?? 21} pairs={pairs} players={players} title={`🥉 Bronze match (#3 vs #4) · ${time(bronze.slot)} · Court ${bronze.court}`} onSave={(a, b) => save(bronze.id, a, b)} />
          )}
        </div>
      )}

      <div className="panel">
        <h3>{finished ? 'Final ranking' : `Standings after ${rounds}`}</h3>
        <p className="muted small">
          {finished && state.finals
            ? 'Places 1–4 from the final and bronze match, the rest from the standings.'
            : 'Win = 1 point. Equal points → better ball difference (balls won − balls lost).'}
        </p>
        <Standings
          rows={finished ? rows : standings}
          pairs={pairs}
          players={players}
          highlightFinalists={!finished}
          placeLabel={finished ? (i) => MEDALS[i] ?? String(i + 1) : undefined}
        />
      </div>

      <div className="bottom-bar">
        <button className="btn-ghost" onClick={() => update({ step: 'schedule' })}>
          ← Program & standings
        </button>
        <button className="btn-ghost small" onClick={undo}>
          {state.finals ? 'Undo: remove final & bronze match' : 'Undo: decide again'}
        </button>
      </div>
    </div>
  )
}
