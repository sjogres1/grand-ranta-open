import type { Match, Settings } from '../types'
import { courtNumbersOf } from '../types'
import { uid } from '../types'

/** Circle-method round robin. Each rotation: every pair plays at most once. */
export function roundRobinRotations(pairIds: string[]): [string, string][][] {
  const arr: (string | null)[] = [...pairIds]
  if (arr.length % 2 === 1) arr.push(null) // bye
  const n = arr.length
  const rotations: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const rotation: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a && b) rotation.push(r % 2 === 0 ? [a, b] : [b, a])
    }
    rotations.push(rotation)
    // rotate everything except the first element
    arr.splice(1, 0, arr.pop()!)
  }
  return rotations
}

/** Final + bronze are played side by side when there are 2+ courts. */
export function finalSlotsNeeded(courts: number): number {
  return courts >= 2 ? 1 : 2
}

const courtsOf = (s: Settings) => courtNumbersOf(s)

export interface SchedulePlan {
  totalRotations: number
  /** Rotations per round (the same for round 1 and round 2). */
  rotationsUsed: number
  fullRoundRobin: boolean
  /** Games in one round. */
  roundGames: number
  /** Time slots one round takes. */
  roundSlots: number
  finalSlots: number
}

/**
 * Plan round 1 so that it plus a final & bronze match fit in the available time.
 * Only whole rotations are used, so every pair plays the same number of games.
 * Round 2 is optional and decided later ("if there is time").
 */
export function planSchedule(pairCount: number, s: Settings): SchedulePlan {
  const courtNumbers = courtsOf(s)
  const courts = courtNumbers.length
  const totalRotations = pairCount % 2 === 0 ? pairCount - 1 : pairCount
  const gamesPerRotation = Math.floor(pairCount / 2)
  const totalSlots = Math.floor(s.totalMinutes / Math.max(1, s.minutesPerGame))
  const finalSlots = finalSlotsNeeded(courts)
  const capacity = Math.max(0, totalSlots - finalSlots) * courts

  let rotationsUsed = Math.floor(capacity / Math.max(1, gamesPerRotation))
  rotationsUsed = Math.max(1, Math.min(totalRotations, rotationsUsed))
  // Slot packing isn't always perfect – drop rotations until it really fits.
  let roundSlots = estimateSlots(pairCount, rotationsUsed, courtNumbers)
  while (rotationsUsed > 1 && roundSlots + finalSlots > totalSlots) {
    rotationsUsed--
    roundSlots = estimateSlots(pairCount, rotationsUsed, courtNumbers)
  }
  return {
    totalRotations,
    rotationsUsed,
    fullRoundRobin: rotationsUsed === totalRotations,
    roundGames: rotationsUsed * gamesPerRotation,
    roundSlots,
    finalSlots,
  }
}

function estimateSlots(pairCount: number, rotations: number, courtNumbers: number[]): number {
  const fake = Array.from({ length: pairCount }, (_, i) => String(i))
  return assignSlots(roundRobinRotations(fake).slice(0, rotations), courtNumbers).reduce((m, x) => Math.max(m, x.slot + 1), 0)
}

/**
 * Greedily pack matches into time slots (one match per court per slot).
 * A pair never plays twice in a slot, and we prefer giving pairs a rest between games.
 */
function assignSlots(rotations: [string, string][][], courtNumbers: number[]) {
  const queue = rotations.flatMap((rot, r) => rot.map(([a, b]) => ({ a, b, rotation: r })))
  const out: { a: string; b: string; rotation: number; slot: number; court: number }[] = []
  let prev = new Set<string>()
  let slot = 0
  while (queue.length) {
    const used = new Set<string>()
    const picked: number[] = []
    for (const allowBackToBack of [false, true]) {
      for (let i = 0; i < queue.length && picked.length < courtNumbers.length; i++) {
        // don't jump more than one rotation ahead, keeps the program readable
        if (queue[i].rotation > queue[0].rotation + 1) break
        if (picked.includes(i)) continue
        const { a, b } = queue[i]
        if (used.has(a) || used.has(b)) continue
        if (!allowBackToBack && (prev.has(a) || prev.has(b))) continue
        picked.push(i)
        used.add(a)
        used.add(b)
      }
    }
    picked
      .sort((x, y) => x - y)
      .forEach((qi, k) => out.push({ ...queue[qi], slot, court: courtNumbers[k] }))
    for (const qi of [...picked].sort((x, y) => y - x)) queue.splice(qi, 1)
    prev = used
    slot++
  }
  return out
}

function buildRound(
  pairIds: string[],
  s: Settings,
  stage: 'round1' | 'round2',
  rotationOffset: number,
  rotationCount: number,
  startSlot: number,
): Match[] {
  const all = roundRobinRotations(pairIds)
  const rotations = Array.from({ length: rotationCount }, (_, i) => all[(rotationOffset + i) % all.length])
  // Round 2: same opponents, sides swapped.
  const oriented = stage === 'round2' ? rotations.map((rot) => rot.map(([a, b]) => [b, a] as [string, string])) : rotations
  return assignSlots(oriented, courtsOf(s)).map((m) => ({
    id: uid(),
    stage,
    rotation: m.rotation + 1,
    slot: startSlot + m.slot,
    court: m.court,
    pairA: m.a,
    pairB: m.b,
    scoreA: null,
    scoreB: null,
  }))
}

export function buildRound1(pairIds: string[], s: Settings): { matches: Match[]; note: string } {
  const plan = planSchedule(pairIds.length, s)
  const matches = buildRound(pairIds, s, 'round1', 0, plan.rotationsUsed, 0)
  const r1 = plan.roundSlots * s.minutesPerGame
  const fin = plan.finalSlots * s.minutesPerGame
  const note =
    (plan.fullRoundRobin
      ? `Round 1: full round robin – every pair plays every other pair once (${plan.roundGames} games, ≈ ${r1} min). `
      : `Round 1: time allows ${plan.rotationsUsed} of ${plan.totalRotations} rotations – every pair meets ` +
        `${plan.rotationsUsed} of its ${plan.totalRotations} opponents (${plan.roundGames} games, ≈ ${r1} min). `) +
    `Final & bronze ≈ ${fin} min. Optional round 2 would need another ≈ ${r1} min.`
  return { matches, note }
}

/**
 * Round 2: same pairs, same format, same number of rotations as round 1.
 * After a full round robin it's the same opponents again; after a partial one it continues
 * with the opponents the pairs haven't met yet.
 */
export function buildRound2(pairIds: string[], s: Settings, round1: Match[]): Match[] {
  const rotationsUsed = round1.reduce((m, x) => Math.max(m, x.rotation), 0)
  const startSlot = round1.reduce((m, x) => Math.max(m, x.slot + 1), 0)
  return buildRound(pairIds, s, 'round2', rotationsUsed, rotationsUsed, startSlot)
}

/* ------------------------------------------------------------ time helpers */

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function formatClock(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function slotTime(startTime: string, slot: number, minutesPerGame: number): string {
  return formatClock(toMinutes(startTime) + slot * minutesPerGame)
}

/* ------------------------------------------------------------------ scores */

/** Highest possible score: like 21 → 30 in real badminton, the cap is target + 9. */
export const maxScore = (target: number) => target + 9

/**
 * Validates a typed-in score for a game to `target` points (default 21):
 * winner has ≥ target, no ties, at most target + 9 (sudden death, e.g. 29–29 → 30).
 */
export function scoreError(a: number | null, b: number | null, target = 21): string | null {
  if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) return 'Enter both scores'
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Scores must be whole numbers'
  if (a === b) return 'No ties – someone has to win'
  if (Math.max(a, b) < target) return `Game goes to ${target} points`
  if (Math.max(a, b) > maxScore(target)) return `Max score is ${maxScore(target)}`
  return null
}

/** Scores are validated when typed in, so results stay valid even if the points-per-game setting changes later. */
export function winnerOf(m: Match): string | null {
  if (m.scoreA === null || m.scoreB === null || m.scoreA === m.scoreB) return null
  return m.scoreA > m.scoreB ? m.pairA : m.pairB
}

export function loserOf(m: Match): string | null {
  const w = winnerOf(m)
  if (!w) return null
  return w === m.pairA ? m.pairB : m.pairA
}
