// Sanity checks for pairing + scheduling. Run: npm run test:logic
import assert from 'node:assert/strict'
import type { Match, Player } from '../src/types'
import { generatePairs, pairViolations, feasibilityProblems } from '../src/logic/pairing'
import { buildRound1, buildRound2, planSchedule, scoreError, winnerOf } from '../src/logic/schedule'
import { buildFinals, computeStandings, finalRanking, reseedFinals } from '../src/logic/standings'
import { courtNumbersOf, DEFAULT_SETTINGS, emptyTournament as emptyTournamentForTest } from '../src/types'
import { ensurePasswords, passwordMap, publicView, slugify, teamAccess, teamList, teamPassword } from '../shared/teams.js'
import { applyReports, reportAction, scoreProblem, teamReports } from '../shared/reports.js'

const ages = [29, 63, 38, 74, 26, 57, 33, 48, 44, 35, 66, 31, 52, 40, 37, 70]
const players: Player[] = ages.map((age, i) => ({ id: 'p' + i, name: 'P' + i, age, quality: '' }))
const byId = new Map(players.map((p) => [p.id, p]))

// --- pairing: random age combinations, with only the over-40 rule enforced
const seen = new Set<string>()
const t0 = performance.now()
for (let run = 0; run < 30; run++) {
  const { pairs, stats } = generatePairs(players)
  assert.equal(pairs.length, 8)
  const used = pairs.flatMap((p) => p.playerIds)
  assert.equal(new Set(used).size, 16, 'every player in exactly one pair')
  for (const p of pairs) assert.deepEqual(pairViolations(byId.get(p.playerIds[0])!, byId.get(p.playerIds[1])!), [])
  assert.equal(stats.violations, 0)
  seen.add(pairs.map((p) => [...p.playerIds].sort().join('+')).sort().join('|'))
}
const ms = (performance.now() - t0) / 30
console.log(`pairing: 30 runs ok, ${seen.size} distinct pairings, ~${ms.toFixed(0)} ms/run`)

const youngPlayers = ages.slice(0, 8).map((_, i) => ({ ...players[i], age: 20 + i }))
const youngPairing = generatePairs(youngPlayers)
assert.ok(youngPairing.stats.averages.every((average) => average < 35), 'pair averages below 35 are allowed')
assert.equal(youngPairing.stats.violations, 0, 'age averages do not count as rule violations')

// 12 players
const twelve = players.slice(0, 12)
const r12 = generatePairs(twelve)
console.log(`12 players: ${r12.pairs.length} pairs, spread ${r12.stats.spread.toFixed(2)}y, violations ${r12.stats.violations}`)

// infeasible roster: too many over 40 → best effort, reports problems
const old = ages.map((a, i) => ({ ...players[i], age: a < 40 ? a + 30 : a }))
console.log('infeasible roster problems:', feasibilityProblems(old))
console.log('  best effort violations:', generatePairs(old).stats.violations)

// --- schedule: round 1
const pairIds = r12.pairs.map((p) => p.id).concat(['x1', 'x2']) // 8 pairs
const key = (m: { pairA: string | null; pairB: string | null }) => [m.pairA, m.pairB].sort().join('-')
function checkRound(matches: Match[], courtNumbers: number[]) {
  const keys = new Set<string>()
  const slots = new Map<number, string[]>()
  for (const m of matches) {
    assert.ok(!keys.has(key(m)), 'no duplicate matchups inside a round')
    keys.add(key(m))
    const inSlot = slots.get(m.slot) ?? []
    assert.ok(!inSlot.includes(m.pairA!) && !inSlot.includes(m.pairB!), 'no pair twice in one slot')
    assert.ok(courtNumbers.includes(m.court))
    slots.set(m.slot, [...inSlot, m.pairA!, m.pairB!])
  }
  const games = new Map<string, number>()
  for (const m of matches) for (const p of [m.pairA!, m.pairB!]) games.set(p, (games.get(p) ?? 0) + 1)
  assert.equal(new Set(games.values()).size, 1, 'every pair plays the same number of games')
  return slots.size
}
const check = (courts: number, totalMinutes: number) => {
  const s = { ...DEFAULT_SETTINGS, courts, totalMinutes }
  const plan = planSchedule(8, s)
  const { matches, note } = buildRound1(pairIds, s)
  const slots = checkRound(matches, courtNumbersOf(s))
  assert.ok((slots + plan.finalSlots) * s.minutesPerGame <= totalMinutes || plan.rotationsUsed === 1, 'round 1 + final fits')
  console.log(`courts=${courts} time=${totalMinutes}: ${matches.length} games, ${slots} slots → ${note}`)
  return { matches, s }
}
const { matches: full, s: fullSettings } = check(2, 210)
check(3, 210)
const { matches: partial, s: partialSettings } = check(2, 120)
check(1, 120)

// --- round 2: same opponents (full RR), sides swapped, starts after round 1
const r2 = buildRound2(pairIds, fullSettings, full)
checkRound(r2, fullSettings.courtNumbers)
assert.deepEqual(new Set(r2.map(key)), new Set(full.map(key)), 'full RR: round 2 = same matchups')
assert.ok(Math.min(...r2.map((m) => m.slot)) > Math.max(...full.map((m) => m.slot)), 'round 2 after round 1')
const r1Side = new Map(full.map((m) => [key(m), m.pairA]))
assert.ok(r2.every((m) => r1Side.get(key(m)) === m.pairB), 'sides swapped')
const customCourtSettings = { ...DEFAULT_SETTINGS, courts: 3, courtNumbers: [12, 16, 27], totalMinutes: 210 }
const customCourtMatches = buildRound1(pairIds, customCourtSettings).matches
checkRound(customCourtMatches, customCourtSettings.courtNumbers)
assert.deepEqual([...new Set(customCourtMatches.map((m) => m.court))].sort((a, b) => a - b), [12, 16, 27])
// partial round 1 → round 2 meets new opponents first
const p2 = buildRound2(pairIds, partialSettings, partial)
const partialKeys = new Set(partial.map(key))
console.log(`partial: round 2 has ${p2.filter((m) => !partialKeys.has(key(m))).length}/${p2.length} new matchups`)
assert.ok(p2.some((m) => !partialKeys.has(key(m))))

// --- standings: 1 point per win, ties by ball difference
const pairsObj = pairIds.map((id) => ({ id, name: id, playerIds: ['a', 'b'] as [string, string] }))
const scored = [...full, ...r2].map((m, i) => ({ ...m, scoreA: i % 3 === 0 ? 21 : 15 + (i % 5), scoreB: i % 3 === 0 ? 17 : 21 }))
const table = computeStandings(pairsObj, scored)
assert.equal(table.reduce((s, r) => s + r.points, 0), scored.length, 'one point per game')
for (let i = 1; i < table.length; i++) {
  const [a, b] = [table[i - 1], table[i]]
  assert.ok(a.points > b.points || (a.points === b.points && a.diff >= b.diff), 'sorted by points then diff')
}
// tie on points → ball difference decides
const tie = computeStandings(pairsObj.slice(0, 4), [
  { ...full[0], stage: 'round1', pairA: pairIds[0], pairB: pairIds[1], scoreA: 21, scoreB: 5 },
  { ...full[0], stage: 'round1', pairA: pairIds[2], pairB: pairIds[3], scoreA: 21, scoreB: 19 },
])
assert.deepEqual(tie.map((r) => r.pairId), [pairIds[0], pairIds[2], pairIds[3], pairIds[1]])

// --- final (#1 v #2) & bronze (#3 v #4)
let fin = buildFinals(table, scored, fullSettings)
const f = fin.find((m) => m.stage === 'final')!
const b = fin.find((m) => m.stage === 'bronze')!
assert.deepEqual([f.pairA, f.pairB], [table[0].pairId, table[1].pairId])
assert.deepEqual([b.pairA, b.pairB], [table[2].pairId, table[3].pairId])
assert.equal(f.slot, b.slot, '2 courts: final and bronze side by side')
const customCourtFinals = buildFinals(table, scored, customCourtSettings)
assert.deepEqual(customCourtFinals.map((m) => m.court).sort((a, b) => a - b), [12, 16])
fin = fin.map((m) => ({ ...m, scoreA: 18, scoreB: 21 })) // underdogs win both
const ranking = finalRanking(table, [...scored, ...fin])
assert.deepEqual(ranking.slice(0, 4), [table[1].pairId, table[0].pairId, table[3].pairId, table[2].pairId])
assert.deepEqual(reseedFinals(fin, table), fin, 'reseed is a no-op when standings unchanged')
console.log('standings + final/bronze ok. Top 4:', table.slice(0, 4).map((r) => `${r.pairId}(${r.points}p ${r.diff >= 0 ? '+' : ''}${r.diff})`).join(', '))
// --- points per game (11–21)
assert.equal(scoreError(21, 15), null)
assert.equal(scoreError(30, 29), null)
assert.ok(scoreError(31, 29), 'max 30 for 21-point games')
assert.ok(scoreError(15, 10), '15 is not enough in a game to 21')
assert.equal(scoreError(15, 10, 15), null)
assert.equal(scoreError(11, 4, 11), null)
assert.equal(scoreError(20, 19, 11), null)
assert.ok(scoreError(21, 19, 11), 'max 20 for 11-point games')
assert.ok(scoreError(10, 4, 11), 'game to 11 needs 11')
assert.ok(scoreError(11, 11, 11), 'no ties')
// stored results stay valid regardless of the current setting
assert.equal(winnerOf({ ...full[0], scoreA: 21, scoreB: 15 }), full[0].pairA)
assert.equal(winnerOf({ ...full[0], scoreA: 9, scoreB: 11 }), full[0].pairB)
console.log('points-per-game score rules ok')
// --- team passwords
const pw = generatePairs(players, 2).pairs
assert.ok(pw.every((p) => /^[a-z]+-[a-z]+-\d{3}$/.test(p.password ?? '')), 'every pair gets a password like lucky-otter-482')
assert.equal(new Set(pw.map((p) => p.password)).size, pw.length, 'passwords are unique within the tournament')
assert.notEqual(teamPassword(), teamPassword())
const tour = { ...emptyTournamentForTest(), pairs: [{ id: 'x', name: 'Lucky Otters', playerIds: ['a', 'b'] as [string, string], password: 'lucky-otter-482' }] }
assert.equal(teamAccess(tour, 'lucky-otters', 'lucky-otter-482'), 'ok')
assert.equal(teamAccess(tour, 'lucky-otters', ' Lucky Otter 482 '), 'ok', 'case, spaces and dashes are ignored')
assert.equal(teamAccess(tour, 'lucky-otters', 'lucky-otter-483'), 'wrong')
assert.equal(teamAccess(tour, 'lucky-otters', ''), 'wrong')
assert.equal(teamAccess(tour, 'nope', 'lucky-otter-482'), 'not-found')
assert.equal(teamAccess({ ...tour, pairs: [{ ...tour.pairs[0], password: undefined }] }, 'lucky-otters', 'x'), 'no-password')
assert.ok(!JSON.stringify(publicView(tour)).includes('lucky-otter-482'), 'public view has no passwords')
assert.deepEqual(teamList(tour), [{ name: 'Lucky Otters', slug: 'lucky-otters' }])
assert.equal(slugify('Ärjyt Öljyt!'), 'arjyt-oljyt')
// server-side guarantee: missing passwords are created, stored ones are kept for old organizer tabs
{
  const stored = { ...tour, pairs: [{ ...tour.pairs[0] }, { id: 'y', name: 'Turbo Yaks', playerIds: ['c', 'd'] as [string, string], password: 'turbo-yak-100' }] }
  const staleTab = { ...stored, pairs: stored.pairs.map(({ password: _p, ...p }) => p) }
  const kept = ensurePasswords(staleTab, stored)
  assert.ok(kept.changed)
  assert.deepEqual(passwordMap(kept.tournament), { x: 'lucky-otter-482', y: 'turbo-yak-100' }, 'stored passwords survive a save from an old tab')
  const fresh = ensurePasswords(staleTab)
  assert.ok(fresh.tournament!.pairs.every((p) => /^[a-z]+-[a-z]+-\d{3}$/.test(p.password ?? '')), 'missing passwords get created')
  assert.equal(ensurePasswords(stored).changed, false, 'complete data is left alone')
  assert.equal(ensurePasswords(stored).tournament, stored)
  assert.equal(ensurePasswords(null).tournament, null)
}
console.log('team passwords ok')
// --- score reports from team pages
{
  // server-side rule copy must agree with the app's score rules
  for (const target of [11, 15, 21]) for (const [a, b] of [[21, 15], [15, 21], [11, 4], [20, 19], [30, 29], [31, 29], [10, 4], [11, 11], [24, 22], [25, 23], [-1, 21]]) {
    assert.equal(scoreProblem(a, b, target) === null, scoreError(a, b, target) === null, `rule mismatch ${a}-${b} to ${target}`)
  }
  const T = { ...emptyTournamentForTest(), matches: [{ ...full[0], id: 'm1', pairA: 'A', pairB: 'B', scoreA: null, scoreB: null }, { ...full[0], id: 'm2', pairA: 'C', pairB: 'A', scoreA: null, scoreB: null }] }
  let R: Record<string, any> = {}
  const act = (pair: string, a: any) => {
    const res = reportAction(T, R, pair, a, 1000)
    if (!res.error) { if (res.report) R = { ...R, [a.matchId]: res.report }; else { const { [a.matchId]: _x, ...rest } = R; R = rest } }
    return res
  }
  // B reports "we lost 15-21" → stored in match orientation (A 21, B 15), pending
  assert.ok(!act('B', { type: 'report', matchId: 'm1', us: 15, them: 21 }).error)
  assert.deepEqual([R.m1.scoreA, R.m1.scoreB, R.m1.status, R.m1.by], [21, 15, 'pending', 'B'])
  assert.equal(applyReports(T, R).matches[0].scoreA, null, 'pending does not count')
  assert.equal(act('B', { type: 'accept', matchId: 'm1' }).status, 403, 'reporter cannot accept own score')
  assert.equal(act('C', { type: 'accept', matchId: 'm1' }).status, 404, 'other teams cannot touch the game')
  assert.equal(act('A', { type: 'report', matchId: 'm1', us: 21, them: 17 }).status, 409, 'different counter-report is refused')
  assert.ok(!act('A', { type: 'reject', matchId: 'm1' }).error)
  assert.equal(R.m1.status, 'rejected')
  assert.ok(!act('A', { type: 'report', matchId: 'm1', us: 21, them: 17 }).error, 'after a rejection either team can report again')
  assert.ok(!act('B', { type: 'accept', matchId: 'm1' }).error)
  assert.equal(R.m1.status, 'accepted')
  const applied = applyReports(T, R)
  assert.deepEqual([applied.matches[0].scoreA, applied.matches[0].scoreB], [21, 17], 'accepted report counts')
  assert.equal(act('A', { type: 'report', matchId: 'm1', us: 21, them: 0 }).status, 409, 'accepted result is final for teams')
  // organizer's own score always wins over a report
  const T2 = { ...T, matches: [{ ...T.matches[0], scoreA: 19, scoreB: 21 }, T.matches[1]] }
  assert.deepEqual([applyReports(T2, R).matches[0].scoreA, applyReports(T2, R).matches[0].scoreB], [19, 21])
  // identical reports from both teams = agreement
  assert.ok(!act('C', { type: 'report', matchId: 'm2', us: 21, them: 9 }).error)
  assert.ok(!act('A', { type: 'report', matchId: 'm2', us: 9, them: 21 }).error)
  assert.equal(R.m2.status, 'accepted')
  // invalid scores, withdraw
  assert.equal(reportAction(T, {}, 'A', { type: 'report', matchId: 'm1', us: 18, them: 15 }).status, 400)
  const R3 = { m1: { ...R.m1, status: 'pending' as const, by: 'A' } }
  assert.equal(reportAction(T, R3, 'A', { type: 'cancel', matchId: 'm1' }).report, null)
  assert.equal(reportAction(T, R3, 'B', { type: 'cancel', matchId: 'm1' }).status, 409, 'only the reporter can withdraw')
  // reports for re-seeded games (different teams now) are ignored
  const T4 = { ...T, matches: [{ ...T.matches[0], pairB: 'Z' }] }
  assert.equal(applyReports(T4, R).matches[0].scoreA, null)
  assert.equal(teamReports(T, R, 'A').length, 2)
  assert.equal(teamReports(T, R, 'B').length, 1)
  console.log('score reports ok')
}
console.log('ALL CHECKS PASSED')
