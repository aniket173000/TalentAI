import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Avatar, Button, Card, Icon, PoolMeter, Tag, type VouchColor } from '../components/ui'
import { CompanyReferrals, ReferralPost } from '../types'

const COLORS: VouchColor[] = ['violet', 'pink', 'green', 'amber', 'cyan']
function colorFor(s: string): VouchColor {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

function daysLeft(closesAt: string | null): string {
  if (!closesAt) return ''
  const diff = new Date(closesAt).getTime() - Date.now()
  if (diff <= 0) return 'closing'
  const days = Math.floor(diff / 86400000)
  if (days === 0) return `${Math.max(1, Math.floor(diff / 3600000))}h left`
  return `${days}d left`
}

function PoolCard({ post, onOpen }: { post: ReferralPost; onOpen: () => void }) {
  const r = post.referrer
  const color = colorFor(r?.full_name ?? post.company_name)
  const full = post.spots_remaining <= 0
  const filled = Math.max(0, post.pool_size - post.spots_remaining)

  return (
    <Card hover onClick={onOpen} padding={22}>
      {/* referrer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
        <Avatar initials={(r?.full_name ?? '?').charAt(0).toUpperCase()} color={color} size={38} />
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r?.full_name ?? 'Employee'}</span>
            {r?.linkedin_verified && <Icon name="shield" size={13} stroke={2.4} style={{ color: 'var(--violet)', flexShrink: 0 }} />}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>refers for this role</div>
        </div>
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {full
            ? <Tag icon="lock" tone="full">Pool full</Tag>
            : <Tag icon="spark" tone="match">{post.spots_remaining} open</Tag>}
        </div>
      </div>

      {/* role */}
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.025em', color: 'var(--ink)', margin: '0 0 10px' }}>
        {post.title}
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {post.location && <Tag icon="pin">{post.location}</Tag>}
        {post.employment_type && <Tag icon="bag">{post.employment_type}</Tag>}
      </div>

      <PoolMeter filled={filled} cap={post.pool_size} color={color} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <Button size="sm" variant="dark" iconRight="arrow" onClick={(e) => { e.stopPropagation(); onOpen() }} style={{ flex: 1 }}>
          View &amp; get referral
        </Button>
        {post.closes_at && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {daysLeft(post.closes_at)}
          </span>
        )}
      </div>
    </Card>
  )
}

export default function CompanyReferralDetail() {
  const { companyName } = useParams<{ companyName: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CompanyReferrals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!companyName) return
    api.get<CompanyReferrals>(`/referrals/company/${encodeURIComponent(companyName)}`)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load referrals for this company.'))
      .finally(() => setLoading(false))
  }, [companyName])

  if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner /></div>
  if (error) return <div className="text-center py-24" style={{ color: 'var(--muted)', fontWeight: 600 }}>{error}</div>
  if (!data) return null

  const posts: ReferralPost[] = data.jobs.flatMap(j => j.referrers)
  const referrers = new Set(posts.map(p => p.referrer?.full_name).filter(Boolean)).size
  const spotsLeft = posts.reduce((n, p) => n + Math.max(0, p.spots_remaining), 0)
  const badgeColor = colorFor(data.company_name)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-24">
      <button onClick={() => navigate('/referrals')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-body)', margin: '22px 0 16px', padding: 0 }}>
        <Icon name="back" size={18} stroke={2.4} /> All companies
      </button>

      {/* company header banner */}
      <Card hero padding={28} radius={26} style={{ marginBottom: 24, boxShadow: '6px 6px 0 var(--card-shadow)', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{
          width: 70, height: 70, borderRadius: 18, background: `var(--${badgeColor})`, color: '#fff',
          display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 34, flexShrink: 0, border: '2px solid var(--ink)', boxShadow: '3px 3px 0 var(--ink)',
        }}>{data.company_name.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, letterSpacing: '-0.03em', margin: 0, color: 'var(--ink)' }}>{data.company_name}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--ink)', opacity: 0.6, fontSize: 14, fontWeight: 600 }}>Employee referrals · capped pools · instant decisions</p>
        </div>
        <div style={{ display: 'flex', gap: 26 }}>
          {([['People referring', referrers], ['Open roles', posts.length], ['Spots left', spotsLeft]] as [string, number][]).map(([k, v]) => (
            <div key={k}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 30, color: 'var(--ink)', lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 12, color: 'var(--ink)', opacity: 0.6, fontWeight: 600, marginTop: 4 }}>{k}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* explainer strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '12px 18px', background: 'var(--violet-soft)', border: '1.5px solid var(--violet-line)', borderRadius: 14, color: 'var(--violet-ink)', fontWeight: 600, fontSize: 14 }}>
        <Icon name="users" size={18} stroke={2.2} style={{ flexShrink: 0 }} />
        <span>Each referrer keeps a capped pool. Open a post to see the role, then apply to claim a spot — make the shortlist and the referral is yours.</span>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--muted)', fontWeight: 600 }}>No open referrals at this company right now.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px,100%), 1fr))', gap: 20 }}>
          {posts.map(post => (
            <PoolCard key={post.id} post={post} onOpen={() => navigate(`/referrals/${post.slug || post.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
