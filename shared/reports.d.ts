import type { Match, ScoreReport, Tournament } from '../src/types'

export type Reports = Record<string, ScoreReport>
export type ReportActionInput =
  | { type: 'report'; matchId: string; us: number; them: number }
  | { type: 'accept' | 'reject' | 'cancel'; matchId: string }

export function scoreProblem(a: number, b: number, target?: number): string | null
export function reportFor(match: Match, reports: Reports | null | undefined): ScoreReport | null
export function applyReports(tournament: Tournament, reports: Reports | null | undefined): Tournament
export function teamReports(tournament: Tournament | null, reports: Reports | null | undefined, pairId: string): ScoreReport[]
export function reportAction(
  tournament: Tournament | null,
  reports: Reports | null | undefined,
  pairId: string,
  action: ReportActionInput,
  now?: number,
): { report: ScoreReport | null; error?: undefined; status?: undefined } | { error: string; status: number; report?: undefined }
