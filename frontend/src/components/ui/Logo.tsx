import Icon from './Icon'

interface LogoProps {
  size?: number
  label?: string
}

// Vouch-style wordmark: shield-in-violet-square + product name in display font.
export default function Logo({ size = 22, label = 'TalentAI' }: LogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{
        width: size + 8, height: size + 8, borderRadius: 9, background: 'var(--violet)',
        display: 'grid', placeItems: 'center', color: '#fff', border: '2px solid var(--ink)',
        boxShadow: '2px 2px 0 var(--ink)',
      }}>
        <Icon name="shield" size={size - 4} stroke={2.6} />
      </div>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{label}</span>
    </div>
  )
}
