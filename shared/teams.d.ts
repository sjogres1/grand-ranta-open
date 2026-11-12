import type { Pair, Tournament } from '../src/types'

export type TeamAccess = 'ok' | 'wrong' | 'not-found' | 'no-password'

export function slugify(name: string): string
export function teamPassword(): string
export function findTeam(tournament: Tournament | null, slug: string): Pair | undefined
export function teamAccess(tournament: Tournament | null, slug: string, password: string): TeamAccess
export function publicView(tournament: Tournament | null): Tournament | null
export function teamList(tournament: Tournament | null): { name: string; slug: string }[]
export function ensurePasswords(tournament: Tournament | null, previous?: Tournament | null): { tournament: Tournament | null; changed: boolean }
export function passwordMap(tournament: Tournament | null): Record<string, string | null>
