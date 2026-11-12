import { useEffect, useState } from 'react'
import type { Pair } from '../types'
import { slugify } from '../logic/slug'

const AUTO_HIDE_MS = 60_000

interface Props {
  pair: Pair
  /** "Anna & Ben" */
  names: string
  /** Base address for team pages, see useTeamBaseUrl. */
  base: string
  /** Give the team a new password (e.g. if it leaked). */
  onNewPassword?: () => void
}

/**
 * A team's page link + password for the organizer. Hidden by default (the screen may be on a
 * projector); "Show" reveals it for one team and it hides itself again after a minute.
 */
export function TeamInvite({ pair, names, base, onNewPassword }: Props) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => setShown(false), AUTO_HIDE_MS)
    return () => window.clearTimeout(t)
  }, [shown])

  if (!pair.password) return null
  const url = `${base}/${slugify(pair.name)}`
  const invite = `🏸 Grand Räntä Open – ${pair.name} (${names})\nYour team page: ${url}\nPassword: ${pair.password}`

  if (!shown) {
    return (
      <button className="reveal-btn" onClick={() => setShown(true)} title="Only show this when the screen isn't visible to others">
        🔒 Show password & link
      </button>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      prompt('Copy this and send it to the team:', invite)
    }
  }

  return (
    <div className="invite">
      <div className="invite-row">
        <span className="muted small">Password</span>
        <code className="invite-pw">{pair.password}</code>
      </div>
      <div className="invite-row">
        <span className="muted small">Team page</span>
        {/* the organizer's own click opens the page directly, without typing the password */}
        <a href={`${url}?pw=${encodeURIComponent(pair.password)}`} target="_blank" rel="noreferrer" className="invite-link">
          {url.replace(/^https?:\/\//, '')}
        </a>
      </div>
      <div className="invite-actions">
        <button className="btn-primary small" onClick={copy}>
          {copied ? '✓ Copied – paste in WhatsApp' : '📋 Copy invite'}
        </button>
        <button className="btn-ghost small" onClick={() => setShown(false)}>
          Hide
        </button>
        {onNewPassword && (
          <button
            className="link-btn"
            title="Give this team a new password – the old one stops working"
            onClick={() => {
              if (confirm(`Give ${pair.name} a new password? The old one stops working on their phones.`)) onNewPassword()
            }}
          >
            ↻ new password
          </button>
        )}
      </div>
    </div>
  )
}
