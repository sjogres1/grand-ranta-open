import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreReport, Tournament } from './types'
import { emptyTournament } from './types'
import { migrate } from './useTournament'
import type { ReportActionInput } from '../shared/reports.js'

export type TeamStatus = 'need-password' | 'loading' | 'ok' | 'wrong' | 'not-found' | 'no-password' | 'error'

interface TeamResponse {
  tournament: Tournament | null
  reports: ScoreReport[]
}

/** How often a team page checks for updates (only while the page is visible). */
const CHECK_EVERY_MS = 15_000
/** …and while a score is waiting for confirmation, so the other team's answer shows up quickly. */
const CHECK_FAST_MS = 5_000

/**
 * Read-only, auto-refreshing tournament data for one team page, plus the team's score reports.
 * The server only answers with the right team password and never includes any passwords.
 *
 * Polling is kept light on purpose: ~4 requests/minute per open phone fits 30 users comfortably
 * within the Cloudflare free plan (100,000 requests/day), and locked phones don't poll at all.
 */
export function useTeamData(slug: string, password: string) {
  const [state, setState] = useState<Tournament | null>(null)
  const [reports, setReports] = useState<ScoreReport[]>([])
  const [status, setStatus] = useState<TeamStatus>(password ? 'loading' : 'need-password')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [offline, setOffline] = useState(false)
  const reload = useRef<() => void>(() => undefined)
  const intervalMs = reports.some((r) => r.status === 'pending') ? CHECK_FAST_MS : CHECK_EVERY_MS

  const apply = useCallback((data: TeamResponse) => {
    setState(data.tournament ? migrate(data.tournament) : emptyTournament())
    setReports(data.reports ?? [])
    setUpdatedAt(new Date())
    setStatus('ok')
  }, [])

  useEffect(() => {
    if (!password) {
      setStatus('need-password')
      return
    }
    let alive = true
    let id: number | undefined
    const stop = () => window.clearInterval(id)

    const load = async (force = false) => {
      if (!force && document.visibilityState === 'hidden') return // don't poll from background tabs / locked phones
      try {
        const r = await fetch(`/api/team/${encodeURIComponent(slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          cache: 'no-store',
        })
        if (!alive) return
        setOffline(false)
        if (r.ok) return apply(await r.json())
        // wrong password, team renamed (reshuffle) etc. – stop polling until something changes
        stop()
        setStatus(r.status === 401 ? 'wrong' : r.status === 404 ? 'not-found' : r.status === 403 ? 'no-password' : 'error')
      } catch {
        if (alive) setOffline(true)
      }
    }
    reload.current = () => void load(true)

    setStatus((s) => (s === 'ok' ? s : 'loading'))
    load()
    id = window.setInterval(load, intervalMs)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [slug, password, intervalMs, apply])

  /** Report / accept / reject / withdraw a score. Returns an error message, or null on success. */
  const act = useCallback(
    async (action: ReportActionInput): Promise<string | null> => {
      const r = await fetch(`/api/team/${encodeURIComponent(slug)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ...action }),
      }).catch(() => null)
      if (!r) return "Can't reach the server – try again."
      if (!r.ok) {
        reload.current() // someone else may have changed the game meanwhile
        return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong'
      }
      apply(await r.json())
      return null
    },
    [slug, password, apply],
  )

  return { state, reports, status, updatedAt, offline, act }
}
