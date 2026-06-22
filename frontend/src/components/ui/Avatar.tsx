// Vouch — initials in a tinted squircle, with optional colored ring.
export type VouchColor = 'violet' | 'green' | 'amber' | 'red' | 'pink' | 'cyan'

interface AvatarProps {
  initials: string
  color?: VouchColor
  size?: number
  ring?: boolean
}

export default function Avatar({ initials, color = 'violet', size = 44, ring = false }: AvatarProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.34,
      display: 'grid', placeItems: 'center', flexShrink: 0,
      background: `var(--${color}-soft)`, color: `var(--${color}-ink)`,
      border: ring ? `2px solid var(--${color})` : '1.5px solid var(--line)',
      fontWeight: 800, fontSize: size * 0.36, letterSpacing: '-0.02em',
      fontFamily: 'var(--font-display)',
    }}>{initials}</div>
  )
}
