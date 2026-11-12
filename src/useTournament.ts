import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreReport, Tournament } from './types'
import { DEFAULT_SETTINGS, emptyTournament } from './types'
import { uniquePasswords } from './logic/pairing'
import { mergeAcceptedReports } from './logic/reports'

const LOCAL_KEY = 'uusimaa-open-backup'

/** Accept data saved by older versions of the app (group stage + semifinal playoffs). */
export function migrate(raw: any): Tournament {
  const t: Tournament = { ...emptyTournament(), ...raw, settings: { ...DEFAULT_SETTINGS, ...raw.settings } }
  // gender is no longer collected – drop it from older saved players
  t.players = (raw.players ?? []).map(({ gender: _gender, ...p }: { gender?: string }) => p)
  if (Array.isArray(raw.matches) && raw.matches.some((m: { stage: string }) => m.stage === 'group' || m.stage === 'semi')) {
    t.matches = raw.matches
      .filter((m: { stage: string }) => m.stage === 'group')
      .map((m: { round?: number }) => ({ ...m, stage: 'round1', rotation: m.round ?? 1 }))
    t.secondRound = null
    t.finals = null
  }
  if ((t.step as string) === 'playoffs') t.step = 'schedule'
  return t
}

/** Pairs created before team passwords existed get one now. Returns true if anything was added. */
function ensureTeamPasswords(t: Tournament): boolean {
  const missing = t.pairs.filter((p) => !p.password)
  if (missing.length === 0) return false
  const fresh = uniquePasswords(missing.length, t.pairs.map((p) => p.password ?? ''))
  t.pairs = t.pairs.map((p) => (p.password ? p : { ...p, password: fresh.shift()! }))
  return true
}

/** Use the server's team passwords; returns the same object when nothing differs (no extra save). */
function syncPasswords(t: Tournament, passwords: Record<string, string | null>): Tournament {
  const differs = t.pairs.some((p) => passwords[p.id] && passwords[p.id] !== p.password)
  if (!differs) return t
  return { ...t, pairs: t.pairs.map((p) => (passwords[p.id] ? { ...p, password: passwords[p.id]! } : p)) }
}

export interface AuthState {
  /** true when the server has an admin login configured (online version). */
  required: boolean
  loggedIn: boolean
}

/**
 * Tournament state for the organizer app, loaded from and auto-saved to the backend
 * (local Express server or the online Cloudflare Worker). Also handles the admin login.
 */
export function useTournament() {
  const [state, setState] = useState<Tournament>(emptyTournament)
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [auth, setAuth] = useState<AuthState>({ required: false, loggedIn: true })
  const authRef = useRef(auth)
  authRef.current = auth
  const timer = useRef<number | undefined>(undefined)
  /** Only write to the server if we successfully loaded from it (never overwrite it with a stale backup). */
  const serverOk = useRef(false)
  /** Don't echo freshly loaded data straight back to the server. */
  const skipNextSave = useRef(true)
  /** Score reports from team pages, by match id (see shared/reports.js). */
  const [reports, setReports] = useState<Record<string, ScoreReport>>({})

  const loadFromServer = useCallback(async () => {
    const r = await fetch('/api/tournament', { cache: 'no-store' })
    if (r.status === 401) return false // online version: log in first
    if (!r.ok) throw new Error(String(r.status))
    const data = await r.json()
    const t = data ? migrate(data) : emptyTournament()
    // save right away if older pairs just got their team passwords, otherwise don't echo the data back
    skipNextSave.current = !ensureTeamPasswords(t)
    setState(t)
    serverOk.current = true
    return true
  }, [])

  useEffect(() => {
    const session = fetch('/api/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    const data = loadFromServer().catch(() => {
      const local = localStorage.getItem(LOCAL_KEY)
      if (local) setState(migrate(JSON.parse(local)))
    })
    Promise.all([session, data])
      .then(([s]) => {
        if (s) setAuth({ required: Boolean(s.authRequired), loggedIn: Boolean(s.loggedIn) })
      })
      .finally(() => setLoaded(true))
  }, [loadFromServer])

  useEffect(() => {
    if (!loaded) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state))
    if (!serverOk.current) {
      setSaveError(true)
      return
    }
    if (authRef.current.required && !authRef.current.loggedIn) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      fetch('/api/tournament', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
        .then(async (r) => {
          if (r.status === 401) setAuth((a) => ({ ...a, loggedIn: false }))
          setSaveError(!r.ok)
          // The server is the keeper of team passwords – take over any it created or kept.
          const body = r.ok ? ((await r.json().catch(() => null)) as { passwords?: Record<string, string | null> } | null) : null
          if (body?.passwords) setState((t) => syncPasswords(t, body.passwords!))
        })
        .catch(() => setSaveError(true))
    }, 250)
  }, [state, loaded])

  // Pick up score reports from team pages; scores both teams agreed on go straight into the matches.
  useEffect(() => {
    if (!loaded || (auth.required && !auth.loggedIn)) return
    let alive = true
    const poll = async () => {
      if (!serverOk.current || document.visibilityState === 'hidden') return
      const r = await fetch('/api/reports', { cache: 'no-store' }).catch(() => null)
      if (!alive || !r?.ok) return
      const latest = (await r.json()) as Record<string, ScoreReport>
      setReports(latest)
      setState((t) => mergeAcceptedReports(t, latest) ?? t)
    }
    poll()
    const id = window.setInterval(poll, 5000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [loaded, auth.required, auth.loggedIn])

  /** Remove a team report, e.g. after the organizer typed the score themselves. */
  const clearReport = useCallback(async (matchId: string) => {
    setReports(({ [matchId]: _gone, ...rest }) => rest)
    await fetch(`/api/reports/${encodeURIComponent(matchId)}`, { method: 'DELETE' }).catch(() => undefined)
  }, [])

  const update = useCallback((patch: Partial<Tournament> | ((t: Tournament) => Partial<Tournament>)) => {
    setState((t) => ({ ...t, ...(typeof patch === 'function' ? patch(t) : patch) }))
  }, [])

  const reset = useCallback(async () => {
    localStorage.removeItem(LOCAL_KEY)
    const r = await fetch('/api/tournament', { method: 'DELETE' }).catch(() => null)
    if (r?.status === 401) {
      setAuth((a) => ({ ...a, loggedIn: false }))
      return
    }
    setState(emptyTournament())
    setReports({})
  }, [])

  /** Returns an error message, or null when logged in. */
  const login = useCallback(
    async (username: string, password: string): Promise<string | null> => {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }).catch(() => null)
      if (!r) return "Can't reach the server"
      if (!r.ok) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Login failed'
      await loadFromServer().catch(() => undefined) // get the latest data before editing
      setSaveError(false)
      setAuth({ required: true, loggedIn: true })
      return null
    },
    [loadFromServer],
  )

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => undefined)
    setAuth((a) => ({ ...a, loggedIn: false }))
  }, [])

  return { state, update, reset, loaded, saveError, auth, login, logout, reports, clearReport }
}

export type UpdateFn = ReturnType<typeof useTournament>['update']

/** What the Program and Finals pages need to show and resolve team score reports. */
export interface ReportProps {
  reports: Record<string, ScoreReport>
  clearReport: (matchId: string) => void
}
