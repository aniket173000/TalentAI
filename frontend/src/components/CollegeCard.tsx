import { useState } from 'react'
import { CollegeInfo } from '../types'
import { MT, brandOf, hexA, kfmt } from '../pages/collegesTheme'

interface Props {
  college: CollegeInfo
  /** Active accent (palette + candidate/recruiter mode), e.g. "#9D7CFF". */
  accent: string
  /** Accent at 50% alpha, for glows. */
  accentGlow: string
  /** Community-strength fill, 0–1 (member count relative to the largest college). */
  fill: number
  /** Stat-chip labels + CTA verb, from the active mode. */
  chipA: string
  chipB: string
  cta: string
  onSelect: () => void
}

// Midnight Terminal — dark neon college card. 4px brand top bar, brand-tinted
// monogram tile, mono stat chips, accent strength bar with glow, accent CTA.
export default function CollegeCard({ college, accent, accentGlow, fill, chipA, chipB, cta, onSelect }: Props) {
  const [logoErr, setLogoErr] = useState(false)
  const [hover, setHover] = useState(false)

  const brand = brandOf(college.college_name)
  const badge = college.short_name || college.college_name
    .split(/[\s,]+/).filter(w => /^[A-Z]/i.test(w)).map(w => w[0].toUpperCase()).slice(0, 4).join('')
  const fillPct = Math.round(Math.max(0, Math.min(1, fill)) * 100) + '%'

  return (
    <article
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        background: MT.cardGrad,
        border: `1px solid ${hover ? brand : MT.border2}`,
        borderRadius: 18,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform .18s cubic-bezier(.2,.7,.2,1), box-shadow .18s, border-color .18s',
        transform: hover ? 'translateY(-5px)' : 'none',
        boxShadow: hover ? `0 0 0 1px ${brand}, 0 18px 40px -12px ${hexA(brand, 0.5)}` : 'none',
      }}
    >
      <div style={{ height: 4, background: brand }} />
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{
            width: 50, height: 50, borderRadius: 12, background: hexA(brand, 0.14),
            border: `1px solid ${brand}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', fontFamily: MT.mono, fontWeight: 700, fontSize: 14, color: brand,
          }}>
            {college.college_logo_url && !logoErr
              ? <img src={college.college_logo_url} alt={college.college_name} style={{ width: 36, height: 36, objectFit: 'contain' }} onError={() => setLogoErr(true)} />
              : (badge || '🎓')}
          </div>
          <div style={{
            fontFamily: MT.mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
            color: MT.muted, border: `1px solid ${MT.border3}`, borderRadius: 999, padding: '5px 10px',
          }}>
            {kfmt(college.total)} members
          </div>
        </div>

        <h3 style={{ margin: '16px 0 0', fontSize: 21, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.15, color: MT.text }}>
          {college.college_name}
        </h3>
        {college.short_name && (
          <div style={{ fontFamily: MT.mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: MT.faint2, marginTop: 6 }}>
            {college.short_name}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <span style={{ fontFamily: MT.mono, fontSize: 11, borderRadius: 8, padding: '6px 10px', background: MT.chipBg, border: `1px solid ${MT.chipLine}`, color: '#C7CAD2' }}>
            <b style={{ color: '#fff' }}>{kfmt(college.current_students)}</b> {chipA}
          </span>
          <span style={{ fontFamily: MT.mono, fontSize: 11, borderRadius: 8, padding: '6px 10px', background: MT.chipBg, border: `1px solid ${MT.chipLine}`, color: '#C7CAD2' }}>
            <b style={{ color: '#fff' }}>{college.alumni}</b> {chipB}
          </span>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MT.mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: MT.faint2, marginBottom: 7 }}>
            <span>community strength</span><span style={{ color: accent }}>{fillPct}</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: MT.track, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: fillPct, borderRadius: 999, background: accent, boxShadow: `0 0 12px ${accentGlow}` }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid #1C1E25' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: MT.faint }}>
            {college.total > 0 ? 'See all members' : 'Be the first'}
          </span>
          <button
            onClick={onSelect}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 10,
              background: accent, color: MT.onAccent, fontFamily: MT.font, fontWeight: 700, fontSize: 13,
              padding: '9px 14px', cursor: 'pointer', transition: 'box-shadow .15s',
              boxShadow: hover ? `0 0 22px ${accentGlow}` : 'none',
            }}
          >
            {cta} →
          </button>
        </div>
      </div>
    </article>
  )
}
