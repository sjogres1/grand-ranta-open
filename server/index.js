// Local backend: stores the whole tournament as one JSON file and serves the built app.
//
// Optional admin login: set ADMIN_USER and ADMIN_PASSWORD environment variables.
// Without them (the default for local use) anyone who can open the app may edit it.
import express from 'express'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  SESSION_COOKIE,
  checkCredentials,
  clearSessionCookie,
  createToken,
  readCookie,
  sameOrigin,
  sessionCookie,
  verifyToken,
} from '../shared/auth.js'
import { ensurePasswords, findTeam, passwordMap, publicView, teamAccess, teamList } from '../shared/teams.js'
import { applyReports, reportAction, teamReports } from '../shared/reports.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_FILE = process.env.DATA_FILE || path.join(root, 'data', 'tournament.json')
const DIST = process.env.DIST_DIR || path.join(root, 'dist')
const PORT = Number(process.env.PORT) || 3001

const auth =
  process.env.ADMIN_USER && process.env.ADMIN_PASSWORD
    ? { user: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD, sessionSecret: process.env.SESSION_SECRET }
    : null

const app = express()
app.use(express.json({ limit: '2mb' }))

const isAdmin = async (req) => !auth || verifyToken(auth, readCookie(req.headers.cookie, SESSION_COOKIE))

/** Guard for anything that changes data. */
async function requireAdmin(req, res, next) {
  if (!sameOrigin(req.headers.origin, req.headers.host)) return res.status(403).json({ error: 'Bad origin' })
  if (await isAdmin(req)) return next()
  res.status(401).json({ error: 'Login required' })
}

app.get('/api/session', async (req, res) => {
  res.json({ authRequired: Boolean(auth), loggedIn: await isAdmin(req) })
})

app.post('/api/login', async (req, res) => {
  if (!auth) return res.json({ ok: true })
  if (!sameOrigin(req.headers.origin, req.headers.host)) return res.status(403).json({ error: 'Bad origin' })
  const { username = '', password = '' } = req.body ?? {}
  if (await checkCredentials(auth, String(username), String(password))) {
    res.setHeader('Set-Cookie', sessionCookie(await createToken(auth), req.secure))
    return res.json({ ok: true })
  }
  await new Promise((r) => setTimeout(r, 800)) // slow down password guessing
  res.status(401).json({ error: 'Wrong username or password' })
})

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie(req.secure))
  res.json({ ok: true })
})

const REPORTS_FILE = DATA_FILE.replace(/\.json$/i, '') + '-reports.json'

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    throw err
  }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2))
  await fs.rename(tmp, file)
}
const readRaw = () => readJson(DATA_FILE, null)
/** Score reports from team pages, by match id (see shared/reports.js). */
const readReports = () => readJson(REPORTS_FILE, {})

/** Serializes read-modify-write of the data files, so concurrent requests can't overwrite each other. */
let lock = Promise.resolve()
function withLock(fn) {
  const run = lock.then(fn, fn)
  lock = run.catch(() => undefined)
  return run
}

/** The stored tournament. Any team without a password gets one right away (and it's saved). */
async function readTournament() {
  const t = await readRaw()
  if (!ensurePasswords(t).changed) return t
  return withLock(async () => {
    const r = ensurePasswords(await readRaw())
    if (r.changed) await writeJson(DATA_FILE, r.tournament)
    return r.tournament
  })
}

// Full data incl. team passwords – organizer only.
app.get('/api/tournament', async (req, res) => {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Login required' })
  try {
    res.set('Cache-Control', 'no-store')
    res.json(await readTournament())
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not read tournament data' })
  }
})

// Team names only, for the "team not found" page.
app.get('/api/teams', async (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(teamList(await readTournament()))
})

/** Checks the team password; on success returns { t, pair }, otherwise answers the request itself. */
async function teamLogin(req, res, t) {
  const slug = String(req.params.slug).toLowerCase()
  const access = teamAccess(t, slug, String(req.body?.password ?? ''))
  if (access === 'ok') return findTeam(t, slug)
  if (access === 'not-found') res.status(404).json({ error: 'Team not found' })
  else if (access === 'no-password') res.status(403).json({ error: 'This team has no password yet – ask the organizer.' })
  else {
    await new Promise((r) => setTimeout(r, 600)) // slow down guessing
    res.status(401).json({ error: 'Wrong password' })
  }
  return null
}

/** What a team page gets: the tournament with accepted reports applied, no passwords, plus its own reports. */
const teamView = (t, reports, pair) => ({ tournament: publicView(applyReports(t, reports)), reports: teamReports(t, reports, pair.id) })

// A team page: the right team password gives the tournament without any passwords.
app.post('/api/team/:slug', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const t = await readTournament()
  const pair = await teamLogin(req, res, t)
  if (pair) res.json(teamView(t, await readReports(), pair))
})

// A team reports / accepts / rejects / withdraws the score of one of its games.
app.post('/api/team/:slug/action', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const t = await readTournament()
  const pair = await teamLogin(req, res, t)
  if (!pair) return
  try {
    const result = await withLock(async () => {
      const fresh = await readRaw() // already has passwords (checked above)
      const reports = await readReports()
      const r = reportAction(fresh, reports, pair.id, req.body ?? {})
      if (r.error) return r
      if (r.report) reports[req.body.matchId] = r.report
      else delete reports[req.body.matchId]
      await writeJson(REPORTS_FILE, reports)
      return { view: teamView(fresh, reports, pair) }
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result.view)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not save the score' })
  }
})

// All score reports – organizer only (the organizer app merges accepted ones into the matches).
app.get('/api/reports', async (req, res) => {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Login required' })
  res.set('Cache-Control', 'no-store')
  res.json(await readReports())
})

// Organizer removes a report (e.g. after typing the score in themselves).
app.delete('/api/reports/:matchId', requireAdmin, async (req, res) => {
  await withLock(async () => {
    const reports = await readReports()
    delete reports[req.params.matchId]
    await writeJson(REPORTS_FILE, reports)
  })
  res.json({ ok: true })
})

app.put('/api/tournament', requireAdmin, async (req, res) => {
  try {
    // An organizer tab with older data may lack team passwords – keep the stored ones (or create new).
    const saved = await withLock(async () => {
      const { tournament } = ensurePasswords(req.body, await readRaw())
      await writeJson(DATA_FILE, tournament)
      return tournament
    })
    res.json({ ok: true, passwords: passwordMap(saved) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not save tournament data' })
  }
})

app.delete('/api/tournament', requireAdmin, async (_req, res) => {
  await withLock(async () => {
    await fs.rm(DATA_FILE, { force: true })
    await fs.rm(REPORTS_FILE, { force: true })
  })
  res.json({ ok: true })
})

// Network addresses of this laptop, so the organizer can share team-page links with phones on the same Wi-Fi.
app.get('/api/info', (_req, res) => {
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })),
  )
  res.json({ port: PORT, addresses })
})

// In production mode (npm start / packaged app) also serve the built frontend.
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  console.log(`🏸 API running on ${url}`)
  if (existsSync(DIST)) console.log(`   App available at ${url}`)
  if (auth) console.log('   Admin login is ON')
  if (process.env.OPEN_BROWSER) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
    exec(cmd)
  }
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use – is Grand Räntä Open already running? Close the other window and try again.\n`)
    process.exit(1)
  }
  throw err
})
