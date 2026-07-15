import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Button, Card, Icon, Tag, type VouchColor } from '../components/ui'
import { ReferralCompany } from '../types'

const BADGE_COLORS: VouchColor[] = ['violet', 'pink', 'green', 'amber', 'cyan']
function colorFor(name: string): VouchColor {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return BADGE_COLORS[h % BADGE_COLORS.length]
}

function CompanyCard({ company, onClick }: { company: ReferralCompany; onClick: () => void }) {
  const color = colorFor(company.company_name)
  return (
    <Card hover onClick={onClick} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 15, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: `var(--${color})`, color: '#fff', border: '2px solid var(--ink)',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, boxShadow: '2px 2px 0 var(--ink)',
        }}>{company.company_name.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, letterSpacing: '-0.025em', margin: '2px 0 6px', color: 'var(--ink)' }}>
            {company.company_name}
          </h3>
          <Tag icon="spark" tone="match">
            {company.open_referral_count} open referral{company.open_referral_count === 1 ? '' : 's'}
          </Tag>
        </div>
      </div>

      {/* role tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18, flex: 1, alignContent: 'flex-start' }}>
        {company.job_titles.slice(0, 4).map(t => <Tag key={t}>{t}</Tag>)}
        {company.job_titles.length > 4 && (
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, alignSelf: 'center' }}>
            +{company.job_titles.length - 4} more
          </span>
        )}
      </div>

      <Button full variant="dark" iconRight="arrow" size="md" onClick={(e) => { e.stopPropagation(); onClick() }}>
        View referrals
      </Button>
    </Card>
  )
}

export default function CompanyReferrals() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<ReferralCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get<ReferralCompany[]>('/referrals/companies')
      .then(r => setCompanies(r.data))
      .catch(() => setError('Failed to load referral companies.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = companies.filter(c =>
    !search.trim() ||
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    c.job_titles.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  const totalReferrals = companies.reduce((n, c) => n + c.open_referral_count, 0)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-24">
      {/* hero */}
      <section style={{ marginTop: 30, marginBottom: 28 }}>
        <div style={{ marginBottom: 14 }}>
          <Tag icon="bolt" tone="longshot">Get referred, not ignored</Tag>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(30px, 8vw, 48px)', lineHeight: 1.05, letterSpacing: '-0.035em', margin: '0 0 14px', color: 'var(--ink)', maxWidth: 760, textWrap: 'balance' }}>
          Find who's referring — and claim a spot in their pool.
        </h1>
        <p style={{ margin: 0, fontSize: 17, color: 'var(--muted)', fontWeight: 500, maxWidth: 600, lineHeight: 1.5 }}>
          Every referrer keeps a capped pool of candidates. Browse, apply, and find out
          instantly whether you made the shortlist — <b style={{ color: 'var(--ink)' }}>no resume black hole</b>.
        </p>
        <div style={{ display: 'flex', gap: 26, marginTop: 24 }}>
          {([['Companies', companies.length], ['Open referrals', totalReferrals]] as [string, number][]).map(([k, v]) => (
            <div key={k}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.02em' }}>{v}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>{k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', background: 'var(--surface)', border: '2px solid var(--ink)', borderRadius: 14, flex: 1, maxWidth: 420, boxShadow: '3px 3px 0 var(--card-shadow)' }}>
          <Icon name="search" size={18} stroke={2.2} style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies or roles"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--ink)', width: '100%' }} />
        </div>
        <Button variant="primary" iconRight="arrow" onClick={() => navigate('/referrals/create')} style={{ marginLeft: 'auto' }}>
          Refer candidates
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : error ? (
        <div className="text-center py-16" style={{ color: 'var(--muted)', fontWeight: 600 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--muted)', fontWeight: 600 }}>
          {search ? 'No companies match your search.' : 'No active referrals yet — check back soon.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(330px,100%), 1fr))', gap: 20 }}>
          {filtered.map(company => (
            <CompanyCard
              key={company.company_name}
              company={company}
              onClick={() => navigate(`/referrals/company/${encodeURIComponent(company.company_name)}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
