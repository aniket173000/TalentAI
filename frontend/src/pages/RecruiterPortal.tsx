import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Application, Job, JobListResponse } from '../types'

type Tab = 'jobs' | 'applications'
type SortField = 'created_at' | 'total_applicants' | 'avg_score'
type StatusFilter = 'all' | 'draft' | 'published' | 'closed'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-red-50 text-red-600 border-red-200',
}

const APP_STATUS_COLORS: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
  displaced: 'bg-amber-50 text-amber-600 border-amber-200',
}

const PER_PAGE = 20

export default function RecruiterPortal() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('jobs')

  // ── Tab 1: Job Listing ──────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = (v: string) => {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setSearch(v); setPage(1) }, 300)
  }

  const fetchJobs = useCallback(() => {
    setLoadingJobs(true)
    const params: Record<string, string | number> = {
      page, per_page: PER_PAGE, sort_by: sortBy, sort_dir: sortDir,
    }
    if (statusFilter !== 'all') params.status = statusFilter
    if (search.trim()) params.search = search.trim()
    api.get<JobListResponse>('/jobs/my', { params })
      .then(r => {
        setJobs(r.data.jobs)
        setTotal(r.data.total)
        setPages(r.data.pages)
      })
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false))
  }, [page, statusFilter, sortBy, sortDir, search])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const toggleStatus = async (job: Job) => {
    setTogglingId(job.id)
    try {
      const endpoint = job.status === 'published' ? 'unpublish' : 'publish'
      await api.post(`/jobs/${job.id}/${endpoint}`)
      fetchJobs()
    } finally {
      setTogglingId(null)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(field); setSortDir('desc') }
    setPage(1)
  }

  const SortIcon = ({ field }: { field: SortField }) =>
    sortBy === field ? <span className="ml-1 text-xs">{sortDir === 'desc' ? '↓' : '↑'}</span> : null

  // ── Tab 2: Applications ─────────────────────────────────────────────────────
  const [appJobs, setAppJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<number | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [expandedApp, setExpandedApp] = useState<number | null>(null)

  useEffect(() => {
    if (tab !== 'applications') return
    api.get<JobListResponse>('/jobs/my', { params: { per_page: 100 } })
      .then(r => setAppJobs(r.data.jobs))
      .catch(() => {})
  }, [tab])

  useEffect(() => {
    if (selectedJob == null) return
    setLoadingApps(true)
    api.get<Application[]>(`/applications/job/${selectedJob}/all`)
      .then(r => setApplications(r.data))
      .catch(() => setApplications([]))
      .finally(() => setLoadingApps(false))
  }, [selectedJob])

  const accepted = applications.filter(a => a.status === 'accepted').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  const others = applications.filter(a => a.status !== 'accepted')

  const normalizeList = (v: string[] | string | null | undefined): string[] => {
    if (!v) return []
    if (Array.isArray(v)) return v
    try { return JSON.parse(v) } catch { return [v] }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-navy-900">Recruiter Portal</h1>
          <p className="text-slate-500 text-sm mt-1">Manage job postings and review AI-screened candidates.</p>
        </div>
        <button
          onClick={() => navigate('/recruiter/jobs/create')}
          className="bg-brand-blue hover:bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
        >
          + New Job
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-8">
        {([['jobs', 'My Jobs'], ['applications', 'Applications']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-white shadow text-navy-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── MY JOBS TAB ── */}
      {tab === 'jobs' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by title…"
              className="border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition w-64"
            />
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {(['all', 'draft', 'published', 'closed'] as StatusFilter[]).map(s => (
                <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${statusFilter === s ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loadingJobs ? (
            <div className="py-20"><LoadingSpinner message="Loading jobs…" /></div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              {search || statusFilter !== 'all' ? 'No jobs match your filters.' : 'No jobs yet — click "+ New Job" to get started.'}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-600 w-2/5">
                        <button onClick={() => handleSort('created_at')} className="flex items-center hover:text-slate-900 transition">
                          Title <SortIcon field="created_at" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3.5 font-semibold text-slate-600">Status</th>
                      <th className="text-right px-4 py-3.5 font-semibold text-slate-600">
                        <button onClick={() => handleSort('total_applicants')} className="flex items-center ml-auto hover:text-slate-900 transition">
                          Applicants <SortIcon field="total_applicants" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3.5 font-semibold text-slate-600">Pool</th>
                      <th className="text-right px-4 py-3.5 font-semibold text-slate-600">
                        <button onClick={() => handleSort('avg_score')} className="flex items-center ml-auto hover:text-slate-900 transition">
                          Avg Score <SortIcon field="avg_score" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3.5 font-semibold text-slate-600">Created</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobs.map(job => (
                      <tr key={job.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-800 group-hover:text-brand-blue transition">{job.title}</div>
                          {(job.location || job.department) && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              {[job.location, job.department].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[job.status]}`}>
                            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-700">{job.total_applicants}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`font-semibold ${job.pool_count >= job.max_count ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {job.pool_count}
                          </span>
                          <span className="text-slate-400">/{job.max_count}</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {job.avg_score > 0
                            ? <span className="font-semibold text-slate-700">{job.avg_score.toFixed(1)}%</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-4 text-right text-slate-400 text-xs whitespace-nowrap">
                          {new Date(job.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => navigate(`/recruiter/jobs/${job.id}/edit`)}
                              className="text-xs font-semibold text-brand-blue hover:underline px-2 py-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleStatus(job)}
                              disabled={togglingId === job.id || job.status === 'closed'}
                              className={`text-xs font-semibold px-2 py-1 rounded transition disabled:opacity-40 ${
                                job.status === 'published'
                                  ? 'text-red-500 hover:bg-red-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {togglingId === job.id ? '…' : job.status === 'published' ? 'Unpublish' : job.status === 'draft' ? 'Publish' : 'Closed'}
                            </button>
                            <button
                              onClick={() => { setSelectedJob(job.id); setTab('applications') }}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-2 py-1 rounded transition"
                            >
                              View Apps
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-500">
                    Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
                  </p>
                  <div className="flex gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                      ← Prev
                    </button>
                    {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                      const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i
                      return (
                        <button key={p} onClick={() => setPage(p)}
                          className={`w-9 py-1.5 text-sm border rounded-lg transition ${p === page ? 'bg-brand-blue text-white border-brand-blue' : 'border-slate-200 hover:bg-slate-50'}`}>
                          {p}
                        </button>
                      )
                    })}
                    <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── APPLICATIONS TAB ── */}
      {tab === 'applications' && (
        <div>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Job</label>
            <select
              value={selectedJob ?? ''}
              onChange={e => { setSelectedJob(Number(e.target.value) || null); setExpandedApp(null) }}
              className="border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition min-w-80"
            >
              <option value="">— choose a job —</option>
              {appJobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.pool_count}/{j.max_count} pool · {j.total_applicants} applicants
                </option>
              ))}
            </select>
          </div>

          {loadingApps && <LoadingSpinner message="Loading applications…" />}

          {selectedJob && !loadingApps && applications.length === 0 && (
            <div className="text-slate-400 text-center py-16">No applications yet for this role.</div>
          )}

          {!loadingApps && accepted.length > 0 && (
            <div className="mb-8">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center">✓</span>
                Shortlisted Pool ({accepted.length})
              </h3>
              <div className="space-y-3">
                {accepted.map(app => {
                  const strengths = normalizeList(app.strengths)
                  const gaps = normalizeList(app.gaps)
                  return (
                    <div key={app.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
                        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-brand-blue text-white text-sm font-bold flex items-center justify-center shrink-0">
                          {app.rank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{app.candidate_name}</p>
                          <p className="text-slate-400 text-xs">{app.candidate_email}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-lg font-bold text-brand-blue">{app.match_score.toFixed(1)}%</p>
                            <p className="text-xs text-slate-400">match</p>
                          </div>
                          <span className="text-slate-300">{expandedApp === app.id ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {expandedApp === app.id && (
                        <div className="border-t border-slate-100 p-5 bg-slate-50 space-y-4">
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
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!loadingApps && others.length > 0 && (
            <div>
              <h3 className="font-bold text-slate-500 mb-4 text-sm uppercase tracking-wide">
                Rejected / Displaced ({others.length})
              </h3>
              <div className="space-y-2">
                {others.map(app => (
                  <div key={app.id} className="bg-white rounded-lg border border-slate-200 flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{app.candidate_name}</p>
                      <p className="text-xs text-slate-400">{app.candidate_email}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-500">{app.match_score.toFixed(1)}%</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${APP_STATUS_COLORS[app.status] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {app.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
