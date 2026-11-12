import type { Pair, Player } from '../types'
import { uid } from '../types'
import { teamPassword } from './slug'

/** A player strictly above this age counts as "over 40". At most one per pair. */
export const OVER_AGE = 40

export function pairAverage(a: Player, b: Player): number {
  return (a.age + b.age) / 2
}

export function pairViolations(a: Player, b: Player): string[] {
  const v: string[] = []
  if (a.age > OVER_AGE && b.age > OVER_AGE) v.push(`Both players are over ${OVER_AGE}`)
  return v
}

export interface PairingStats {
  averages: number[]
  min: number
  max: number
  /** Oldest pair average minus youngest pair average. */
  spread: number
  violations: number
}

export function statsFor(pairs: [Player, Player][]): PairingStats {
  const averages = pairs.map(([a, b]) => pairAverage(a, b))
  const min = Math.min(...averages)
  const max = Math.max(...averages)
  const violations = pairs.reduce((s, [a, b]) => s + pairViolations(a, b).length, 0)
  return { averages, min, max, spread: max - min, violations }
}

/** Hard reasons why no valid pairing can exist (shown before even trying). */
export function feasibilityProblems(players: Player[]): string[] {
  const problems: string[] = []
  const pairCount = players.length / 2
  const over = players.filter((p) => p.age > OVER_AGE).length
  if (over > pairCount) {
    problems.push(
      `${over} players are over ${OVER_AGE}, but there are only ${pairCount} pairs – ` +
        `at least ${over - pairCount} pair(s) will have two players over ${OVER_AGE}.`,
    )
  }
  return problems
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Eval {
  violations: number
  cost: number
}

/** Evaluate an ordering where pair k = (order[2k], order[2k+1]). */
function evaluate(order: Player[]): Eval {
  const n = order.length / 2
  let violations = 0
  for (let k = 0; k < n; k++) {
    const a = order[2 * k]
    const b = order[2 * k + 1]
    if (a.age > OVER_AGE && b.age > OVER_AGE) violations++
  }
  return { violations, cost: violations }
}

/**
 * Hill-climb by swapping players between pairs, starting from a random shuffle.
 * Sideways moves are allowed so different runs end in different (equally good) places.
 * Stops early as soon as `goal` is met.
 */
function localSearch(players: Player[], goal?: (e: Eval) => boolean): { order: Player[]; ev: Eval } {
  const order = shuffle(players)
  let ev = evaluate(order)
  const n = order.length
  let sinceImprovement = 0
  while (sinceImprovement < 800 && !goal?.(ev)) {
    const i = Math.floor(Math.random() * n)
    const j = Math.floor(Math.random() * n)
    if (i >> 1 === j >> 1) continue
    ;[order[i], order[j]] = [order[j], order[i]]
    const next = evaluate(order)
    if (next.cost <= ev.cost + 1e-9) {
      sinceImprovement = next.cost < ev.cost - 1e-9 ? 0 : sinceImprovement + 1
      ev = next
    } else {
      ;[order[i], order[j]] = [order[j], order[i]]
      sinceImprovement++
    }
  }
  return { order, ev }
}

const ADJECTIVES = [
  'Feathered', 'Turbo', 'Silver', 'Golden', 'Mighty', 'Sneaky', 'Thunder', 'Cosmic',
  'Flying', 'Smashing', 'Wise', 'Electric', 'Midnight', 'Arctic', 'Spicy', 'Legendary',
  'Unstoppable', 'Mysterious', 'Caffeinated', 'Sauna-Hardened',
]
const NOUNS = [
  'Shuttlers', 'Smashers', 'Net Ninjas', 'Drop Shots', 'Birdies', 'Racketeers', 'Owls',
  'Moose', 'Wolverines', 'Comets', 'Falcons', 'Clears', 'Lobsters', 'Reindeer', 'Hedgehogs',
  'Pike', 'Bears', 'Squirrels',
]

/** Fun team names; no adjective or noun is used twice. */
function teamNames(count: number): string[] {
  const adjs = shuffle(ADJECTIVES)
  const nouns = shuffle(NOUNS)
  return Array.from({ length: count }, (_, i) => `${adjs[i % adjs.length]} ${nouns[i % nouns.length]}`)
}

/** A fresh random team-page password for every pair (no two teams share one). */
export function uniquePasswords(count: number, taken: Iterable<string> = []): string[] {
  const used = new Set(taken)
  const out: string[] = []
  while (out.length < count) {
    const pw = teamPassword()
    if (!used.has(pw)) {
      used.add(pw)
      out.push(pw)
    }
  }
  return out
}

/** Copy of `pairs` where one pair has a fresh password (the old one stops working). */
export function withNewPassword(pairs: Pair[], pairId: string): Pair[] {
  const [pw] = uniquePasswords(1, pairs.map((p) => p.password ?? ''))
  return pairs.map((p) => (p.id === pairId ? { ...p, password: pw } : p))
}

export interface PairingResult {
  pairs: Pair[]
  stats: PairingStats
}

/**
 * Random pairing that tries to keep at most one player over 40 in each pair.
 * If that is impossible, it returns a pairing with the fewest such rule breaks.
 */
export function generatePairs(players: Player[], restarts = 120): PairingResult {
  if (players.length < 2 || players.length % 2 !== 0) {
    throw new Error('Need an even number of players to make pairs')
  }

  const found: { order: Player[]; ev: Eval }[] = []
  for (let r = 0; r < restarts; r++) found.push(localSearch(players))
  const bestViolations = Math.min(...found.map((f) => f.ev.violations))
  const ok = (e: Eval) => e.violations === bestViolations

  let chosen: Player[] | null = null
  // A fresh random search that stops at the first acceptable pairing = a random draw.
  for (let attempt = 0; attempt < 200 && !chosen; attempt++) {
    const res = localSearch(players, ok)
    if (ok(res.ev)) chosen = res.order
  }
  if (!chosen) {
    const pool = found.filter((f) => ok(f.ev))
    chosen = pool[Math.floor(Math.random() * pool.length)].order
  }

  const tuples: [Player, Player][] = []
  for (let k = 0; k < chosen.length; k += 2) tuples.push([chosen[k], chosen[k + 1]])
  // Present pairs in random order, older player first within a pair.
  const shuffled = shuffle(tuples).map(([a, b]) => (a.age >= b.age ? [a, b] : [b, a]) as [Player, Player])
  const names = teamNames(shuffled.length)
  const passwords = uniquePasswords(shuffled.length)
  return {
    pairs: shuffled.map(([a, b], i) => ({ id: uid(), name: names[i], playerIds: [a.id, b.id], password: passwords[i] })),
    stats: statsFor(shuffled),
  }
}
