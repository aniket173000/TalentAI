import { useState } from 'react'
import { Job } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// "Gradient Hero" company card. Each company is keyed (by a stable hash of its
// name) to one of these gradient pairs; `ink` is the matching solid used for
// the monogram letter on the white logo tile.
// ──────────────────────────────────────────────────────────────────────────
const GRADIENTS: { from: string; to: string; ink: string }[] = [
  { from: '#15A86A', to: '#0E7D4E', ink: '#15A86A' }, // green
  { from: '#2D7FF9', to: '#1E5FD0', ink: '#2D7FF9' }, // blue
  { from: '#F2810C', to: '#D86A00', ink: '#F2810C' }, // orange
  { from: '#19A0E8', to: '#1278C4', ink: '#19A0E8' }, // sky
  { from: '#E5484D', to: '#C2363B', ink: '#E5484D' }, // red
  { from: '#3A5BDA', to: '#283FA0', ink: '#3A5BDA' }, // indigo
  { from: '#7C5CE0', to: '#5A3FC0', ink: '#7C5CE0' }, // violet
  { from: '#E84393', to: '#C42777', ink: '#E84393' }, // pink
  { from: '#0EA5A5', to: '#0B7E7E', ink: '#0EA5A5' }, // teal
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

function getBestLogoUrl(jobs: Job[]): string | null {
  const resolved = jobs.find(j => j.company_logo_url)?.company_logo_url
  if (resolved) return resolved
  const companyUrl = jobs.find(j => j.company_url)?.company_url
  if (!companyUrl) return null
  try {
    const full = companyUrl.startsWith('http') ? companyUrl : `https://${companyUrl}`
    const { hostname } = new URL(full)
    if (hostname.includes('linkedin.com')) return null
    return `https://logo.clearbit.com/${hostname}`
  } catch {
    return null
  }
}

interface Props {
  name: string
  jobs: Job[]
  onSelect: () => void
}

export default function CompanyCard({ name, jobs, onSelect }: Props) {
  const [logoError, setLogoError] = useState(false)
  const [hover, setHover] = useState(false)

  const g = GRADIENTS[hashStr(name) % GRADIENTS.length]
  const logoUrl = getBestLogoUrl(jobs)
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  // Category chips: prefer departments; fall back to unique locations so the
  // chip row is never empty.
  const departments = [...new Set(jobs.map(j => j.department).filter((d): d is string => !!d))]
  const tags = (departments.length > 0
    ? departments
    : [...new Set(jobs.map(j => j.location).filter(Boolean))]
  ).slice(0, 3)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        border: '1px solid #ECECEF',
        borderRadius: 22,
        boxShadow: hover
          ? '0 14px 34px rgba(17,17,26,.12), 0 3px 8px rgba(17,17,26,.06)'
          : '0 6px 20px rgba(17,17,26,.06), 0 1px 3px rgba(17,17,26,.04)',
        overflow: 'hidden',
        cursor: 'pointer',
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'transform .18s cubic-bezier(.2,.7,.2,1), box-shadow .18s ease',
      }}
    >
      {/* Gradient hero */}
      <div style={{ padding: 22, background: `linear-gradient(135deg, ${g.from} 0%, ${g.to} 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{
            width: 52, height: 52, background: '#fff', borderRadius: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {logoUrl && !logoError
              ? <img src={logoUrl} alt={name} style={{ width: 36, height: 36, objectFit: 'contain' }} onError={() => setLogoError(true)} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: g.ink }}>{initial}</span>}
          </div>
          <span style={{
            background: 'rgba(255,255,255,.22)', color: '#fff', fontSize: 12, fontWeight: 700,
            padding: '5px 11px', borderRadius: 999, backdropFilter: 'blur(4px)', whiteSpace: 'nowrap',
          }}>
            {jobs.length} open
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 16, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          {name}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 22px 22px' }}>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {tags.map(t => (
              <span key={t} style={{ background: '#F4F4F6', color: '#494951', fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 999 }}>
                {t}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: tags.length > 0 ? 16 : 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#15894F' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', boxShadow: '0 0 0 3px rgba(22,163,74,.16)' }} />
            Actively hiring
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#6E6878' }}>
            {jobs.length} open {jobs.length === 1 ? 'position' : 'positions'}
          </span>
        </div>

        <div style={{
          marginTop: 16, background: hover ? '#000' : '#16161D', color: '#fff',
          fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
          padding: 11, borderRadius: 13, textAlign: 'center',
          transition: 'background .15s ease',
        }}>
          View roles →
        </div>
      </div>
    </div>
  )
}
