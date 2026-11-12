import { useMemo, useState } from 'react'
import type { Match, Pair, Player, Settings, Tournament } from '../types'
import { courtNumbersOf, DEFAULT_SETTINGS, MAX_POINTS, MIN_POINTS, RESET_PROGRAM } from '../types'
import type { ReportProps, UpdateFn } from '../useTournament'
import { reportFor } from '../../shared/reports.js'
import { buildRound1, buildRound2, finalSlotsNeeded, formatClock, planSchedule, slotTime, toMinutes, winnerOf } from '../logic/schedule'
import { buildFinals, computeStandings, isRoundRobin, reseedFinals } from '../logic/standings'
import { MatchCard } from '../components/MatchCard'
import { Standings } from '../components/Standings'
import { TeamLinks } from '../components/TeamLinks'
import { withNewPassword } from '../logic/pairing'

const played = (m: Match) => winnerOf(m) !== null

export function Schedule({ state, update, reports, clearReport }: { state: Tournament; update: UpdateFn } & ReportProps) {
  const r1 = state.matches.filter((m) => m.stage === 'round1')
  const r2 = state.matches.filter((m) => m.stage === 'round2')
  const finals = state.matches.filter((m) => !isRoundRobin(m))
  const [editingSettings, setEditingSettings] = useState(r1.length === 0)
  const [forceDecision, setForceDecision] = useState(false)

  const pairs = useMemo(() => new Map(state.pairs.map((p) => [p.id, p])), [state.pairs])
  const players = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players])
  const standings = useMemo(() => computeStandings(state.pairs, state.matches), [state.pairs, state.matches])
  const pairIds = state.pairs.map((p) => p.id)
  // fill in settings added in newer versions (e.g. pointsPerGame) for older saved data
  const s: Settings = { ...DEFAULT_SETTINGS, ...state.settings, courtNumbers: courtNumbersOf({ ...DEFAULT_SETTINGS, ...state.settings }) }

  const generate = (settings: Settings) => {
    if (state.matches.some((m) => m.scoreA !== null) && !confirm('This will delete all entered scores and create a new program. Continue?')) return
    const { matches, note } = buildRound1(pairIds, settings)
    update({ ...RESET_PROGRAM, settings, matches, scheduleNote: note })
    setEditingSettings(false)
  }

  const saveScore = (id: string, scoreA: number | null, scoreB: number | null) => {
    const changed = state.matches.map((m) => (m.id === id ? { ...m, scoreA, scoreB } : m))
    // Final/bronze participants follow the standings, so a corrected result may change them.
    const reseeded = reseedFinals(changed, computeStandings(state.pairs, changed))
    const wipesFinalScore = reseeded.some((m, i) => !isRoundRobin(m) && changed[i].scoreA !== null && m.scoreA === null)
    if (wipesFinalScore && !confirm('This result changes who plays in the final / bronze match, so their scores will be cleared. Continue?')) return
    update({ matches: reseeded })
    // the organizer's score decides – a team report for this game is no longer needed
    if (reports[id]) clearReport(id)
  }

  /* -------------------------------------------------------------- decisions */
  const phase: 'round1' | 'round2' | 'decided' = state.finals !== null ? 'decided' : state.secondRound ? 'round2' : 'round1'
  const current = phase === 'round1' ? r1 : r2
  const currentDone = current.length > 0 && current.every(played)
  const unplayed = current.filter((m) => !played(m)).length
  const showDecision = phase !== 'decided' && (currentDone || forceDecision)

  /** Unplayed games of the current round are dropped when the organizer decides early. */
  const withoutUnplayed = (): Match[] | null => {
    if (unplayed > 0 && !confirm(`${unplayed} game(s) of this round have no result. They will be removed from the program. Continue?`)) return null
    return state.matches.filter((m) => !(current.includes(m) && !played(m)))
  }

  const playRound2 = () => {
    const base = withoutUnplayed()
    if (!base) return
    update({ secondRound: true, matches: [...base, ...buildRound2(pairIds, s, base.filter((m) => m.stage === 'round1'))] })
    setForceDecision(false)
  }

  const goToFinals = (secondRound: boolean) => {
    const base = withoutUnplayed()
    if (!base) return
    const fin = buildFinals(computeStandings(state.pairs, base), base, s)
    update({ secondRound, finals: true, matches: [...base, ...fin], step: 'finals' })
  }

  const finishNow = () => {
    const base = withoutUnplayed()
    if (!base) return
    update({ finals: false, matches: base, step: 'finals' })
  }

  const cancelRound2 = () => update({ secondRound: null, matches: r1 })

  if (editingSettings) {
    return (
      <div className="page">
        <div className="page-head">
          <h2>Tournament program</h2>
          <p className="muted">
            Every game is a 2v2 game to {s.pointsPerGame} points. Round 1 is a round robin sized to your time, with time reserved for the
            final & bronze match. After round 1 you decide whether there is time for round 2.
          </p>
        </div>
        <SettingsForm initial={s} pairCount={state.pairs.length} onSubmit={generate} onCancel={r1.length ? () => setEditingSettings(false) : undefined} />
        <div className="bottom-bar">
          <button className="btn-ghost" onClick={() => update({ step: 'pairs' })}>
            ← Back to pairs
          </button>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ timing */
  const mpg = s.minutesPerGame
  const startMin = toMinutes(s.startTime)
  const deadline = startMin + s.totalMinutes
  // Games that stay in the program after a decision (unplayed games of the current round are dropped).
  const lastSlot = Math.max(-1, ...state.matches.filter((m) => isRoundRobin(m) && (played(m) || !current.includes(m))).map((m) => m.slot))
  const planEnd = startMin + (lastSlot + 1) * mpg
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  // On tournament day use the real clock; otherwise (e.g. testing) use the planned schedule.
  const useClock = nowMin >= startMin && nowMin <= deadline + 120
  const from = useClock ? nowMin : planEnd
  const r1Slots = new Set(r1.map((m) => m.slot)).size
  const finMin = finalSlotsNeeded(s.courts) * mpg
  const r2Min = r1Slots * mpg

  const nextSlot = [...state.matches]
    .filter((m) => isRoundRobin(m) && !played(m))
    .sort((a, b) => a.slot - b.slot)[0]?.slot

  return (
    <div className="page">
      <div className="page-head">
        <h2>Tournament program</h2>
        <p className="muted">{state.scheduleNote}</p>
        <div className="row wrap">
          <PointsPicker value={s.pointsPerGame} onChange={(pointsPerGame) => update({ settings: { ...s, pointsPerGame } })} />
          <span className="chip">🏟️ Courts {s.courtNumbers.join(', ')}</span>
          <span className="chip">⏱️ {mpg} min / game</span>
          <span className="chip">
            🕙 {s.startTime}–{formatClock(deadline)}
          </span>
          <span className="chip">{state.secondRound === null ? 'Round 2: not decided' : state.secondRound ? 'Round 2: yes' : 'Round 2: no'}</span>
          {r1.every((m) => m.scoreA === null) && (
            <button className="btn-ghost small" onClick={() => setEditingSettings(true)}>
              Change settings
            </button>
          )}
        </div>
      </div>

      {showDecision && phase === 'round1' && (
        <div className="decision panel">
          <h3>{currentDone ? '🎉 Round 1 complete! Is there time for round 2?' : '⏰ Decide what happens after round 1'}</h3>
          <TimeTable
            from={from}
            useClock={useClock}
            deadline={deadline}
            rows={[
              { label: 'Round 2 + final & bronze', minutes: r2Min + finMin },
              { label: 'Round 2, winner from standings', minutes: r2Min },
              { label: 'Final & bronze only (no round 2)', minutes: finMin },
            ]}
          />
          <div className="decision-options">
            <button className="option" onClick={playRound2}>
              <b>▶ Play round 2</b>
              <span>Same pairs, same rules{state.pairs.length > 2 ? ', every pair meets its opponents again' : ''}. Final & bronze can be decided afterwards.</span>
            </button>
            <button className="option" onClick={() => goToFinals(false)}>
              <b>🏆 No round 2 – go to final & bronze</b>
              <span>Final: #1 vs #2 · Bronze match: #3 vs #4 (based on round 1 standings).</span>
            </button>
          </div>
          {!currentDone && (
            <button className="btn-ghost small" onClick={() => setForceDecision(false)}>
              Not yet – keep playing
            </button>
          )}
        </div>
      )}

      {showDecision && phase === 'round2' && (
        <div className="decision panel">
          <h3>{currentDone ? '🎉 Round 2 complete! Final & bronze, or decide the winner now?' : '⏰ Finish round 2 early?'}</h3>
          <TimeTable from={from} useClock={useClock} deadline={deadline} rows={[{ label: 'Final & bronze match', minutes: finMin }]} />
          <div className="decision-options">
            <button className="option" onClick={() => goToFinals(true)}>
              <b>🏆 Play final & bronze match</b>
              <span>Final: #1 vs #2 · Bronze match: #3 vs #4 (based on rounds 1 + 2).</span>
            </button>
            <button className="option" onClick={finishNow}>
              <b>🧮 Finish now – winner from the standings</b>
              <span>Ranking by points from rounds 1 + 2, ties broken by ball difference.</span>
            </button>
          </div>
          {!currentDone && (
            <button className="btn-ghost small" onClick={() => setForceDecision(false)}>
              Not yet – keep playing
            </button>
          )}
        </div>
      )}

      <div className="schedule-layout">
        <div className="slots">
          <RoundSection
            title="Round 1"
            matches={r1}
            collapsible={r2.length > 0}
            settings={s}
            reports={reports}
            pairs={pairs}
            players={players}
            nextSlot={nextSlot}
            onSave={saveScore}
          />
          {r2.length > 0 && (
            <RoundSection
              title="Round 2"
              matches={r2}
              settings={s}
              reports={reports}
              pairs={pairs}
              players={players}
              nextSlot={nextSlot}
              onSave={saveScore}
              action={
                phase === 'round2' && r2.every((m) => m.scoreA === null) ? (
                  <button className="btn-ghost small" onClick={cancelRound2}>
                    Cancel round 2
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
        <aside className="panel standings-panel">
          <h3>Standings{r2.length ? ' · rounds 1 + 2' : ''}</h3>
          <p className="muted small">
            Win = 1 point, loss = 0. Equal points → better ball difference (balls won − balls lost). Top 2 → final, #3 & #4 →
            bronze match.
          </p>
          <Standings rows={standings} pairs={pairs} players={players} />
          {phase === 'decided' ? (
            <button className="btn-primary big full" onClick={() => update({ step: 'finals' })}>
              {state.finals ? 'Go to final & bronze →' : 'See the results →'}
            </button>
          ) : (
            !showDecision && (
              <button className="btn-secondary full" onClick={() => setForceDecision(true)}>
                ⏰ Out of time? Decide what's next…
              </button>
            )
          )}
          {finals.length > 0 && <p className="muted small">Final & bronze are on the next page.</p>}
          <TeamLinks
            pairs={state.pairs}
            players={players}
            onNewPassword={(pairId) => update((t) => ({ pairs: withNewPassword(t.pairs, pairId) }))}
          />
        </aside>
      </div>
    </div>
  )
}

const POINT_OPTIONS = Array.from({ length: MAX_POINTS - MIN_POINTS + 1 }, (_, i) => MAX_POINTS - i)

/** Points per game – can be changed any time; entered results stay as they are. */
function PointsPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="chip chip-select" title="Points needed to win a game. Can be changed any time.">
      🏸 Games to
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {POINT_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      points
    </label>
  )
}

function TimeTable({
  rows,
  from,
  useClock,
  deadline,
}: {
  rows: { label: string; minutes: number }[]
  from: number
  useClock: boolean
  deadline: number
}) {
  return (
    <div className="time-table">
      <p className="muted small">
        {useClock ? `Starting now (${formatClock(from)})` : `By the program (continuing at ${formatClock(from)})`} · time is up at{' '}
        <b>{formatClock(deadline)}</b>
      </p>
      {rows.map((r) => {
        const end = from + r.minutes
        const over = end - deadline
        return (
          <div key={r.label} className={`time-row ${over > 0 ? 'over' : 'fits'}`}>
            <span>{r.label}</span>
            <span>≈ {r.minutes} min</span>
            <span>ends {formatClock(end)}</span>
            <span>{over > 0 ? `⚠️ ${over} min over` : '✅ fits'}</span>
          </div>
        )
      })}
    </div>
  )
}

function RoundSection({
  title,
  matches,
  settings,
  reports,
  pairs,
  players,
  nextSlot,
  onSave,
  action,
  collapsible = false,
}: {
  title: string
  matches: Match[]
  /** A finished round starts collapsed when a later round exists. */
  collapsible?: boolean
  settings: Settings
  reports: ReportProps['reports']
  pairs: Map<string, Pair>
  players: Map<string, Player>
  nextSlot: number | undefined
  onSave: (id: string, a: number | null, b: number | null) => void
  action?: React.ReactNode
}) {
  const slots = new Map<number, Match[]>()
  for (const m of matches) slots.set(m.slot, [...(slots.get(m.slot) ?? []), m])
  const done = matches.filter(played).length
  const [open, setOpen] = useState(!(collapsible && done === matches.length))
  return (
    <section className="round">
      <div className="round-head">
        <h3>{title}</h3>
        <div className="progress" title={`${done}/${matches.length} games played`}>
          <div style={{ width: `${(done / Math.max(1, matches.length)) * 100}%` }} />
          <span>
            {done}/{matches.length} games played
          </span>
        </div>
        {action}
        <button className="btn-ghost small" onClick={() => setOpen(!open)}>
          {open ? 'Hide games ▴' : `Show ${matches.length} games ▾`}
        </button>
      </div>
      {open && [...slots.entries()].map(([slot, ms]) => (
        <div key={slot} className={`slot ${slot === nextSlot ? 'next' : ''}`}>
          <h4>
            <span className="time">{slotTime(settings.startTime, slot, settings.minutesPerGame)}</span>
            Game block {slot + 1}
            {slot === nextSlot && <span className="badge">Up next</span>}
          </h4>
          <div className="slot-matches">
            {ms.map((m) => (
              <MatchCard key={m.id} match={m} report={reportFor(m, reports)} target={settings.pointsPerGame} pairs={pairs} players={players} onSave={(a, b) => onSave(m.id, a, b)} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function SettingsForm({
  initial,
  pairCount,
  onSubmit,
  onCancel,
}: {
  initial: Settings
  pairCount: number
  onSubmit: (s: Settings) => void
  onCancel?: () => void
}) {
  const [s, setS] = useState(initial)
  const [courtError, setCourtError] = useState('')
  const plan = planSchedule(pairCount, s)
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Math.max(1, Number(e.target.value) || 1) })
  const r1 = plan.roundSlots * s.minutesPerGame
  const fin = plan.finalSlots * s.minutesPerGame
  const fullR1 = (() => {
    const full = planSchedule(pairCount, { ...s, totalMinutes: 100000 })
    return full.roundSlots * s.minutesPerGame
  })()
  const withRound2 = 2 * r1 + fin

  return (
    <form
      className="panel settings"
      onSubmit={(e) => {
        e.preventDefault()
        if (new Set(s.courtNumbers).size !== s.courtNumbers.length) {
          setCourtError('Each court must have a unique number.')
          return
        }
        onSubmit({ ...s, courtNumbers: courtNumbersOf(s) })
      }}
    >
      <div className="settings-grid">
        <label>
          Points per game
          <select value={s.pointsPerGame} onChange={(e) => setS({ ...s, pointsPerGame: Number(e.target.value) })}>
            {POINT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p} points{p === 21 ? ' (standard)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Courts available
          <input
            type="number"
            min={1}
            max={10}
            value={s.courts}
            onChange={(e) => {
              const courts = Math.max(1, Math.min(10, Number(e.target.value) || 1))
              setS({ ...s, courts, courtNumbers: courtNumbersOf({ ...s, courts }) })
              setCourtError('')
            }}
          />
        </label>
        {Array.from({ length: s.courts }, (_, index) => (
          <label key={index}>
            Court {index + 1} number
            <input
              type="number"
              min={1}
              step={1}
              required
              value={s.courtNumbers[index]}
              aria-label={`Court ${index + 1} number`}
              onChange={(e) => {
                const courtNumbers = [...s.courtNumbers]
                courtNumbers[index] = Math.max(1, Math.floor(Number(e.target.value) || 1))
                setS({ ...s, courtNumbers })
                setCourtError('')
              }}
            />
          </label>
        ))}
        <label>
          Minutes per game (to {s.pointsPerGame})
          <input type="number" min={5} max={40} value={s.minutesPerGame} onChange={num('minutesPerGame')} />
        </label>
        <label>
          Total time available (min)
          <input type="number" min={30} step={15} value={s.totalMinutes} onChange={num('totalMinutes')} />
        </label>
        <label>
          Start time
          <input type="time" value={s.startTime} onChange={(e) => setS({ ...s, startTime: e.target.value || '10:00' })} />
        </label>
      </div>
      {courtError && <p className="error">{courtError}</p>}
      <div className={`plan ${plan.fullRoundRobin ? 'good' : 'partial'}`}>
        {plan.fullRoundRobin ? (
          <>
            ✅ <b>Round 1: everyone plays everyone.</b> {pairCount} pairs → {plan.roundGames} games ≈ {r1} min, plus final & bronze ≈ {fin} min.
          </>
        ) : (
          <>
            ⏳ <b>Not enough time for a full round robin</b> ({fullR1} min needed). Round 1 fits{' '}
            <b>
              {plan.rotationsUsed} of {plan.totalRotations}
            </b>{' '}
            rotations – each pair meets {plan.rotationsUsed} different opponents ({plan.roundGames} games ≈ {r1} min), plus final & bronze ≈ {fin} min.
          </>
        )}
        <div className={withRound2 <= s.totalMinutes ? 'good-text' : 'muted'}>
          {withRound2 <= s.totalMinutes
            ? `👍 Round 2 looks possible too: round 1 + round 2 + final & bronze ≈ ${withRound2} min.`
            : `Round 2 would need ≈ ${withRound2} min in total (round 1 + round 2 + final & bronze) – you'll decide after round 1.`}
        </div>
        {s.pointsPerGame < 21 && (
          <div className="muted">
            💡 Games to {s.pointsPerGame} are shorter – roughly {Math.max(5, Math.round((s.minutesPerGame * s.pointsPerGame) / 21))} min instead of{' '}
            {s.minutesPerGame} if your minutes are set for 21-point games.
          </div>
        )}
        {r1 + fin > s.totalMinutes && <div className="warn">⚠️ Even the smallest round 1 + final takes longer than the time available.</div>}
      </div>
      <div className="row">
        <button className="btn-primary big" type="submit">
          📋 Generate program
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
