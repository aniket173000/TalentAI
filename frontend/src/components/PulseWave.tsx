/**
 * PulseWave — the signature "fluency signal" of Nideknil Pulse.
 * Renders a team's (or an engineer's) fluency as an oscilloscope-style waveform
 * with a heat gradient (coral→amber = higher fluency). Driven by real trend
 * data; when there's too little history it synthesizes a stable "beat" from the
 * current score so the instrument still reads as a live signal.
 */
interface Props {
  values: number[]      // 0-100 fluency samples, oldest→newest
  height?: number
  showDot?: boolean
  id?: string           // unique gradient id when several waves share a page
}

const W = 600

function buildSeries(values: number[]): number[] {
  const clean = values.filter(v => typeof v === 'number' && !isNaN(v))
  if (clean.length >= 3) return clean
  const base = clean.length ? clean[clean.length - 1] : 60
  const n = 46
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    let v = base + Math.sin(t * Math.PI * 4) * 5 + Math.sin(t * Math.PI * 9 + 1) * 2.5
    const d = Math.abs(t - 0.6)                 // one characteristic beat
    if (d < 0.05) v += ((0.05 - d) / 0.05) * 24
    else if (d < 0.085) v -= 5
    out.push(v)
  }
  return out
}

function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

export default function PulseWave({ values, height = 150, showDot = true, id = 'pw' }: Props) {
  const series = buildSeries(values)
  const pad = 20
  const lo = Math.min(...series), hi = Math.max(...series)
  const span = Math.max(hi - lo, 1)
  const pts = series.map((v, i) => ({
    x: (i / (series.length - 1)) * W,
    y: height - pad - ((v - lo) / span) * (height - pad * 2),
  }))
  const line = smooth(pts)
  const area = `${line} L ${W} ${height} L 0 ${height} Z`
  const last = pts[pts.length - 1]

  return (
    <svg className="wave-box" viewBox={`0 0 ${W} ${height}`} width="100%" height={height}
         preserveAspectRatio="none" role="img" aria-label="Fluency signal over time">
      <defs>
        <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF6A3D" />
          <stop offset="100%" stopColor="#FFC24B" />
        </linearGradient>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF6A3D" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FF6A3D" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* faint baseline grid — instrument detail */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1="0" x2={W} y1={height * f} y2={height * f}
              stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}

      <path d={area} fill={`url(#${id}-area)`} preserveAspectRatio="none" style={{ opacity: 0.9 }} />
      <path className="wave-path" d={line} fill="none" stroke={`url(#${id}-stroke)`}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            filter={`url(#${id}-glow)`}
            style={{ strokeDasharray: 2400, ['--len' as any]: 2400 }} vectorEffect="non-scaling-stroke" />
      {showDot && (
        <circle className="wave-dot" cx={last.x} cy={last.y} r="5"
                fill="#FFC24B" stroke="#0E0B1A" strokeWidth="2" />
      )}
    </svg>
  )
}
