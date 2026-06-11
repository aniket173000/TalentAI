import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { Application, CandidateStatus, ProjectScore } from '../types'

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
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    api
      .get<Application[]>('/applications/my')
      .then(r => setApps(r.data))
      .catch(() => setApps([]))
      .finally(() => setLoading(false))
  }, [])

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
        <h1 className="text-3xl font-extrabold text-navy-900">My Applications</h1>
        <p className="text-slate-500 text-sm mt-1">
          Welcome back, {user?.full_name}. Here's your application history.
        </p>
      </div>

      {apps.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">📄</p>
          <p className="text-slate-500 font-medium">You haven't applied to any jobs yet.</p>
          <Link
            to="/"
            className="mt-4 inline-block text-brand-blue hover:underline text-sm font-medium"
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
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : app.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-colors"
                >
                  {/* Score ring */}
                  <div className="shrink-0 w-14 h-14 rounded-full border-4 border-brand-blue flex items-center justify-center">
                    <span className="text-sm font-bold text-brand-blue">
                      {app.match_score.toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">
                      Job #{app.job_id}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Applied {new Date(app.applied_at).toLocaleDateString()}
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
                          <span className="text-brand-blue text-sm">💡</span>
                          <p className="text-xs font-bold text-brand-blue uppercase tracking-wide">How to Improve</p>
                        </div>
                        <ul className="space-y-2">
                          {suggestions.map((s, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700">
                              <span className="w-4 h-4 rounded-full bg-brand-blue text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
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
                        className="text-xs text-brand-blue hover:underline font-medium"
                      >
                        View job details →
                      </Link>
                      {app.status_token && (
                        <Link
                          to={`/status/${app.status_token}`}
                          className="text-xs text-slate-500 hover:text-brand-blue hover:underline font-medium"
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
