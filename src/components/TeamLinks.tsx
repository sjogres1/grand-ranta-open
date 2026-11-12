import type { Pair, Player } from '../types'
import { useTeamBaseUrl } from '../useTeamBaseUrl'
import { TeamInvite } from './TeamInvite'

interface Props {
  pairs: Pair[]
  players: Map<string, Player>
  /** Give one team a new random password (e.g. if it leaked). */
  onNewPassword: (pairId: string) => void
}

/** Organizer panel: each team's page link and password (hidden until revealed), for sharing with players. */
export function TeamLinks({ pairs, players, onNewPassword }: Props) {
  const { base, lanHint } = useTeamBaseUrl()
  if (pairs.length === 0) return null

  return (
    <details className="team-links">
      <summary>📱 Team pages & passwords</summary>
      <p className="muted small">
        Each team follows its next games and the scoreboard on its own page, which asks for the team's password once. Passwords
        stay hidden until you click <b>Show</b> – handy when this screen is visible to everyone.
        {lanHint && (
          <>
            {' '}
            <code>localhost</code> only works on this laptop. For phones on the same Wi-Fi, run <code>npm start</code> – links then use{' '}
            <code>
              http://{lanHint.ip}:{lanHint.port}
            </code>
            .
          </>
        )}
      </p>
      <ul>
        {pairs.map((p) => {
          const names = p.playerIds.map((id) => players.get(id)?.name).join(' & ')
          return (
            <li key={p.id}>
              <b>{p.name}</b>
              <small className="muted">{names}</small>
              <TeamInvite pair={p} names={names} base={base} onNewPassword={() => onNewPassword(p.id)} />
            </li>
          )
        })}
      </ul>
    </details>
  )
}
