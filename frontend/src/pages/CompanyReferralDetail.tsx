import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { CompanyReferrals, ReferralPost } from '../types'

function timeLeft(closesAt: string | null): string {
  if (!closesAt) return ''
  const diff = new Date(closesAt).getTime() - Date.now()
  if (diff <= 0) return 'Closing soon'
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d left`
  return `${hours}h left`
}

function SpotsBar({ filled, total }: { filled: number; total: number }) {
  const pct = Math.min(100, (filled / total) * 100)
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>{total - filled} spots remaining</span>
        <span>{filled}/{total} filled</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ReferrerCard({ post, onApply }: { post: ReferralPost; onApply: () => void }) {
  const referrer = post.referrer
  const spotsLeft = post.spots_remaining
  const isFull = spotsLeft === 0

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-md hover:border-indigo-100 transition-all duration-200 flex flex-col gap-4">
      {/* Referrer info */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm">
          {referrer?.full_name?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm truncate">
              {referrer?.full_name ?? 'Employee'}
            </span>
            {referrer?.linkedin_verified && (
              <span title="LinkedIn verified" className="text-blue-500 flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {referrer?.current_company || referrer?.company || post.company_name}
          </p>
        </div>
        {post.closes_at && (
          <span className="flex-shrink-0 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 font-medium">
            {timeLeft(post.closes_at)}
          </span>
        )}
      </div>

      {/* Spots bar */}
      <SpotsBar filled={post.pool_size - post.spots_remaining} total={post.pool_size} />

      {/* Meta tags */}
      <div className="flex flex-wrap gap-1.5">
        {post.location && (
          <span className="text-xs bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            {post.location}
          </span>
        )}
        {post.employment_type && (
          <span className="text-xs bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-100">
            {post.employment_type}
          </span>
        )}
        <span className="text-xs bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-100">
          Min {post.min_match_score}% match
        </span>
      </div>

      {/* Apply button */}
      <button
        onClick={onApply}
        disabled={isFull}
        className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all ${
          isFull
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow'
        }`}
      >
        {isFull ? 'Pool Full' : 'View & Apply'}
      </button>
    </div>
  )
}

export default function CompanyReferralDetail() {
  const { companyName } = useParams<{ companyName: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CompanyReferrals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openJob, setOpenJob] = useState<string | null>(null)

  useEffect(() => {
    if (!companyName) return
    api.get<CompanyReferrals>(`/referrals/company/${encodeURIComponent(companyName)}`)
      .then(r => {
        setData(r.data)
        if (r.data.jobs.length > 0) setOpenJob(r.data.jobs[0].title)
      })
      .catch(() => setError('Failed to load referrals for this company.'))
      .finally(() => setLoading(false))
  }, [companyName])

  if (loading) return <div className="flex justify-center items-center min-h-screen"><LoadingSpinner /></div>
  if (error) return <div className="text-center py-24 text-slate-500">{error}</div>
  if (!data) return null

  const totalReferrers = data.jobs.reduce((s, j) => s + j.referrers.length, 0)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <button
            onClick={() => navigate('/referrals')}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            All Companies
          </button>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {data.company_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-bold">{data.company_name}</h1>
              <p className="text-slate-400 mt-1 text-sm">
                {totalReferrers} employee{totalReferrers !== 1 ? 's' : ''} referring · {data.jobs.length} role{data.jobs.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        {data.jobs.length === 0 ? (
          <div className="text-center py-20 text-slate-500">No open referrals at this company right now.</div>
        ) : (
          <div className="space-y-6">
            {data.jobs.map(jobGroup => (
              <div key={jobGroup.title} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Job title header */}
                <button
                  className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-colors"
                  onClick={() => setOpenJob(openJob === jobGroup.title ? null : jobGroup.title)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-slate-800">{jobGroup.title}</h2>
                      <p className="text-sm text-slate-500">
                        {jobGroup.referrers.length} employee{jobGroup.referrers.length !== 1 ? 's' : ''} referring
                      </p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${openJob === jobGroup.title ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Referrer cards grid */}
                {openJob === jobGroup.title && (
                  <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-slate-50">
                    <div className="col-span-full pt-2" />
                    {jobGroup.referrers.map(post => (
                      <ReferrerCard
                        key={post.id}
                        post={post}
                        onApply={() => navigate(`/referrals/${post.slug || post.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
