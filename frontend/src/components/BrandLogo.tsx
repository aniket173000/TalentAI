import { ReactNode, useEffect, useState } from 'react'

// ──────────────────────────────────────────────────────────────────────────
// One logo tile for companies and colleges, used everywhere a brand name shows.
// Renders the resolved logo on a clean tile; on a missing/broken logo it falls
// back to a deterministic colour monogram (or a caller-supplied node, e.g. a
// graduation-cap icon for schools). The colour is keyed by name so the same
// brand always gets the same tint.
// ──────────────────────────────────────────────────────────────────────────

const PALETTE: { soft: string; ink: string }[] = [
  { soft: '#E7F0FF', ink: '#2D6FE0' }, // blue
  { soft: '#EDE9FE', ink: '#6D45D9' }, // violet
  { soft: '#DCFCE7', ink: '#15894F' }, // emerald
  { soft: '#FEF3C7', ink: '#B5740B' }, // amber
  { soft: '#FFE4E6', ink: '#C2363B' }, // rose
  { soft: '#E0E7FF', ink: '#3A4FB8' }, // indigo
  { soft: '#CCFBF1', ink: '#0B7E7E' }, // teal
  { soft: '#FFEDD5', ink: '#C05621' }, // orange
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

interface Props {
  name: string
  logoUrl?: string | null
  /** Tile size in px (square). Default 40. */
  size?: number
  /** Corner radius in px. Default 12. */
  radius?: number
  className?: string
  /** Rendered instead of the monogram when there is no logo (e.g. an icon). */
  fallback?: ReactNode
}

export default function BrandLogo({ name, logoUrl, size = 40, radius = 12, className, fallback }: Props) {
  const [errored, setErrored] = useState(false)

  // A freshly-resolved logo can arrive on the next fetch — reset the error gate
  // whenever the URL changes so we retry the new one.
  useEffect(() => { setErrored(false) }, [logoUrl])

  const p = PALETTE[hashStr(name || '?') % PALETTE.length]
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  const showLogo = !!logoUrl && !errored

  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        background: showLogo ? '#fff' : p.soft,
        border: showLogo ? '1px solid #ECECEF' : 'none',
      }}
      title={name || undefined}
    >
      {showLogo ? (
        <img
          src={logoUrl as string}
          alt={name}
          onError={() => setErrored(true)}
          style={{ width: '78%', height: '78%', objectFit: 'contain' }}
        />
      ) : fallback ? (
        fallback
      ) : (
        <span style={{ fontWeight: 800, fontSize: size * 0.4, color: p.ink, lineHeight: 1 }}>
          {initial}
        </span>
      )}
    </div>
  )
}
