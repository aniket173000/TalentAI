import { useState } from 'react'
import { CollegeInfo } from '../types'
import { Card, Icon, Tag, type VouchColor } from './ui'

const COLORS: VouchColor[] = ['violet', 'pink', 'green', 'amber', 'cyan']
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

interface Props {
  college: CollegeInfo
  onSelect: () => void
}

export default function CollegeCard({ college, onSelect }: Props) {
  const [logoErr, setLogoErr] = useState(false)
  const color = COLORS[hashStr(college.college_name) % COLORS.length]

  const badge = college.short_name || college.college_name
    .split(/[\s,]+/).filter(w => /^[A-Z]/i.test(w)).map(w => w[0].toUpperCase()).slice(0, 4).join('')

  const pct = college.total > 0 ? (college.current_students / college.total) * 100 : 0

  return (
    <Card hover onClick={onSelect} padding={0} style={{ overflow: 'hidden' }}>
      {/* colored band */}
      <div style={{ height: 64, background: `var(--${color})`, borderBottom: '2px solid var(--ink)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--ink)', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, border: '2px solid var(--ink)', fontFamily: 'var(--font-mono)' }}>
            {college.total} {college.total === 1 ? 'member' : 'members'}
          </span>
        </div>
        <div style={{ position: 'absolute', bottom: -22, left: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 15, background: 'var(--surface)', border: '2px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {college.college_logo_url && !logoErr
              ? <img src={college.college_logo_url} alt={college.college_name} style={{ width: 40, height: 40, objectFit: 'contain' }} onError={() => setLogoErr(true)} />
              : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: `var(--${color}-ink)` }}>{badge || '🎓'}</span>}
          </div>
        </div>
      </div>

      <div style={{ padding: '32px 20px 20px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0, lineHeight: 1.15 }}>{college.college_name}</h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          <Tag tone="match">📚 {college.current_students} studying</Tag>
          <Tag>🎓 {college.alumni} alumni</Tag>
        </div>

        {college.total > 0 && (
          <div style={{ marginTop: 14, height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', border: '1px solid var(--line)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: `var(--${color})`, borderRadius: 99 }} />
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{college.total > 0 ? 'See all members' : 'Be the first'}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: `var(--${color}-ink)`, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-display)' }}>
            Explore <Icon name="arrow" size={14} stroke={2.6} />
          </span>
        </div>
      </div>
    </Card>
  )
}
