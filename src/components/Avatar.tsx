const COLORS = ['#ff4d6d', '#4cc9f0', '#ffd166', '#2ec4b6', '#c6ff3d', '#b388ff', '#ff9f43', '#5eead4']

/** Round badge with the player's initial; the colour is stable per name. */
export function Avatar({ name }: { name: string }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return (
    <span className="avatar" style={{ background: COLORS[hash % COLORS.length] }} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
