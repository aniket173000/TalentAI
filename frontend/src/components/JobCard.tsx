import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Job } from '../types'
import { Button, Card, PoolMeter, Tag, type VouchColor } from './ui'

interface Props {
  job: Job
}

const COLORS: VouchColor[] = ['violet', 'pink', 'green', 'amber', 'cyan']
function colorFor(s: string): VouchColor {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

export default function JobCard({ job }: Props) {
  const { isRecruiter } = useAuth()
  const navigate = useNavigate()
  const spotsLeft = job.max_count - job.active_applications
  const full = spotsLeft <= 0
  const color = colorFor(job.company)

  return (
    <Card hover onClick={() => navigate(`/jobs/${job.slug || job.id}`)} padding={22}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: `var(--${color})`, color: '#fff', border: '2px solid var(--ink)',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, boxShadow: '2px 2px 0 var(--ink)',
        }}>{job.company.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--ink)', margin: 0 }}>{job.title}</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, margin: '3px 0 0' }}>{job.company} · {job.location}</p>
        </div>
        {full
          ? <Tag icon="lock" tone="full">Full</Tag>
          : <Tag icon="spark" tone={spotsLeft <= 3 ? 'longshot' : 'match'}>{spotsLeft} left</Tag>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {job.employment_type && <Tag icon="bag">{job.employment_type}</Tag>}
        {job.remote_policy && <Tag icon="pin">{job.remote_policy}</Tag>}
        {job.is_campus_hiring && <Tag icon="users" tone="longshot">Campus</Tag>}
      </div>

      <PoolMeter filled={job.active_applications} cap={job.max_count} color={color} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <Button size="sm" variant="dark" iconRight="arrow" onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.slug || job.id}`) }} style={{ flex: 1 }}>
          {isRecruiter ? 'View details' : 'View & apply'}
        </Button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          min {job.min_match_score}%
        </span>
      </div>
    </Card>
  )
}
