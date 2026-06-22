import type { VouchColor } from './Avatar'

interface ScoreRingProps {
  score: number
  color?: VouchColor
  size?: number
}

// Vouch — conic-gradient progress ring with the score in the center.
export default function ScoreRing({ score, color = 'violet', size = 58 }: ScoreRingProps) {
  const deg = Math.round((score / 100) * 360)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(var(--${color}) ${deg}deg, var(--track) ${deg}deg)` }} />
      <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: 'var(--surface)', display: 'grid', placeItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.32, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{score}</span>
      </div>
    </div>
  )
}
