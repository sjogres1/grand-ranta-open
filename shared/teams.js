// Team pages: URL slugs, per-team passwords and the public (password-free) view of the tournament.
// Shared by the browser app, the local Express server and the Cloudflare Worker.

/** "Sauna-Hardened Drop Shots" → "sauna-hardened-drop-shots" */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ä → a, ö → o
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Easy to say out loud and type on a phone: "lucky-otter-482" (32 × 32 × 900 ≈ 920,000 combinations).
const WORDS_A = [
  'smash', 'drop', 'clear', 'drive', 'lob', 'net', 'serve', 'rally', 'spin', 'swift', 'quick', 'bold', 'lucky', 'sunny', 'happy', 'brave',
  'wild', 'mighty', 'super', 'turbo', 'rocket', 'golden', 'silver', 'cosmic', 'jolly', 'fizzy', 'zippy', 'snappy', 'sporty', 'speedy', 'fancy', 'funky',
]
const WORDS_B = [
  'moose', 'bear', 'fox', 'owl', 'lynx', 'wolf', 'hare', 'seal', 'pike', 'duck', 'swan', 'crow', 'otter', 'eagle', 'falcon', 'hawk',
  'badger', 'beaver', 'robin', 'finch', 'tiger', 'panda', 'koala', 'lemur', 'gecko', 'shark', 'whale', 'squid', 'crab', 'frog', 'toad', 'yak',
]
const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n

export function teamPassword() {
  return `${WORDS_A[rnd(WORDS_A.length)]}-${WORDS_B[rnd(WORDS_B.length)]}-${100 + rnd(900)}`
}

/**
 * Server-side guarantee that every team has a password. A pair without one keeps its password from
 * `previous` (the stored data, same pair id) – so an organizer tab with old data can't wipe them –
 * or gets a new one. Returns { tournament, changed }.
 */
export function ensurePasswords(tournament, previous) {
  if (!tournament || !Array.isArray(tournament.pairs) || tournament.pairs.length === 0) return { tournament, changed: false }
  const stored = new Map((previous?.pairs ?? []).map((p) => [p.id, p.password]))
  const used = new Set(tournament.pairs.map((p) => p.password).filter(Boolean))
  let changed = false
  const pairs = tournament.pairs.map((p) => {
    if (p.password) return p
    let pw = stored.get(p.id)
    while (!pw || used.has(pw)) pw = teamPassword()
    used.add(pw)
    changed = true
    return { ...p, password: pw }
  })
  return { tournament: changed ? { ...tournament, pairs } : tournament, changed }
}

/** { pairId: password } – sent back to the organizer app after each save. */
export function passwordMap(tournament) {
  return Object.fromEntries((tournament?.pairs ?? []).map((p) => [p.id, p.password ?? null]))
}

/** Case, spaces and dashes don't matter when typing the password. */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function findTeam(tournament, slug) {
  return (tournament?.pairs ?? []).find((p) => slugify(p.name) === slug)
}

/** 'ok' | 'wrong' | 'not-found' | 'no-password' */
export function teamAccess(tournament, slug, password) {
  const pair = findTeam(tournament, slug)
  if (!pair) return 'not-found'
  if (!pair.password) return 'no-password'
  const given = norm(password)
  return given !== '' && given === norm(pair.password) ? 'ok' : 'wrong'
}

/** The tournament without any team passwords – safe to send to team pages. */
export function publicView(tournament) {
  if (!tournament) return null
  return { ...tournament, pairs: (tournament.pairs ?? []).map(({ password: _password, ...pair }) => pair) }
}

/** Team names + page slugs only (for the "team not found" page). */
export function teamList(tournament) {
  return (tournament?.pairs ?? []).map((p) => ({ name: p.name, slug: slugify(p.name) }))
}
