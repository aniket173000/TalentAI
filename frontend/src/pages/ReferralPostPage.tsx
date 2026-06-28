import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import JDFormatter from '../components/JDFormatter'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { Avatar, Button, Card, Icon, PoolMeter, Tag, type VouchColor } from '../components/ui'
import { ReferralLeaderboard, ReferralPost } from '../types'

interface JDRequirementGroup { skills: string[]; match_type: 'any' | 'all'; required: boolean; context?: string }

const COLORS: VouchColor[] = ['violet', 'pink', 'green', 'amber', 'cyan']
function colorFor(s: string): VouchColor {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

interface ApplyResult {
  result: 'pool_accepted' | 'waitlisted' | 'rejected'
  reason?: string
  match_score: number
  rank?: number
  waitlist_rank?: number
  detail?: string
  gaps?: string[]
  suggestions?: string[]
}

// ── Confetti (mixed semantic colors, transform-only animation) ──
function Confetti({ color }: { color: VouchColor }) {
  const cols = [`var(--${color})`, 'var(--violet)', 'var(--pink)', 'var(--green)', 'var(--amber)']
  const pieces = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.5, dur: 1.6 + Math.random() * 1.2,
    bg: cols[i % cols.length], size: 7 + Math.random() * 7, rot: Math.random() * 360,
  })), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 24 }}>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', top: -20, left: `${p.left}%`, width: p.size, height: p.size * 0.6,
          background: p.bg, borderRadius: 2, transform: `rotate(${p.rot}deg)`,
          animation: `vouch-fall ${p.dur}s ${p.delay}s cubic-bezier(.3,.6,.5,1) forwards`,
        }} />
      ))}
    </div>
  )
}

const SCAN_LINES = ['Matching your skills', 'Checking experience', 'Scoring against the role']

function EligibilityModal({
  post, color, phase, step, result, error, onClose, onBrowse,
}: {
  post: ReferralPost; color: VouchColor
  phase: 'scanning' | 'result'; step: number
  result: ApplyResult | null; error: string
  onClose: () => void; onBrowse: () => void
}) {
  const me = (n?: string | null) => (n ? n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : 'You')
  const { user } = useAuth()

  return (
    <div className="vouch-overlay" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(20,16,30,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="vouch-modal" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(540px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 26, border: '2px solid var(--ink)', boxShadow: '8px 8px 0 var(--violet)', padding: 28, position: 'relative' }}>

        {phase === 'scanning' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
              <Avatar initials={me(user?.full_name)} color="violet" size={44} ring />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Checking your profile…</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Matching you against the pool</div>
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', marginBottom: 18, border: '1px solid var(--line)' }}>
              <div style={{ height: '100%', borderRadius: 99, background: 'var(--violet)', width: `${(step / SCAN_LINES.length) * 100}%`, transition: 'width .5s ease' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SCAN_LINES.map((label, i) => {
                const done = i < step
                const active = i === step
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: active ? 'var(--surface-2)' : 'transparent', opacity: done || active ? 1 : 0.35, transition: 'opacity .3s ease, background .3s ease' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center', background: done ? 'var(--green-soft)' : 'var(--track)', color: 'var(--green-ink)', border: `1.5px solid ${done ? 'var(--green-line)' : 'var(--line)'}` }}>
                      {done ? <Icon name="check" size={15} stroke={3} /> : active ? <span className="vouch-spin" style={{ width: 12, height: 12, border: '2px solid var(--muted)', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> : null}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
            <div style={{ width: 72, height: 72, margin: '0 auto 16px', borderRadius: 20, background: 'var(--red-soft)', border: '2px solid var(--red)', display: 'grid', placeItems: 'center', color: 'var(--red-ink)' }}>
              <Icon name="alert" size={34} stroke={2.2} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', margin: '8px 0 6px', color: 'var(--ink)' }}>Couldn't apply</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14.5, color: 'var(--muted)', fontWeight: 600 }}>{error}</p>
            <Button variant="soft" full onClick={onClose}>Close</Button>
          </div>
        ) : result?.result === 'pool_accepted' ? (
          <div style={{ position: 'relative' }}>
            <Confetti color={color} />
            <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
              <div style={{ width: 72, height: 72, margin: '0 auto 16px', borderRadius: 20, background: 'var(--green-soft)', border: '2px solid var(--green)', display: 'grid', placeItems: 'center', color: 'var(--green-ink)' }}>
                <Icon name="trophy" size={36} stroke={2.2} />
              </div>
              <Tag icon="spark" tone="match">You made the shortlist</Tag>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, letterSpacing: '-0.03em', margin: '14px 0 6px', color: 'var(--ink)' }}>You're in the pool!</h2>
              <p style={{ margin: '0 0 20px', fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>{post.title} · {post.company_name}</p>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '18px 12px', background: 'var(--surface-2)', borderRadius: 16, border: '1.5px solid var(--line)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, color: 'var(--ink)', lineHeight: 1 }}>#{result.rank ?? '—'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>of {post.pool_size} in pool</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '18px 12px', background: 'var(--surface-2)', borderRadius: 16, border: '1.5px solid var(--line)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, color: `var(--${color}-ink)`, lineHeight: 1 }}>{Math.round(result.match_score)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>match score</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="soft" full onClick={onBrowse}>Back to pools</Button>
              <Button variant="primary" full iconRight="arrow" onClick={onClose}>View my spot</Button>
            </div>
          </div>
        ) : result?.result === 'waitlisted' ? (
          <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
            <div style={{ width: 72, height: 72, margin: '0 auto 16px', borderRadius: 20, background: 'var(--violet-soft)', border: '2px solid var(--violet)', display: 'grid', placeItems: 'center', color: 'var(--violet-ink)' }}>
              <Icon name="bell" size={34} stroke={2.2} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', margin: '14px 0 6px', color: 'var(--ink)' }}>You're on the waitlist</h2>
            <p style={{ margin: '0 auto 22px', fontSize: 14.5, color: 'var(--muted)', fontWeight: 600, maxWidth: 380, lineHeight: 1.5 }}>
              Waitlist position #{result.waitlist_rank ?? '—'} · score {Math.round(result.match_score)}. A referral from the waitlist is possible once the pool clears and if the referrer has capacity.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="soft" full onClick={onClose}>Close</Button>
              <Button variant="primary" full iconRight="arrow" onClick={onBrowse}>Browse other pools</Button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
            <div style={{ width: 72, height: 72, margin: '0 auto 16px', borderRadius: 20, background: 'var(--amber-soft)', border: '2px solid var(--amber)', display: 'grid', placeItems: 'center', color: 'var(--amber-ink)' }}>
              <Icon name="bolt" size={34} stroke={2.2} />
            </div>
            <Tag icon="bolt" tone="longshot">Not in the pool yet</Tag>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', margin: '14px 0 6px', color: 'var(--ink)' }}>Here's what's holding you back</h2>
            <p style={{ margin: '0 auto 18px', fontSize: 14.5, color: 'var(--muted)', fontWeight: 600, maxWidth: 400, lineHeight: 1.5 }}>
              {result?.detail || `Your match score (${Math.round(result?.match_score ?? 0)}) is below this referrer's bar of ${post.min_match_score}.`}
            </p>
            {(result?.gaps?.length || result?.suggestions?.length) ? (
              <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {(result?.gaps ?? []).map((g, i) => (
                  <div key={`g${i}`} style={{ padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 16, border: '1.5px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--red-soft)', border: '1.5px solid var(--red-line)', color: 'var(--red-ink)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Icon name="x" size={14} stroke={3} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', lineHeight: 1.35 }}>{g}</span>
                    </div>
                  </div>
                ))}
                {(result?.suggestions ?? []).map((s, i) => (
                  <div key={`s${i}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '0 4px', color: 'var(--green-ink)' }}>
                    <Icon name="arrow" size={15} stroke={2.6} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4, textAlign: 'left' }}>{s}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: '0 auto 22px', fontSize: 13, color: 'var(--muted)', fontWeight: 500, maxWidth: 380 }}>No black box — strengthen your profile or find a pool you match.</p>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="soft" full onClick={onClose}>Close</Button>
              <Button variant="dark" full iconRight="arrow" onClick={onBrowse}>See pools I match</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReferralPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user, isCandidate } = useAuth()
  const [post, setPost] = useState<ReferralPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [showJD, setShowJD] = useState(false)
  const [board, setBoard] = useState<ReferralLeaderboard | null>(null)

  // Eligibility modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [phase, setPhase] = useState<'scanning' | 'result'>('scanning')
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    api.get<ReferralPost>(`/referrals/posts/by-slug/${slug}`)
      .then(r => setPost(r.data))
      .catch(() => setPost(null))
      .finally(() => setLoading(false))
  }, [slug])

  // Anonymized current-pool leaderboard (candidate-safe).
  useEffect(() => {
    if (!post?.id) return
    api.get<ReferralLeaderboard>(`/referrals/posts/${post.id}/leaderboard`)
      .then(r => setBoard(r.data))
      .catch(() => setBoard(null))
  }, [post?.id])

  // Advance the scan animation one step at a time while scoring runs.
  useEffect(() => {
    if (!modalOpen || phase !== 'scanning') return
    if (step < SCAN_LINES.length) {
      const t = setTimeout(() => setStep(s => s + 1), 560)
      return () => clearTimeout(t)
    }
  }, [modalOpen, phase, step])

  // Reveal the result once the scan has finished AND the API has responded.
  useEffect(() => {
    if (modalOpen && phase === 'scanning' && step >= SCAN_LINES.length && (result || error)) {
      const t = setTimeout(() => setPhase('result'), 400)
      return () => clearTimeout(t)
    }
  }, [modalOpen, phase, step, result, error])

  const handleApply = async () => {
    if (!user || !post) return
    setModalOpen(true); setPhase('scanning'); setStep(0); setResult(null); setError('')
    try {
      const { data } = await api.post<ApplyResult>(`/referrals/posts/${post.id}/apply`, {})
      setResult(data)
      const refreshed = await api.get<ReferralPost>(`/referrals/posts/by-slug/${slug}`)
      setPost(refreshed.data)
      api.get<ReferralLeaderboard>(`/referrals/posts/${post.id}/leaderboard`)
        .then(rb => setBoard(rb.data)).catch(() => {})
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | { detail?: string } } } }
      const detail = e?.response?.data?.detail
      setError((typeof detail === 'object' ? detail?.detail : detail) || 'Something went wrong. Please try again.')
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><LoadingSpinner /></div>
  if (!post) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Referral post not found.</p>
      <Button variant="soft" onClick={() => navigate('/referrals')}>Back to companies</Button>
    </div>
  )

  const r = post.referrer
  const color = colorFor(r?.full_name ?? post.company_name)
  const spotsLeft = post.spots_remaining
  const full = spotsLeft <= 0
  const filled = Math.max(0, post.pool_size - spotsLeft)
  const canApply = isCandidate && post.status === 'open'

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 pb-32">
      <button onClick={() => navigate(`/referrals/company/${encodeURIComponent(post.company_name)}`)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-body)', marginBottom: 20, padding: 0 }}>
        <Icon name="back" size={18} stroke={2.4} /> All referrals at {post.company_name}
      </button>

      <div className="vouch-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* role header */}
          <Card padding={26}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <Tag icon={full ? 'lock' : 'spark'} tone={full ? 'full' : 'match'}>{full ? 'Pool full' : `${spotsLeft} spots open`}</Tag>
              {post.closes_at && <Tag icon="clock">Closes {new Date(post.closes_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Tag>}
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 14px', color: 'var(--ink)' }}>{post.title}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {post.location && <Tag icon="pin">{post.location}</Tag>}
              {post.employment_type && <Tag icon="bag">{post.employment_type}</Tag>}
              <Tag icon="spark">Min {post.min_match_score}% match</Tag>
            </div>
          </Card>

          {/* about the role (JD) */}
          {post.jd_raw && (
            <Card padding={0}>
              <button onClick={() => setShowJD(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 26px', background: 'none', border: 'none', cursor: 'pointer' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>About this role</h3>
                <Icon name="chevron" size={20} stroke={2.2} style={{ color: 'var(--muted)', transform: showJD ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
              </button>
              {showJD && <div style={{ padding: '0 26px 26px', borderTop: '1px solid var(--line)' }}><div style={{ marginTop: 16 }}><JDFormatter text={post.jd_raw} /></div></div>}
            </Card>
          )}

          {/* referrer */}
          <Card padding={26}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: r?.note || r?.referred_count ? 18 : 0 }}>
              <Avatar initials={(r?.full_name ?? '?').charAt(0).toUpperCase()} color={color} size={56} ring />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{r?.full_name ?? 'Employee'}</span>
                  {r?.linkedin_verified && <Tag icon="shield" tone="match">Verified</Tag>}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
                  {[r?.title, r?.tenure].filter(Boolean).join(' · ') || r?.current_company || r?.company || post.company_name}
                </div>
              </div>
              {r?.candidate_linkedin_url && (
                <a href={r.candidate_linkedin_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--violet-ink)', textDecoration: 'none' }}>
                  <Icon name="arrow" size={14} stroke={2.4} /> LinkedIn
                </a>
              )}
            </div>
            {!!r?.referred_count && (
              <div style={{ display: 'flex', justifyContent: 'space-around', padding: '16px 0', borderTop: '1px solid var(--line)', borderBottom: r?.note ? '1px solid var(--line)' : 'none', marginBottom: r?.note ? 16 : 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 24, color: 'var(--ink)', lineHeight: 1 }}>{r.referred_count}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>Referred</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 24, color: 'var(--ink)', lineHeight: 1 }}>{post.pool_size}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>Pool cap</div>
                </div>
              </div>
            )}
            {r?.note && (
              <div style={{ display: 'flex', gap: 11 }}>
                <div style={{ fontSize: 30, lineHeight: 1, color: `var(--${color})`, fontFamily: 'var(--font-display)', fontWeight: 800 }}>“</div>
                <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.5, opacity: 0.85 }}>{r.note}</p>
              </div>
            )}
          </Card>

          {/* what this pool screens for */}
          {(() => {
            const reqs = post.jd_requirements as { required_skill_groups?: JDRequirementGroup[]; preferred_skills?: string[]; min_years_experience?: number | null } | null
            const groups = reqs?.required_skill_groups ?? []
            const preferred = reqs?.preferred_skills ?? []
            if (groups.length === 0 && preferred.length === 0 && !reqs?.min_years_experience) return null
            return (
              <Card padding={26}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, margin: '0 0 4px', color: 'var(--ink)', letterSpacing: '-0.02em' }}>What this pool screens for</h3>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>You're scored live against these when you apply</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {reqs?.min_years_experience ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Tag icon="clock">{reqs.min_years_experience}+ years experience</Tag>
                    </div>
                  ) : null}
                  {groups.map((g, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                        {g.match_type === 'all' ? 'All of' : 'Any of'} {g.required ? '· required' : '· nice to have'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {g.skills.map(s => <Tag key={s} tone={g.required ? 'match' : 'neutral'}>{s}</Tag>)}
                      </div>
                    </div>
                  ))}
                  {preferred.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Preferred</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {preferred.map(s => <Tag key={s}>{s}</Tag>)}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })()}
        </div>

        {/* RIGHT (sticky) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 20 }}>
          <Card hero padding={24}>
            <PoolMeter filled={filled} cap={post.pool_size} color={color} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 6px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, color: 'var(--ink)', letterSpacing: '-0.03em', lineHeight: 1 }}>{full ? 0 : spotsLeft}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>{spotsLeft === 1 ? 'spot' : 'spots'} open</span>
            </div>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--ink)', opacity: 0.7, fontWeight: 600, lineHeight: 1.45 }}>
              {full ? 'This pool is full. Apply to join the waitlist — you move up if a spot frees.' : "Apply now — we'll instantly check your profile against the pool and rank you."}
            </p>
            {!isCandidate ? (
              <Button full size="lg" variant="dark" onClick={() => navigate('/login')}>Sign in to apply</Button>
            ) : post.status !== 'open' ? (
              <Button full size="lg" variant="soft" disabled>Referrals closed</Button>
            ) : full && post.waitlist_count >= post.waitlist_size ? (
              <Button full size="lg" variant="soft" disabled>No spots available</Button>
            ) : full ? (
              <Button full size="lg" variant="dark" icon="bell" onClick={handleApply}>Join the waitlist</Button>
            ) : (
              <Button full size="lg" variant="primary" iconRight="arrow" onClick={handleApply}>Apply to this pool</Button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
              <Icon name="bolt" size={13} stroke={2.4} /> Instant decision · no resume black hole
            </div>
          </Card>

          {post.waitlist_size > 0 && (
            <Card padding={20}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                <span>Waitlist</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{post.waitlist_count} / {post.waitlist_size}</span>
              </div>
            </Card>
          )}

          {/* current pool leaderboard */}
          {board && board.leaderboard.length > 0 && (
            <Card padding={22}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon name="trophy" size={18} stroke={2.2} style={{ color: `var(--${color})` }} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Current pool</h3>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Ranked by match score · top {board.pool_size} get the referral</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 360, overflowY: 'auto' }}>
                {board.leaderboard.slice(0, 12).map(row => (
                  <div key={row.rank} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12,
                    background: row.you ? `var(--${color}-soft)` : 'transparent',
                    border: row.you ? `2px solid var(--${color})` : '2px solid transparent',
                  }}>
                    <div style={{ width: 26, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: row.rank <= 3 ? `var(--${color}-ink)` : 'var(--muted)' }}>{row.rank}</div>
                    <div style={{ flex: 1, fontWeight: row.you ? 800 : 600, fontSize: 14, color: 'var(--ink)' }}>{row.handle}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 110 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                        <div style={{ width: `${row.score}%`, height: '100%', background: `var(--${color})`, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', width: 26, textAlign: 'right' }}>{Math.round(row.score)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {modalOpen && (
        <EligibilityModal
          post={post} color={color} phase={phase} step={step} result={result} error={error}
          onClose={() => setModalOpen(false)}
          onBrowse={() => { setModalOpen(false); navigate(`/referrals/company/${encodeURIComponent(post.company_name)}`) }}
        />
      )}
    </div>
  )
}
