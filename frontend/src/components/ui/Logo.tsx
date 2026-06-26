import type { CSSProperties } from 'react'
import Icon from './Icon'

interface LogoProps {
  size?: number
  label?: string
  /** Midnight Terminal variant: dark badge + accent-stroked mark with glow. */
  dark?: boolean
}

// Vouch-style wordmark: shield-in-violet-square + product name in display font.
export default function Logo({ size = 22, label = 'TalentAI', dark = false }: LogoProps) {
  const badge: CSSProperties = dark
    ? { background: '#101218', color: 'var(--violet)', border: '1px solid #262932', boxShadow: '0 0 16px rgba(157,124,255,.5)' }
    : { background: 'var(--violet)', color: '#fff', border: '2px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{
        width: size + 8, height: size + 8, borderRadius: 9,
        display: 'grid', placeItems: 'center', ...badge,
      }}>
        <Icon name="shield" size={size - 4} stroke={2.6} />
      </div>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{label}</span>
    </div>
  )
}
