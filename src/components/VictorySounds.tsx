import { useCallback, useEffect, useRef, useState } from 'react'
import { Fanfare } from '../audio/fanfare'

/** Plays the winning fanfare when the results page opens; the button replays it. */
export function VictorySounds() {
  const [blocked, setBlocked] = useState(false)
  const fanfare = useRef<Fanfare | null>(null)

  const play = useCallback(async () => {
    fanfare.current ??= new Fanfare()
    setBlocked(!(await fanfare.current.play()))
  }, [])

  useEffect(() => {
    // Small delay so React StrictMode's mount/unmount/mount in dev doesn't play it twice.
    const t = window.setTimeout(play, 150)
    return () => {
      window.clearTimeout(t)
      fanfare.current?.close()
      fanfare.current = null
    }
  }, [play])

  return (
    <div className="victory-sounds">
      <button className={`sound-btn fanfare ${blocked ? 'attention' : ''}`} onClick={play} title="Play the winning fanfare">
        🎺 {blocked ? 'Play fanfare' : 'Fanfare!'}
      </button>
    </div>
  )
}
