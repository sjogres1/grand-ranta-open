import type { Pair, Player } from '../types'
import type { StandingRow } from '../logic/standings'
import { TeamLabel } from './MatchCard'

interface Props {
  rows: StandingRow[]
  pairs: Map<string, Pair>
  players: Map<string, Player>
  /** Highlight the top 4 (final + bronze match spots). */
  highlightFinalists?: boolean
  /** Optional custom place labels, e.g. medals on the results page. */
  placeLabel?: (index: number) => string
  /** Pair to highlight (team pages). */
  highlightRow?: string
}

export function Standings({ rows, pairs, players, highlightFinalists = true, placeLabel, highlightRow }: Props) {
  return (
    <table className="standings">
      <thead>
        <tr>
          <th>#</th>
          <th className="left">Pair</th>
          <th title="Games played">P</th>
          <th title="Wins">W</th>
          <th title="Losses">L</th>
          <th title="Points: 1 per win">Pts</th>
          <th title="Balls won – balls lost">Balls</th>
          <th title="Ball difference (tie-breaker)">+/-</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.pairId}
            className={`${highlightFinalists ? (i < 2 ? 'final-spot' : i < 4 ? 'bronze-spot' : '') : ''} ${r.pairId === highlightRow ? 'mine' : ''}`}
          >
            <td className="place">{placeLabel ? placeLabel(i) : i + 1}</td>
            <td className="left">
              <TeamLabel pair={pairs.get(r.pairId)} players={players} />
            </td>
            <td>{r.played}</td>
            <td>{r.wins}</td>
            <td>{r.losses}</td>
            <td className="strong">{r.points}</td>
            <td className="muted">
              {r.ballsFor}–{r.ballsAgainst}
            </td>
            <td className={r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
