// Score reports from team pages: one team reports a game's score, the other team accepts it,
// and only then the score counts.
//
// Reports are stored separately from the organizer's tournament data (keyed by match id), so the
// organizer app – which saves its whole state – can never overwrite them. Accepted reports fill in
// matches the organizer hasn't scored; a score typed by the organizer always wins.
//
// Shared by the browser app, the local Express server and the Cloudflare Worker.

/** Same rules as scoreError() in src/logic/schedule.ts: winner ≥ target, no ties, max target + 9. */
export function scoreProblem(a, b, target = 21) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Scores must be whole numbers'
  if (a === b) return 'No ties – someone has to win'
  if (Math.max(a, b) < target) return `Game goes to ${target} points`
  if (Math.max(a, b) > target + 9) return `Max score is ${target + 9}`
  return null
}

/** The report for a match – ignored if the match's teams changed since (e.g. finals re-seeded). */
export function reportFor(match, reports) {
  const r = reports?.[match.id]
  return r && r.pairA === match.pairA && r.pairB === match.pairB ? r : null
}

/** Tournament where accepted reports fill in unscored matches. Organizer scores always win. */
export function applyReports(tournament, reports) {
  if (!tournament) return tournament
  return {
    ...tournament,
    matches: (tournament.matches ?? []).map((m) => {
      const r = reportFor(m, reports)
      return r?.status === 'accepted' && m.scoreA == null && m.scoreB == null ? { ...m, scoreA: r.scoreA, scoreB: r.scoreB } : m
    }),
  }
}

/** Reports about one team's games (what its team page needs). */
export function teamReports(tournament, reports, pairId) {
  return (tournament?.matches ?? [])
    .filter((m) => m.pairA === pairId || m.pairB === pairId)
    .map((m) => reportFor(m, reports))
    .filter(Boolean)
}

/**
 * A team's action on one of its games. Pure function.
 *   action = { type: 'report', matchId, us, them } | { type: 'accept' | 'reject' | 'cancel', matchId }
 * Returns { report } – the new value for reports[matchId] (null = delete) – or { error, status }.
 */
export function reportAction(tournament, reports, pairId, action, now = Date.now()) {
  const m = (tournament?.matches ?? []).find((x) => x.id === action?.matchId)
  if (!m || (m.pairA !== pairId && m.pairB !== pairId)) return { error: 'Game not found', status: 404 }
  if (!m.pairA || !m.pairB) return { error: 'The opponent is not decided yet', status: 409 }
  if (m.scoreA != null || m.scoreB != null) return { error: 'This game already has a result', status: 409 }
  const existing = reportFor(m, reports)
  if (existing?.status === 'accepted') return { error: 'This game already has a result', status: 409 }
  const weAreA = m.pairA === pairId

  switch (action.type) {
    case 'report': {
      const us = Number(action.us)
      const them = Number(action.them)
      const problem = scoreProblem(us, them, tournament.settings?.pointsPerGame ?? 21)
      if (problem) return { error: problem, status: 400 }
      const scoreA = weAreA ? us : them
      const scoreB = weAreA ? them : us
      if (existing?.status === 'pending' && existing.by !== pairId) {
        // both teams said the same thing → that's an agreement
        if (existing.scoreA === scoreA && existing.scoreB === scoreB) return { report: { ...existing, status: 'accepted', decidedAt: now } }
        return { error: 'The other team already reported a score – accept or reject it first.', status: 409 }
      }
      return { report: { matchId: m.id, pairA: m.pairA, pairB: m.pairB, by: pairId, scoreA, scoreB, status: 'pending', reportedAt: now } }
    }
    case 'accept':
    case 'reject': {
      if (!existing || existing.status !== 'pending') return { error: 'There is no score waiting for confirmation', status: 409 }
      if (existing.by === pairId) return { error: 'The other team has to confirm your score', status: 403 }
      return { report: { ...existing, status: action.type === 'accept' ? 'accepted' : 'rejected', decidedAt: now } }
    }
    case 'cancel': {
      if (!existing || existing.by !== pairId || existing.status !== 'pending') return { error: 'Nothing to withdraw', status: 409 }
      return { report: null }
    }
    default:
      return { error: 'Unknown action', status: 400 }
  }
}
