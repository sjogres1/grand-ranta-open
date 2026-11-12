import type { Match, Pair, Settings } from '../types'
import { courtNumbersOf, uid } from '../types'
import { finalSlotsNeeded, loserOf, winnerOf } from './schedule'

export interface StandingRow {
  pairId: string
  played: number
  wins: number
  losses: number
  /** 1 point per won game, 0 for a loss. */
  points: number
  ballsFor: number
  ballsAgainst: number
  /** Ball difference: balls won − balls lost. */
  diff: number
}

export const isRoundRobin = (m: Match) => m.stage === 'round1' || m.stage === 'round2'

/**
 * Combined standings over round 1 and round 2.
 * Ranking: points → ball difference → balls won (last resort).
 */
export function computeStandings(pairs: Pair[], matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    pairs.map((p) => [p.id, { pairId: p.id, played: 0, wins: 0, losses: 0, points: 0, ballsFor: 0, ballsAgainst: 0, diff: 0 }]),
  )
  for (const m of matches) {
    if (!isRoundRobin(m) || !m.pairA || !m.pairB) continue
    const w = winnerOf(m)
    const a = rows.get(m.pairA)
    const b = rows.get(m.pairB)
    if (!w || !a || !b) continue
    a.played++
    b.played++
    a.ballsFor += m.scoreA!
    a.ballsAgainst += m.scoreB!
    b.ballsFor += m.scoreB!
    b.ballsAgainst += m.scoreA!
    const [winner, loser] = w === m.pairA ? [a, b] : [b, a]
    winner.wins++
    winner.points++
    loser.losses++
  }
  const list = [...rows.values()]
  list.forEach((r) => (r.diff = r.ballsFor - r.ballsAgainst))
  return list.sort((x, y) => y.points - x.points || y.diff - x.diff || y.ballsFor - x.ballsFor)
}

/** Final: #1 vs #2, bronze match: #3 vs #4. Played right after the last round-robin game. */
export function buildFinals(standings: StandingRow[], roundRobinMatches: Match[], s: Settings): Match[] {
  const top = standings.slice(0, 4).map((r) => r.pairId)
  const start = roundRobinMatches.reduce((m, x) => Math.max(m, x.slot + 1), 0)
  const courtNumbers = courtNumbersOf(s)
  const together = finalSlotsNeeded(courtNumbers.length) === 1
  const base = { rotation: 0, scoreA: null, scoreB: null }
  return [
    // With one court the bronze match goes first so the final is the last game of the day.
    { ...base, id: uid(), stage: 'bronze', label: 'Bronze match (#3 vs #4)', slot: start, court: together ? courtNumbers[1] : courtNumbers[0], pairA: top[2] ?? null, pairB: top[3] ?? null },
    { ...base, id: uid(), stage: 'final', label: 'Final (#1 vs #2)', slot: together ? start : start + 1, court: courtNumbers[0], pairA: top[0] ?? null, pairB: top[1] ?? null },
  ]
}

/** Keep final/bronze participants in sync with the standings (e.g. after a corrected result). */
export function reseedFinals(matches: Match[], standings: StandingRow[]): Match[] {
  const top = standings.slice(0, 4).map((r) => r.pairId)
  return matches.map((m) => {
    const want = m.stage === 'final' ? [top[0], top[1]] : m.stage === 'bronze' ? [top[2], top[3]] : null
    if (!want || (m.pairA === want[0] && m.pairB === want[1])) return m
    return { ...m, pairA: want[0] ?? null, pairB: want[1] ?? null, scoreA: null, scoreB: null }
  })
}

/**
 * Final placing of every pair. With final & bronze played: places 1–4 come from those games,
 * the rest from the standings. Without: straight from the standings.
 */
export function finalRanking(standings: StandingRow[], matches: Match[]): string[] {
  const order = standings.map((r) => r.pairId)
  const final = matches.find((m) => m.stage === 'final')
  const bronze = matches.find((m) => m.stage === 'bronze')
  const top: string[] = []
  if (final && winnerOf(final)) top.push(winnerOf(final)!, loserOf(final)!)
  if (bronze && winnerOf(bronze)) top.push(winnerOf(bronze)!, loserOf(bronze)!)
  if (top.length !== 4) return order
  return [...top, ...order.filter((id) => !top.includes(id))]
}
