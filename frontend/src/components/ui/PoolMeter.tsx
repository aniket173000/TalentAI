import type { VouchColor } from './Avatar'

interface PoolMeterProps {
  filled: number
  cap: number
  color?: VouchColor
  showLabel?: boolean
}

// Vouch — labeled fill bar: "{filled} / {cap} in pool" + spots-left / POOL FULL.
export default function PoolMeter({ filled, cap, color = 'violet', showLabel = true }: PoolMeterProps) {
  const pct = cap > 0 ? Math.round((filled / cap) * 100) : 0
  const full = filled >= cap
  const left = cap - filled
  return (
    <div style={{ width: '100%' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
            {filled} / {cap} in pool
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: full ? 'var(--red-ink)' : `var(--${color}-ink)` }}>
            {full ? 'POOL FULL' : `${left} spot${left === 1 ? '' : 's'} left`}
          </span>
        </div>
      )}
      <div style={{ height: 9, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', border: '1px solid var(--line)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: full ? 'var(--red)' : `var(--${color})`, transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }} />
      </div>
    </div>
  )
}
