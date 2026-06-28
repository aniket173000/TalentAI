import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { Application, CandidateStatus, MagicMatchJob, MagicMatchResult, ProjectScore } from '../types'
import { formatSalaryRange } from '../utils/currency'

const CANDIDATE_STATUS_COLORS: Record<CandidateStatus, string> = {
  rejected:            'bg-red-50 text-red-600 border-red-200',
  pool_accepted:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  under_review:        'bg-blue-50 text-blue-700 border-blue-200',
  interview_scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  offer_extended:      'bg-purple-50 text-purple-700 border-purple-200',
  interview_rejected:  'bg-red-50 text-red-600 border-red-200',
}

const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  rejected:            'Rejected',
  pool_accepted:       'Shortlisted',
  under_review:        'Under Review',
  interview_scheduled: 'Interview Stage',
  offer_extended:      'Offer Extended',
  interview_rejected:  'Interview Not Passed',
}

function parseJson<T>(raw: T[] | string | null | undefined): T[] {
  if (!raw) return []
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T[] } catch { return [] }
  }
  return raw
}

export default function CandidateDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  // Magic Match state
  const [magicMatches, setMagicMatches] = useState<MagicMatchJob[] | null>(null)
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicError, setMagicError] = useState<string | null>(null)
  const [magicResetsAt, setMagicResetsAt] = useState<string | null>(null)
  const [magicOpen, setMagicOpen] = useState(false)
  const [magicFromCache, setMagicFromCache] = useState(false)

  useEffect(() => {
    api
      .get<Application[]>('/applications/my')
      .then(r => setApps(r.data))
      .catch(() => setApps([]))
      .finally(() => setLoading(false))
  }, [])

  const fetchMagicMatch = async () => {
    setMagicLoading(true)
    setMagicError(null)
    try {
      const r = await api.get<MagicMatchResult>('/applications/magic-match')
      setMagicMatches(r.data.matches)
      setMagicResetsAt(r.data.resets_at)
      setMagicFromCache(r.data.from_cache ?? false)
      if (r.data.message) setMagicError(r.data.message)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { message?: string } | string } } })
        ?.response?.data?.detail
      if (typeof detail === 'object' && detail?.message) {
        setMagicError(detail.message)
        setMagicResetsAt((detail as { resets_at?: string }).resets_at ?? null)
      } else {
        setMagicError(typeof detail === 'string' ? detail : 'Could not load magic matches right now.')
      }
    } finally {
      setMagicLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner message="Loading your applications…" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-ink" style={{fontSize:'clamp(26px,6vw,36px)',letterSpacing:"-0.035em"}}>My Applications</h1>
        <p className="text-slate-500 text-sm mt-1">
          Welcome back, {user?.full_name}. Here's your application history.
        </p>
      </div>

      {/* ── Magic Match ─────────────────────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 overflow-hidden">
        <button
          onClick={() => {
            if (!magicOpen) {
              setMagicOpen(true)
              if (magicMatches === null && !magicLoading) fetchMagicMatch()
            } else {
              setMagicOpen(false)
            }
          }}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <p className="font-bold text-indigo-900 text-sm">Magic Match</p>
              <p className="text-xs text-indigo-600">AI-powered job recommendations tailored to your resume — refreshes daily</p>
            </div>
          </div>
          <span className="text-indigo-400 text-sm font-semibold">{magicOpen ? '▲ Hide' : '▼ Show'}</span>
        </button>

        {magicOpen && (
          <div className="border-t border-indigo-100 px-6 py-5">
            {magicLoading && (
              <div className="flex items-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                <p className="text-sm text-indigo-700">Finding your best matches…</p>
              </div>
            )}

            {!magicLoading && magicError && magicMatches === null && (
              <div className="py-4 text-center">
                <p className="text-sm text-slate-600">{magicError}</p>
                {magicResetsAt && (
                  <p className="text-xs text-slate-400 mt-1">
                    Resets on {new Date(magicResetsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                )}
              </div>
            )}

            {!magicLoading && magicMatches !== null && magicMatches.length === 0 && (
              <p className="text-sm text-slate-500 py-4 text-center">
                {magicError ?? 'No new jobs to match right now — check back tomorrow!'}
              </p>
            )}

            {!magicLoading && magicMatches && magicMatches.length > 0 && (
              <div className="space-y-3">
                {magicResetsAt && (
                  <p className="text-xs text-indigo-500 mb-1">
                    {magicFromCache ? 'Showing today\'s saved matches — ' : 'Today\'s picks — '}
                    refreshes{' '}
                    {new Date(magicResetsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                )}
                {magicMatches.map((match, i) => (
                  <div
                    key={match.job_id}
                    className="bg-surface rounded-2xl border-2 border-ink shadow-card p-4 flex items-center gap-4 hover:border-indigo-300 transition-colors"
                  >
                    {/* Rank bubble */}
                    <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                      #{i + 1}
                    </div>

                    {/* Company logo */}
                    {match.company_logo_url ? (
                      <img src={match.company_logo_url} alt={match.company} className="w-8 h-8 rounded object-contain shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold shrink-0">
                        {match.company.charAt(0)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{match.title}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {match.company}
                        {match.location ? ` · ${match.location}` : ''}
                        {match.employment_type ? ` · ${match.employment_type}` : ''}
                        {match.remote_policy ? ` · ${match.remote_policy}` : ''}
                      </p>
                      {(match.salary_range_min || match.salary_range_max) && (
                        <p className="text-xs text-emerald-600 font-medium mt-0.5">
                          {formatSalaryRange(match.salary_range_min, match.salary_range_max, match.salary_currency)}
                        </p>
                      )}
                    </div>

                    {/* Similarity badge */}
                    <div className="shrink-0 text-center">
                      <div className={`text-sm font-extrabold ${
                        match.similarity_score >= 80 ? 'text-emerald-600'
                          : match.similarity_score >= 60 ? 'text-amber-600'
                          : 'text-slate-500'
                      }`}>
                        {match.similarity_score.toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-slate-400">match</div>
                    </div>

                    <button
                      onClick={() => navigate(`/jobs/${match.job_id}`)}
                      className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {apps.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">📄</p>
          <p className="text-slate-500 font-medium">You haven't applied to any jobs yet.</p>
          <Link
            to="/"
            className="mt-4 inline-block text-accent-ink hover:underline text-sm font-medium"
          >
            Browse open positions
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map(app => {
            const strengths = parseJson<string>(app.strengths)
            const gaps = parseJson<string>(app.gaps)
            const suggestions = parseJson<string>(app.improvement_suggestions)
            const projects = parseJson<ProjectScore>(app.project_scores)
            const isOpen = expanded === app.id

            return (
              <div
                key={app.id}
                className="bg-surface rounded-2xl border-2 border-ink shadow-card overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : app.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-colors"
                >
                  {/* Score ring */}
                  <div className="shrink-0 w-14 h-14 rounded-full border-4 border-brand-blue flex items-center justify-center">
                    <span className="text-sm font-bold text-accent-ink">
                      {app.match_score.toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">
                      {app.job_title || `Job #${app.job_id}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {app.job_company ? `${app.job_company} · ` : ''}Applied {new Date(app.applied_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {app.rank && (
                      <span className="text-xs font-bold text-slate-500">#{app.rank}</span>
                    )}
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                        CANDIDATE_STATUS_COLORS[app.candidate_status] ?? 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      {CANDIDATE_STATUS_LABELS[app.candidate_status] ?? app.candidate_status}
                    </span>
                    <span className="text-slate-300">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50 space-y-4 animate-fade-in">
                    {/* Projects */}
                    {projects.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Project Relevance
                        </p>
                        <div className="space-y-2">
                          {projects.map((p, i) => (
                            <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-slate-700">{p.project_name}</span>
                                <span
                                  className={`text-xs font-bold ${
                                    p.relevance_score >= 80
                                      ? 'text-emerald-600'
                                      : p.relevance_score >= 60
                                      ? 'text-amber-600'
                                      : 'text-red-500'
                                  }`}
                                >
                                  {p.relevance_score}%
                                </span>
                              </div>
                              {p.tech_overlap.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {p.tech_overlap.map((t, j) => (
                                    <span
                                      key={j}
                                      className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {p.notes && (
                                <p className="text-xs text-slate-500 mt-1">{p.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      {strengths.length > 0 && (
                        <div className="bg-white rounded-xl border border-emerald-100 p-4">
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold flex items-center justify-center">✓</span>
                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Strengths</p>
                          </div>
                          <ul className="space-y-2">
                            {strengths.map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {gaps.length > 0 && (
                        <div className="bg-white rounded-xl border border-amber-100 p-4">
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold flex items-center justify-center">!</span>
                            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Gaps</p>
                          </div>
                          <ul className="space-y-2">
                            {gaps.map((g, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                {g}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {suggestions.length > 0 && (
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
                        <div className="flex items-center gap-1.5 mb-3">
                          <span className="text-accent-ink text-sm">💡</span>
                          <p className="text-xs font-bold text-accent-ink uppercase tracking-wide">How to Improve</p>
                        </div>
                        <ul className="space-y-2">
                          {suggestions.map((s, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700">
                              <span className="w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-4">
                      <Link
                        to={`/jobs/${app.job_id}`}
                        className="text-xs text-accent-ink hover:underline font-medium"
                      >
                        View job details →
                      </Link>
                      {app.status_token && (
                        <Link
                          to={`/status/${app.status_token}`}
                          className="text-xs text-slate-500 hover:text-accent-ink hover:underline font-medium"
                        >
                          Track application status →
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
