import type { Tournament } from '../types'
import type { Reports } from '../../shared/reports.js'
import { applyReports } from '../../shared/reports.js'
import { computeStandings, reseedFinals } from './standings'

/**
 * Organizer app: copy scores that both teams agreed on into the tournament.
 * Returns null when nothing changed. Final/bronze participants follow the standings, as when the
 * organizer types a score.
 */
export function mergeAcceptedReports(t: Tournament, reports: Reports): Tournament | null {
  const applied = applyReports(t, reports)
  const changed = applied.matches.some((m, i) => m.scoreA !== t.matches[i].scoreA || m.scoreB !== t.matches[i].scoreB)
  if (!changed) return null
  return { ...t, matches: reseedFinals(applied.matches, computeStandings(t.pairs, applied.matches)) }
}
