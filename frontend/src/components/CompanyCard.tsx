import { useState } from 'react'
import { Job } from '../types'
import { Card, Icon, Tag, type VouchColor } from './ui'

const COLORS: VouchColor[] = ['violet', 'pink', 'green', 'amber', 'cyan']
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
  const color = COLORS[hashStr(name) % COLORS.length]
  const logoUrl = getBestLogoUrl(jobs)
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const departments = [...new Set(jobs.map(j => j.department).filter((d): d is string => !!d))].slice(0, 3)
  const locations = jobs.map(j => j.location).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2)

  return (
    <Card hover onClick={onSelect} padding={0} style={{ overflow: 'hidden' }}>
      {/* colored band */}
      <div style={{ height: 64, background: `var(--${color})`, borderBottom: '2px solid var(--ink)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <span style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--ink)', fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 99, border: '2px solid var(--ink)', fontFamily: 'var(--font-mono)' }}>
            {jobs.length} {jobs.length === 1 ? 'role' : 'roles'}
          </span>
        </div>
        <div style={{ position: 'absolute', bottom: -22, left: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 15, background: 'var(--surface)', border: '2px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {logoUrl && !logoError
              ? <img src={logoUrl} alt={name} style={{ width: 40, height: 40, objectFit: 'contain' }} onError={() => setLogoError(true)} />
              : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: `var(--${color}-ink)` }}>{initials}</span>}
          </div>
        </div>
      </div>

      <div style={{ padding: '32px 20px 20px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-0.025em', color: 'var(--ink)', margin: 0, lineHeight: 1.1 }}>{name}</h3>

        {departments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {departments.map(d => <Tag key={d}>{d}</Tag>)}
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{locations.join(' · ')}</span>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--violet-ink)', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-display)' }}>
            View roles <Icon name="arrow" size={15} stroke={2.6} />
          </span>
        </div>
      </div>
    </Card>
  )
}
