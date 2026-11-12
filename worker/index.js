// Online backend for Cloudflare Workers (free plan).
//  - static app files are served by Workers Assets (see wrangler.toml)
//  - /api/* is handled here; the tournament is stored as one JSON row in a D1 database
//  - admin login comes from the ADMIN_USER / ADMIN_PASSWORD secrets (never stored in code)
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

const KEY = 'tournament'
const MAX_BODY = 2_000_000

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
      // Never run online without a login – anyone could edit the tournament.
      return json({ error: 'Server not configured: set the ADMIN_USER and ADMIN_PASSWORD secrets.' }, 500)
    }
    const auth = { user: env.ADMIN_USER, password: env.ADMIN_PASSWORD, sessionSecret: env.SESSION_SECRET }
    const secure = url.protocol === 'https:'
    const isAdmin = () => verifyToken(auth, readCookie(request.headers.get('Cookie'), SESSION_COOKIE))
    const writing = request.method !== 'GET' && request.method !== 'HEAD'
    if (writing && !sameOrigin(request.headers.get('Origin'), url.host)) return json({ error: 'Bad origin' }, 403)

    const saveTournament = (t) =>
      env.DB.prepare(
        'INSERT INTO store (key, value, updated_at) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      )
        .bind(KEY, JSON.stringify(t), Date.now())
        .run()
    /** The stored tournament. Any team without a password gets one right away (and it's saved). */
    const readTournament = async () => {
      const row = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind(KEY).first()
      const t = row ? JSON.parse(row.value) : null
      const r = ensurePasswords(t)
      if (r.changed) await saveTournament(r.tournament)
      return r.tournament
    }

    // Score reports from team pages: one row per game ("report:<matchId>"), so two teams can't overwrite each other.
    const readReports = async () => {
      const { results } = await env.DB.prepare("SELECT key, value FROM store WHERE key LIKE 'report:%'").all()
      return Object.fromEntries(results.map((r) => [r.key.slice('report:'.length), JSON.parse(r.value)]))
    }
    const writeReport = (matchId, report) =>
      report
        ? env.DB.prepare(
            'INSERT INTO store (key, value, updated_at) VALUES (?1, ?2, ?3) ' +
              'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          )
            .bind('report:' + matchId, JSON.stringify(report), Date.now())
            .run()
        : env.DB.prepare('DELETE FROM store WHERE key = ?').bind('report:' + matchId).run()
    /** What a team page gets: tournament with accepted reports applied, no passwords, plus its own reports. */
    const teamView = (t, reports, pair) => ({ tournament: publicView(applyReports(t, reports)), reports: teamReports(t, reports, pair.id) })

    // Team pages: POST /api/team/<slug> (read) and POST /api/team/<slug>/action (report / accept / reject / withdraw).
    const teamMatch = /^\/api\/team\/([^/]+)(\/action)?$/.exec(url.pathname)
    if (teamMatch && request.method === 'POST') {
      let body = {}
      try {
        body = await request.json()
      } catch {
        // treated as a wrong password
      }
      let slug = teamMatch[1]
      try {
        slug = decodeURIComponent(slug)
      } catch {
        // malformed – will simply not be found
      }
      slug = slug.toLowerCase()
      const t = await readTournament()
      const access = teamAccess(t, slug, String(body.password ?? ''))
      if (access === 'not-found') return json({ error: 'Team not found' }, 404)
      if (access === 'no-password') return json({ error: 'This team has no password yet – ask the organizer.' }, 403)
      if (access !== 'ok') {
        await new Promise((r) => setTimeout(r, 600)) // slow down guessing
        return json({ error: 'Wrong password' }, 401)
      }
      const pair = findTeam(t, slug)
      const reports = await readReports()
      if (!teamMatch[2]) return json(teamView(t, reports, pair))

      const result = reportAction(t, reports, pair.id, body)
      if (result.error) return json({ error: result.error }, result.status)
      await writeReport(body.matchId, result.report)
      if (result.report) reports[body.matchId] = result.report
      else delete reports[body.matchId]
      return json(teamView(t, reports, pair))
    }

    // Organizer removes a report: DELETE /api/reports/<matchId>
    const reportMatch = /^\/api\/reports\/([^/]+)$/.exec(url.pathname)
    if (reportMatch && request.method === 'DELETE') {
      if (!(await isAdmin())) return json({ error: 'Login required' }, 401)
      await writeReport(reportMatch[1], null)
      return json({ ok: true })
    }

    switch (`${request.method} ${url.pathname}`) {
      // Full data incl. team passwords – organizer only.
      case 'GET /api/tournament': {
        if (!(await isAdmin())) return json({ error: 'Login required' }, 401)
        return json(await readTournament())
      }

      // Team names only, for the "team not found" page.
      case 'GET /api/teams':
        return json(teamList(await readTournament()))

      // All score reports – organizer only (the organizer app merges accepted ones into the matches).
      case 'GET /api/reports':
        if (!(await isAdmin())) return json({ error: 'Login required' }, 401)
        return json(await readReports())

      case 'PUT /api/tournament': {
        if (!(await isAdmin())) return json({ error: 'Login required' }, 401)
        const body = await request.text()
        if (body.length > MAX_BODY) return json({ error: 'Too large' }, 413)
        let data
        try {
          data = JSON.parse(body)
          if (!data || typeof data !== 'object' || !Array.isArray(data.players)) throw new Error('bad shape')
        } catch {
          return json({ error: 'Invalid tournament data' }, 400)
        }
        // An organizer tab with older data may lack team passwords – keep the stored ones (or create new).
        const { tournament } = ensurePasswords(data, await readTournament())
        await saveTournament(tournament)
        return json({ ok: true, passwords: passwordMap(tournament) })
      }

      case 'DELETE /api/tournament': {
        if (!(await isAdmin())) return json({ error: 'Login required' }, 401)
        await env.DB.prepare("DELETE FROM store WHERE key = ? OR key LIKE 'report:%'").bind(KEY).run()
        return json({ ok: true })
      }

      case 'GET /api/session':
        return json({ authRequired: true, loggedIn: await isAdmin() })

      case 'POST /api/login': {
        let body = {}
        try {
          body = await request.json()
        } catch {
          // ignore – treated as wrong credentials
        }
        if (await checkCredentials(auth, String(body.username ?? ''), String(body.password ?? ''))) {
          return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(await createToken(auth), secure) })
        }
        await new Promise((r) => setTimeout(r, 800)) // slow down password guessing
        return json({ error: 'Wrong username or password' }, 401)
      }

      case 'POST /api/logout':
        return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure) })

      case 'GET /api/info':
        // Online there is no "laptop address" – team links simply use this site's address.
        return json({ online: true, port: null, addresses: [] })

      default:
        return json({ error: 'Not found' }, 404)
    }
  },
}
