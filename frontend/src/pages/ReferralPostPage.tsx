import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import JDFormatter from '../components/JDFormatter'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { ReferralPost } from '../types'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string }> = {
    open: { label: 'Open for Referral', class: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    closed: { label: 'Pool Closed', class: 'bg-amber-50 text-amber-700 border-amber-100' },
    referring: { label: 'Referring Candidates', class: 'bg-blue-50 text-blue-700 border-blue-100' },
    referred_all: { label: 'Referrals Complete', class: 'bg-slate-50 text-slate-600 border-slate-200' },
    draft: { label: 'Draft', class: 'bg-slate-50 text-slate-500 border-slate-100' },
  }
  const s = map[status] ?? { label: status, class: 'bg-slate-50 text-slate-500 border-slate-100' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border ${s.class}`}>
      {status === 'open' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {s.label}
    </span>
  )
}

function SpotsBar({ filled, total }: { filled: number; total: number }) {
  const pct = Math.min(100, (filled / total) * 100)
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-slate-600 font-medium">{total - filled} spots remaining</span>
        <span className="text-slate-400">{filled} of {total} filled</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

type ApplyState = 'idle' | 'applying' | 'success' | 'error'

interface ApplyResult {
  result: 'pool_accepted' | 'waitlisted' | 'rejected'
  reason?: string
  match_score: number
  rank?: number
  waitlist_rank?: number
  pool_type?: string
  detail?: string
  displaced?: boolean
}

export default function ReferralPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user, isCandidate } = useAuth()
  const [post, setPost] = useState<ReferralPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [applyState, setApplyState] = useState<ApplyState>('idle')
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [applyError, setApplyError] = useState('')
  const [showJD, setShowJD] = useState(false)

  useEffect(() => {
    if (!slug) return
    api.get<ReferralPost>(`/referrals/posts/by-slug/${slug}`)
      .then(r => setPost(r.data))
      .catch(() => setPost(null))
      .finally(() => setLoading(false))
  }, [slug])

  const handleApply = async () => {
    if (!user || !post) return
    setApplyState('applying')
    setApplyError('')
    try {
      const { data } = await api.post<ApplyResult>(`/referrals/posts/${post.id}/apply`, {})
      setApplyResult(data)
      setApplyState('success')
      // Refresh post to update spot counts
      const refreshed = await api.get<ReferralPost>(`/referrals/posts/by-slug/${slug}`)
      setPost(refreshed.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | { detail?: string } } } }
      const detail = e?.response?.data?.detail
      const msg = typeof detail === 'object' ? detail?.detail : detail
      setApplyError(msg || 'Something went wrong. Please try again.')
      setApplyState('error')
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen"><LoadingSpinner /></div>
  if (!post) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-slate-500 text-lg">Referral post not found.</p>
      <button onClick={() => navigate('/referrals')} className="text-indigo-600 hover:underline text-sm">Back to Companies</button>
    </div>
  )

  const referrer = post.referrer
  const spotsLeft = post.spots_remaining
  const canApply = isCandidate && post.status === 'open' && applyState === 'idle'
  const filled = post.pool_size - post.spots_remaining

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top band */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(`/referrals/company/${encodeURIComponent(post.company_name)}`)}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {post.company_name}
          </button>
          <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-slate-500 text-sm truncate">{post.title}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — main content */}
        <div className="lg:col-span-2 space-y-5">

          {/* Title card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">{post.title}</h1>
                <p className="text-slate-500 mt-1 text-sm">{post.company_name}</p>
              </div>
              <StatusBadge status={post.status} />
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {post.location && (
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  {post.location}
                </span>
              )}
              {post.employment_type && (
                <span className="text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                  {post.employment_type}
                </span>
              )}
              <span className="text-sm text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 font-medium">
                Min {post.min_match_score}% AI match
              </span>
            </div>
          </div>

          {/* JD */}
          {post.jd_raw && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                onClick={() => setShowJD(!showJD)}
              >
                <span className="font-semibold text-slate-700 text-sm">Job Description</span>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${showJD ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showJD && (
                <div className="px-6 pb-6 border-t border-slate-50 mt-0">
                  <JDFormatter text={post.jd_raw} />
                </div>
              )}
            </div>
          )}

          {/* Waitlist notice */}
          {spotsLeft === 0 && post.waitlist_count < post.waitlist_size && post.status === 'open' && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">Pool is full — Waitlist available</p>
                  <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                    The main pool is full. You can join the waitlist, but referrals from the waitlist only happen after all pool members are referred and only if the referrer has remaining capacity. Chances are limited.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right — sidebar */}
        <div className="space-y-4">

          {/* Referrer card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Referred by</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shadow-sm">
                {referrer?.full_name?.charAt(0).toUpperCase() ?? '?'}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-800 text-sm">{referrer?.full_name ?? 'Employee'}</span>
                  {referrer?.linkedin_verified && (
                    <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{referrer?.current_company || referrer?.company || post.company_name}</p>
              </div>
            </div>
            {referrer?.candidate_linkedin_url && (
              <a
                href={referrer.candidate_linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                View LinkedIn Profile
              </a>
            )}
          </div>

          {/* Pool status */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Pool Status</p>
            <SpotsBar filled={filled} total={post.pool_size} />
            {post.waitlist_size > 0 && (
              <div className="pt-2 border-t border-slate-50">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Waitlist</span>
                  <span>{post.waitlist_count} / {post.waitlist_size}</span>
                </div>
              </div>
            )}
            {post.closes_at && (
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1 border-t border-slate-50">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Closes {new Date(post.closes_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>

          {/* Apply / Result */}
          {applyState === 'success' && applyResult ? (
            <div className={`rounded-2xl p-5 border ${
              applyResult.result === 'pool_accepted'
                ? 'bg-emerald-50 border-emerald-100'
                : applyResult.result === 'waitlisted'
                ? 'bg-amber-50 border-amber-100'
                : 'bg-rose-50 border-rose-100'
            }`}>
              {applyResult.result === 'pool_accepted' && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-semibold text-emerald-800">You're in the Pool!</span>
                  </div>
                  <p className="text-emerald-700 text-sm">Rank #{applyResult.rank} · Score {applyResult.match_score.toFixed(1)}%</p>
                  <p className="text-emerald-600 text-xs mt-1">You'll be notified when the referrer closes the pool.</p>
                </>
              )}
              {applyResult.result === 'waitlisted' && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-semibold text-amber-800">Added to Waitlist</span>
                  </div>
                  <p className="text-amber-700 text-sm">Waitlist position #{applyResult.waitlist_rank} · Score {applyResult.match_score.toFixed(1)}%</p>
                  <p className="text-amber-600 text-xs mt-1 leading-relaxed">Referral from waitlist is possible but not guaranteed — it depends on the referrer's capacity after the pool.</p>
                </>
              )}
              {applyResult.result === 'rejected' && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-semibold text-rose-800">Not Qualified</span>
                  </div>
                  <p className="text-rose-700 text-sm">{applyResult.detail}</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {applyState === 'error' && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-sm text-rose-700">
                  {applyError}
                </div>
              )}
              {!isCandidate && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm text-slate-600 text-center">
                  <button onClick={() => navigate('/login')} className="text-indigo-600 hover:underline font-medium">Sign in as a candidate</button> to apply
                </div>
              )}
              <button
                onClick={handleApply}
                disabled={!canApply}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                  canApply
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {applyState === 'applying'
                  ? 'Scoring your profile...'
                  : post.status !== 'open'
                  ? 'Referrals Closed'
                  : spotsLeft === 0 && post.waitlist_count >= post.waitlist_size
                  ? 'No Spots Available'
                  : spotsLeft === 0
                  ? 'Join Waitlist'
                  : 'Apply for Referral'}
              </button>
              {isCandidate && post.status === 'open' && (
                <p className="text-center text-xs text-slate-400">
                  Your profile resume will be scored against this JD
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
