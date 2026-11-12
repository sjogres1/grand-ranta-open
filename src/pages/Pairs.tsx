import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, Tournament } from '../types'
import { RESET_PROGRAM } from '../types'
import type { UpdateFn } from '../useTournament'
import { OVER_AGE, generatePairs, pairAverage, pairViolations, statsFor, withNewPassword } from '../logic/pairing'
import { Avatar } from '../components/Avatar'
import { TeamInvite } from '../components/TeamInvite'
import { useTeamBaseUrl } from '../useTeamBaseUrl'

export function Pairs({ state, update }: { state: Tournament; update: UpdateFn }) {
  const [shuffling, setShuffling] = useState(false)
  const { base } = useTeamBaseUrl()
  const byId = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players])
  const tuples = state.pairs.map((pr) => pr.playerIds.map((id) => byId.get(id)!) as [Player, Player])
  const stats = tuples.length ? statsFor(tuples) : null

  const shuffle = () => {
    const hasScores = state.matches.some((m) => m.scoreA !== null)
    if (hasScores && !confirm('Scores have already been entered. Reshuffling will delete the tournament program. Continue?')) return
    setShuffling(true)
    window.setTimeout(() => {
      const { pairs } = generatePairs(state.players)
      update({ ...RESET_PROGRAM, pairs })
      setShuffling(false)
    }, 900)
  }

  const autoShuffled = useRef(false)
  useEffect(() => {
    if (autoShuffled.current) return
    autoShuffled.current = true
    if (state.pairs.length === 0 && state.players.length >= 2) shuffle()
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <h2>Pair shuffling</h2>
        <p className="muted">
          Players are paired randomly. The shuffle tries to place at most one player over {OVER_AGE} in each pair.
        </p>
      </div>

      {stats && !shuffling && (
        <div className="stats">
          <div className="stat">
            <span className="stat-num">{state.pairs.length}</span>
            <span className="stat-label">pairs</span>
          </div>
          <div className="stat">
            <span className="stat-num">
              {stats.min.toFixed(1)}–{stats.max.toFixed(1)}
            </span>
            <span className="stat-label">pair average ages</span>
          </div>
          <div className="stat">
            <span className="stat-num">{stats.spread.toFixed(1)} y</span>
            <span className="stat-label">
              difference between oldest & youngest pair average (informational)
            </span>
          </div>
          <div className={`stat ${stats.violations ? 'bad' : 'good'}`}>
            <span className="stat-num">{stats.violations ? `⚠️ ${stats.violations}` : '✅'}</span>
            <span className="stat-label">{stats.violations ? 'pairs with two players over 40' : 'no pairs have two players over 40'}</span>
          </div>
        </div>
      )}

      <div className={`pair-grid ${shuffling ? 'shuffling' : ''}`}>
        {shuffling
          ? Array.from({ length: state.players.length / 2 }, (_, i) => (
              <div key={i} className="pair-card placeholder" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="spin">🏸</span>
              </div>
            ))
          : state.pairs.map((pr, i) => {
              const [a, b] = tuples[i]
              const issues = pairViolations(a, b)
              return (
                <div key={pr.id} className={`pair-card ${issues.length ? 'invalid' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="pair-top">
                    <span className="pair-name">{pr.name}</span>
                    <span className="pair-avg" title="Average age">⌀ {pairAverage(a, b).toFixed(1)}</span>
                  </div>
                  {[a, b].map((p) => (
                    <div key={p.id} className="pair-player">
                      <Avatar name={p.name} />
                      <div>
                        <b>{p.name}</b> <span className={`age ${p.age > OVER_AGE ? 'over' : ''}`}>{p.age}</span>
                        {p.quality && <div className="quality">✨ {p.quality}</div>}
                      </div>
                    </div>
                  ))}
                  {issues.map((x) => (
                    <div key={x} className="issue">⚠️ {x}</div>
                  ))}
                  <div className="pair-invite">
                    <TeamInvite
                      pair={pr}
                      names={`${a.name} & ${b.name}`}
                      base={base}
                      onNewPassword={() => update((t) => ({ pairs: withNewPassword(t.pairs, pr.id) }))}
                    />
                  </div>
                </div>
              )
            })}
      </div>

      <div className="bottom-bar">
        <button className="btn-ghost" onClick={() => update({ step: 'players' })}>
          ← Back to players
        </button>
        <div className="row wrap">
          <button className="btn-secondary big" onClick={() => shuffle()} disabled={shuffling}>
            🎲 Shuffle again
          </button>
          <button className="btn-primary big" disabled={shuffling || !state.pairs.length} onClick={() => update({ step: 'schedule' })}>
            Lock pairs & build program →
          </button>
        </div>
      </div>
    </div>
  )
}
