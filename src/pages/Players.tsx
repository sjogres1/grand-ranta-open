import { useState } from 'react'
import type { Player, Tournament } from '../types'
import { Avatar } from '../components/Avatar'
import { RESET_PROGRAM, uid } from '../types'
import type { UpdateFn } from '../useTournament'
import { OVER_AGE, feasibilityProblems } from '../logic/pairing'

export const MIN_PLAYERS = 12

const QUALITIES = [
  'Can smash with eyes closed',
  'Brings a sauna whisk to every match',
  'Undefeated in rock-paper-scissors since 1994',
  'Plays best after the third coffee',
  'Claims to have invented the drop shot',
  'Talks to the shuttlecock',
  'Yells "MINE!" at every single shot',
  'Lucky socks, unwashed since the 90s',
  'Moonwalks after every won point',
  'Former ice-hockey goalie, dives for everything',
  'Knows every rule, ignores all of them',
  'Warms up with a 45-minute yoga flow',
  'Racket older than half of the players',
  'Distracts opponents with dad jokes',
  'Will bring pulla for everyone',
  'Stretches loudly',
]

const DEMO: Omit<Player, 'id'>[] = [
  { name: 'Mikko', age: 29, quality: 'Plays best after the third coffee' },
  { name: 'Pirjo', age: 63, quality: 'Racket older than half of the players' },
  { name: 'Aino', age: 38, quality: 'Former ice-hockey goalie, dives for everything' },
  { name: 'Raimo', age: 74, quality: 'Distracts opponents with dad jokes' },
  { name: 'Jenni', age: 26, quality: '' },
  { name: 'Heikki', age: 57, quality: 'Brings a sauna whisk to every match' },
  { name: 'Laura', age: 33, quality: 'Moonwalks after every won point' },
  { name: 'Timo', age: 48, quality: '' },
  { name: 'Sanna', age: 44, quality: 'Will bring pulla for everyone' },
  { name: 'Jukka', age: 35, quality: 'Yells "MINE!" at every single shot' },
  { name: 'Riitta', age: 66, quality: 'Warms up with a 45-minute yoga flow' },
  { name: 'Ville', age: 31, quality: '' },
  { name: 'Marja', age: 52, quality: 'Knows every rule, ignores all of them' },
  { name: 'Antti', age: 40, quality: 'Talks to the shuttlecock' },
  { name: 'Kaisa', age: 37, quality: '' },
  { name: 'Pekka', age: 70, quality: 'Lucky socks, unwashed since the 90s' },
]

interface Draft {
  name: string
  age: string
  quality: string
}
const EMPTY: Draft = { name: '', age: '', quality: '' }

export function Players({ state, update }: { state: Tournament; update: UpdateFn }) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const players = state.players

  /** Any change to the roster invalidates pairs and the program. */
  const changePlayers = (next: Player[]): boolean => {
    if (state.pairs.length > 0) {
      const ok = confirm('Pairs have already been drawn. Changing players will clear the pairs and the tournament program. Continue?')
      if (!ok) return false
    }
    update({ ...RESET_PROGRAM, players: next, pairs: [] })
    return true
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = draft.name.trim()
    const age = Number(draft.age)
    if (!name) return setError('Name is required')
    if (!draft.age || !Number.isInteger(age) || age < 5 || age > 110) return setError('Age must be a whole number between 5 and 110')
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingId)) {
      return setError(`There is already a player called ${name}`)
    }
    const player: Player = { id: editingId ?? uid(), name, age, quality: draft.quality.trim() }
    const next = editingId ? players.map((p) => (p.id === editingId ? player : p)) : [...players, player]
    if (changePlayers(next)) {
      setDraft(EMPTY)
      setEditingId(null)
      setError('')
    }
  }

  const edit = (p: Player) => {
    setEditingId(p.id)
    setDraft({ name: p.name, age: String(p.age), quality: p.quality })
    setError('')
  }

  const remove = (id: string) => changePlayers(players.filter((p) => p.id !== id))

  const addDemo = () => {
    const taken = new Set(players.map((p) => p.name.toLowerCase()))
    const extra = DEMO.filter((d) => !taken.has(d.name.toLowerCase())).map((d) => ({ ...d, id: uid() }))
    changePlayers([...players, ...extra])
  }

  const randomQuality = () => setDraft((d) => ({ ...d, quality: QUALITIES[Math.floor(Math.random() * QUALITIES.length)] }))

  const enough = players.length >= MIN_PLAYERS
  const even = players.length % 2 === 0
  const problems = enough && even ? feasibilityProblems(players) : []
  const canContinue = enough && even

  return (
    <div className="page">
      <div className="page-head">
        <h2>Add players</h2>
        <p className="muted">At least {MIN_PLAYERS} players, even number (it's doubles!). Planned for 16.</p>
      </div>

      <div className="players-layout">
        <form className="panel player-form" onSubmit={submit}>
          <h3>{editingId ? 'Edit player' : 'New player'}</h3>
          <label>
            Name
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Pirjo" autoFocus />
          </label>
          <label>
            Age
            <input type="number" min={5} max={110} value={draft.age} onChange={(e) => setDraft({ ...draft, age: e.target.value })} placeholder="e.g. 52" />
          </label>
          <label>
            Special quality <em className="muted">(optional, the sillier the better)</em>
            <div className="row">
              <input value={draft.quality} onChange={(e) => setDraft({ ...draft, quality: e.target.value })} placeholder="e.g. Talks to the shuttlecock" />
              <button type="button" className="btn-icon" title="Random idea" onClick={randomQuality}>
                🎲
              </button>
            </div>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn-primary" type="submit">
              {editingId ? 'Save changes' : '+ Add player'}
            </button>
            {editingId && (
              <button type="button" className="btn-ghost" onClick={() => { setEditingId(null); setDraft(EMPTY); setError('') }}>
                Cancel
              </button>
            )}
          </div>
          <hr />
          <button type="button" className="btn-ghost small" onClick={addDemo}>
            Fill with demo players (for testing)
          </button>
        </form>

        <div className="panel roster">
          <div className="roster-head">
            <h3>Roster</h3>
            <span className={`count ${enough && even ? 'ok' : ''}`}>
              {players.length} player{players.length === 1 ? '' : 's'}
            </span>
          </div>
          {players.length === 0 && <p className="muted empty">No players yet. Add the first one!</p>}
          <ul className="player-list">
            {players.map((p, i) => (
              <li key={p.id} className={editingId === p.id ? 'editing' : ''}>
                <span className="num">{i + 1}</span>
                <Avatar name={p.name} />
                <div className="pinfo">
                  <div>
                    <b>{p.name}</b>{' '}
                    <span className={`age ${p.age > OVER_AGE ? 'over' : ''}`}>{p.age}</span>
                  </div>
                  {p.quality && <div className="quality">✨ {p.quality}</div>}
                </div>
                <button className="btn-icon" title="Edit" onClick={() => edit(p)}>✏️</button>
                <button className="btn-icon" title="Remove" onClick={() => remove(p.id)}>🗑️</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bottom-bar">
        <div>
          {!enough && <span className="muted">Add {MIN_PLAYERS - players.length} more player(s) to continue.</span>}
          {enough && !even && <span className="warn">Odd number of players – add or remove one so everyone has a partner.</span>}
          {problems.map((p) => (
            <div key={p} className="warn">⚠️ {p} The shuffle will get as close as possible.</div>
          ))}
        </div>
        <button className="btn-primary big" disabled={!canContinue} onClick={() => update({ step: 'pairs' })}>
          Continue to pair shuffling →
        </button>
      </div>
    </div>
  )
}
