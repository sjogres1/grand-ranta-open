export interface Player {
  id: string
  name: string
  age: number
  quality: string
}

export interface Pair {
  id: string
  name: string
  playerIds: [string, string]
  /** Password for the team's page. Only the organizer sees it; servers strip it from team-page data. */
  password?: string
}

/** round1 / round2 = full round robins with the same pairs; final = #1 vs #2, bronze = #3 vs #4. */
export type MatchStage = 'round1' | 'round2' | 'final' | 'bronze'

export interface Match {
  id: string
  stage: MatchStage
  /** Rotation inside a round robin – every pair plays at most once per rotation. 0 for final/bronze. */
  rotation: number
  /** Time slot index; all matches in a slot are played simultaneously on different courts. */
  slot: number
  court: number
  pairA: string | null
  pairB: string | null
  scoreA: number | null
  scoreB: number | null
  label?: string
}

/**
 * A score reported from a team page. Stored separately from the tournament (see shared/reports.js);
 * it counts once the other team accepts it. scoreA/scoreB follow the match's pairA/pairB.
 */
export interface ScoreReport {
  matchId: string
  pairA: string
  pairB: string
  /** pair that reported the score */
  by: string
  scoreA: number
  scoreB: number
  status: 'pending' | 'accepted' | 'rejected'
  reportedAt: number
  decidedAt?: number
}

export interface Settings {
  /** Points needed to win a game (11–21). */
  pointsPerGame: number
  courts: number
  courtNumbers: number[]
  minutesPerGame: number
  totalMinutes: number
  startTime: string
}

export type Step = 'landing' | 'players' | 'pairs' | 'schedule' | 'finals'

export interface Tournament {
  step: Step
  players: Player[]
  pairs: Pair[]
  matches: Match[]
  settings: Settings
  scheduleNote: string
  /** Decision after round 1: null = not decided yet. */
  secondRound: boolean | null
  /** Decision about final + bronze match: null = not decided yet. Always true when secondRound is false. */
  finals: boolean | null
}

/** Clears the program and all decisions (used when pairs/players/settings change). */
export const RESET_PROGRAM = { matches: [], scheduleNote: '', secondRound: null, finals: null } satisfies Partial<Tournament>

export const MIN_POINTS = 11
export const MAX_POINTS = 21

export const DEFAULT_SETTINGS: Settings = {
  pointsPerGame: 21,
  courts: 2,
  courtNumbers: [1, 2],
  minutesPerGame: 12,
  totalMinutes: 210,
  startTime: '10:00',
}

export function courtNumbersOf(s: Pick<Settings, 'courts' | 'courtNumbers'>): number[] {
  const count = Math.max(1, Math.floor(Number(s.courts) || 1))
  const used = new Set<number>()
  return Array.from({ length: count }, (_, index) => {
    let number = Number(s.courtNumbers?.[index])
    if (!Number.isInteger(number) || number < 1 || used.has(number)) {
      number = 1
      while (used.has(number)) number++
    }
    used.add(number)
    return number
  })
}

export function emptyTournament(): Tournament {
  return {
    step: 'landing',
    players: [],
    pairs: [],
    matches: [],
    settings: { ...DEFAULT_SETTINGS },
    scheduleNote: '',
    secondRound: null,
    finals: null,
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
