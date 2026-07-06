import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Application, CandidateStatus, Job, JobApplicationsResponse, JobListResponse } from '../types'

type Tab = 'jobs' | 'applications' | 'mcp'
type SortField = 'created_at' | 'total_applicants' | 'avg_score'
type StatusFilter = 'all' | 'draft' | 'published' | 'closed'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-red-50 text-red-600 border-red-200',
}

const CANDIDATE_STATUS_OPTIONS: { value: CandidateStatus; label: string }[] = [
  { value: 'pool_accepted',       label: 'Shortlisted'        },
  { value: 'under_review',        label: 'Under Review'       },
  { value: 'interview_scheduled', label: 'Interview Stage'    },
  { value: 'offer_extended',      label: 'Offer Extended'     },
  { value: 'interview_rejected',  label: 'Interview Rejected' },
  { value: 'rejected',            label: 'Rejected'           },
]

const CANDIDATE_STATUS_BADGE: Record<CandidateStatus, string> = {
  rejected:            'bg-red-50 text-red-600 border-red-200',
  pool_accepted:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  under_review:        'bg-blue-50 text-blue-700 border-blue-200',
  interview_scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  offer_extended:      'bg-purple-50 text-purple-700 border-purple-200',
  interview_rejected:  'bg-red-50 text-red-600 border-red-200',
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
  const [archivedCount, setArchivedCount] = useState(0)
  const [promotingId, setPromotingId] = useState<number | null>(null)
  const [loadingApps, setLoadingApps] = useState(false)
  const [expandedApp, setExpandedApp] = useState<number | null>(null)
  const [resumeDrawer, setResumeDrawer] = useState<Application | null>(null)
  const [drawerFile, setDrawerFile] = useState<{ url: string; content_type: string } | null>(null)
  const [drawerFileLoading, setDrawerFileLoading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null)
  const [pendingReject, setPendingReject] = useState<{ appId: number } | null>(null)
  const [feedbackText, setFeedbackText] = useState('')

  const updateCandidateStatus = async (appId: number, newStatus: CandidateStatus, feedback?: string) => {
    setUpdatingStatus(appId)
    try {
      await api.patch(`/applications/${appId}/status`, {
        candidate_status: newStatus,
        ...(feedback !== undefined ? { feedback } : {}),
      })
      setApplications(prev =>
        prev.map(a => a.id === appId ? { ...a, candidate_status: newStatus } : a)
      )
    } catch {
      // ignore — leave existing status
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleStatusChange = (appId: number, value: CandidateStatus) => {
    if (value === 'interview_rejected') {
      setPendingReject({ appId })
      setFeedbackText('')
    } else {
      updateCandidateStatus(appId, value)
    }
  }

  // Fetch presigned URL whenever the resume drawer opens
  useEffect(() => {
    if (!resumeDrawer) { setDrawerFile(null); return }
    setDrawerFileLoading(true)
    setDrawerFile(null)
    api.get<{ available: boolean; url?: string; content_type?: string }>(
      `/applications/${resumeDrawer.id}/resume-url`
    )
      .then(r => {
        if (r.data.available && r.data.url) {
          setDrawerFile({ url: r.data.url, content_type: r.data.content_type ?? '' })
        }
      })
      .catch(() => {}) // fall through to text display
      .finally(() => setDrawerFileLoading(false))
  }, [resumeDrawer])

  useEffect(() => {
    if (tab !== 'applications') return
    api.get<JobListResponse>('/jobs/my', { params: { per_page: 100 } })
      .then(r => setAppJobs(r.data.jobs))
      .catch(() => {})
  }, [tab])

  const loadApplications = useCallback((jobId: number, showSpinner = true) => {
    if (showSpinner) setLoadingApps(true)
    // Tolerate both response shapes so the FE never breaks when the two sides are
    // out of sync during a deploy: the new backend returns
    //   { applications, archived_count, total_applicants }
    // while the old one returned a bare Application[]. Grouping falls back to
    // `status` when pool_group is absent, so old data still renders.
    return api.get<JobApplicationsResponse | Application[]>(`/applications/job/${jobId}/all`)
      .then(r => {
        const data = r.data
        if (Array.isArray(data)) {
          setApplications(data)
          setArchivedCount(0)
        } else {
          setApplications(data.applications ?? [])
          setArchivedCount(data.archived_count ?? 0)
        }
      })
      .catch(() => { setApplications([]); setArchivedCount(0) })
      .finally(() => { if (showSpinner) setLoadingApps(false) })
  }, [])

  useEffect(() => {
    if (selectedJob == null) return
    loadApplications(selectedJob)
  }, [selectedJob, loadApplications])

  const promoteToShortlist = async (appId: number) => {
    if (selectedJob == null) return
    setPromotingId(appId)
    try {
      await api.post(`/applications/${appId}/promote`)
      await loadApplications(selectedJob, false)  // re-fetch: reserve re-ranks + backfills
    } catch {
      // ignore — leave the pools as-is
    } finally {
      setPromotingId(null)
    }
  }

  // Backend already splits and orders the pools; fall back to status if absent.
  const accepted = applications
    .filter(a => (a.pool_group ?? (a.status === 'accepted' ? 'shortlisted' : 'reserve')) === 'shortlisted')
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  const reserve = applications
    .filter(a => (a.pool_group ?? (a.status === 'accepted' ? 'shortlisted' : 'reserve')) === 'reserve')
    .sort((a, b) => (a.reserve_rank ?? 99) - (b.reserve_rank ?? 99))

  const downloadResume = (app: Application) => {
    const name = (app.resume_filename ?? 'resume').replace(/\.(pdf|docx|doc)$/i, '.txt')
    const blob = new Blob([app.resume_text ?? ''], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

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
          <h1 className="font-display font-extrabold text-ink" style={{fontSize:'clamp(26px,6vw,36px)',letterSpacing:"-0.035em"}}>Recruiter Portal</h1>
          <p className="text-slate-500 text-sm mt-1">Manage job postings and review AI-screened candidates.</p>
        </div>
        <button
          onClick={() => navigate('/recruiter/jobs/create')}
          className="bg-accent hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
        >
          + New Job
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-8">
        {([['jobs', 'My Jobs'], ['applications', 'Applications'], ['mcp', 'Claude Code']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-white shadow text-ink' : 'text-slate-500 hover:text-slate-700'}`}>
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
              className="border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent transition w-full sm:w-64"
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
              <div className="bg-surface rounded-2xl border-2 border-ink shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
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
                          <div className="font-semibold text-slate-800 group-hover:text-accent-ink transition">{job.title}</div>
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
                              className="text-xs font-semibold text-accent-ink hover:underline px-2 py-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => navigate(`/recruiter/jobs/${job.id}/assignments`)}
                              className="text-xs font-semibold text-violet-600 hover:underline px-2 py-1"
                            >
                              Assignments
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
                          className={`w-9 py-1.5 text-sm border rounded-lg transition ${p === page ? 'bg-accent text-white border-accent' : 'border-slate-200 hover:bg-slate-50'}`}>
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

      {/* ── Interview Rejection Feedback Modal ── */}
      {pendingReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Interview Rejection</h3>
            <p className="text-sm text-slate-500 mb-4">
              Provide feedback for the candidate. This will be included in the notification email and visible on their status page.
            </p>
            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="e.g. Did not demonstrate sufficient experience with distributed systems during the technical interview."
              rows={4}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setPendingReject(null)}
                className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-xl py-2.5 text-sm hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await updateCandidateStatus(
                    pendingReject.appId,
                    'interview_rejected',
                    feedbackText.trim() || undefined,
                  )
                  setPendingReject(null)
                }}
                disabled={updatingStatus === pendingReject.appId}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50"
              >
                {updatingStatus === pendingReject.appId ? 'Saving…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
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
              className="border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-accent transition w-full max-w-lg"
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
                    <div key={app.id} className="bg-surface rounded-2xl border-2 border-ink shadow-card overflow-hidden">
                      <button
                        onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
                        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center shrink-0">
                          {app.rank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{app.candidate_name}</p>
                          <p className="text-slate-400 text-xs">{app.candidate_email}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-lg font-bold text-accent-ink">{app.match_score.toFixed(1)}%</p>
                            <p className="text-xs text-slate-400">match</p>
                          </div>
                          {/* Status change dropdown — stop propagation so it doesn't toggle expand */}
                          <div onClick={e => e.stopPropagation()}>
                            <select
                              value={app.candidate_status ?? 'pool_accepted'}
                              disabled={updatingStatus === app.id}
                              onChange={e => handleStatusChange(app.id, e.target.value as CandidateStatus)}
                              className={`text-xs font-semibold rounded-full border px-2.5 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue/30 transition ${CANDIDATE_STATUS_BADGE[app.candidate_status as CandidateStatus] ?? 'bg-slate-50 text-slate-500 border-slate-200'} ${updatingStatus === app.id ? 'opacity-50' : ''}`}
                            >
                              {CANDIDATE_STATUS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <span className="text-slate-300">{expandedApp === app.id ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {expandedApp === app.id && (
                        <div className="border-t border-slate-100 p-5 bg-slate-50 space-y-4">

                          {/* ── Contact info ── */}
                          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Candidate Info</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Name</p>
                                <p className="text-sm font-medium text-slate-800">{app.candidate_name}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Email</p>
                                <a href={`mailto:${app.candidate_email}`} className="text-sm text-accent-ink hover:underline break-all">{app.candidate_email}</a>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Phone</p>
                                {app.phone
                                  ? <a href={`tel:${app.phone}`} className="text-sm text-accent-ink hover:underline">{app.phone}</a>
                                  : <p className="text-sm text-slate-400 italic">Not provided</p>
                                }
                              </div>
                            </div>
                          </div>

                          {/* ── Strengths & Gaps ── */}
                          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                            {strengths.length > 0 && (
                              <div className="bg-surface rounded-2xl border-2 border-[color:var(--green-line)] p-4">
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
                              <div className="bg-surface rounded-2xl border-2 border-[color:var(--amber-line)] p-4">
                                <div className="flex items-center gap-1.5 mb-3">
                                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold flex items-center justify-center">!</span>
                                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Gaps / Weaknesses</p>
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

                          {/* ── Actions ── */}
                          <div className="flex flex-wrap items-center gap-3">
                            {app.candidate_id && (
                              <button
                                onClick={() => navigate(`/recruiter/candidates/${app.candidate_id}?job_id=${selectedJob}`)}
                                className="flex items-center gap-2 text-sm font-semibold text-white bg-accent hover:opacity-90 border-2 border-ink px-4 py-2.5 rounded-xl transition-colors"
                              >
                                <span>👤</span>
                                View Full Profile
                              </button>
                            )}
                            {app.resume_text && (
                              <button
                                onClick={() => setResumeDrawer(app)}
                                className="flex items-center gap-2 text-sm font-semibold text-accent-ink hover:opacity-80 border border-accent hover:border-accent bg-blue-50 hover:bg-blue-100 px-4 py-2.5 rounded-xl transition-colors"
                              >
                                <span>📄</span>
                                View Full Resume
                              </button>
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

          {!loadingApps && reserve.length > 0 && (
            <div>
              <h3 className="font-bold text-slate-500 mb-1 text-sm uppercase tracking-wide">
                Reserve Pool ({reserve.length})
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Your best runner-ups, ranked. Promote any of them into the shortlist if you need more candidates.
                {archivedCount > 0 && ` ${archivedCount} lower-scoring applicant${archivedCount === 1 ? '' : 's'} archived.`}
              </p>
              <div className="space-y-3">
                {reserve.map(app => {
                  const strengths = normalizeList(app.strengths)
                  const gaps = normalizeList(app.gaps)
                  return (
                    <div key={app.id} className="bg-surface rounded-2xl border-2 border-ink shadow-card overflow-hidden">
                      <button
                        onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
                        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">
                          {app.reserve_rank ?? '·'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{app.candidate_name}</p>
                          <p className="text-slate-400 text-xs">{app.candidate_email}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-400">{app.match_score.toFixed(1)}%</p>
                            <p className="text-xs text-slate-400">match</p>
                          </div>
                          <div onClick={e => e.stopPropagation()}>
                            <select
                              value={app.candidate_status ?? 'rejected'}
                              disabled={updatingStatus === app.id}
                              onChange={e => handleStatusChange(app.id, e.target.value as CandidateStatus)}
                              className={`text-xs font-semibold rounded-full border px-2.5 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue/30 transition ${CANDIDATE_STATUS_BADGE[app.candidate_status as CandidateStatus] ?? 'bg-slate-50 text-slate-500 border-slate-200'} ${updatingStatus === app.id ? 'opacity-50' : ''}`}
                            >
                              {CANDIDATE_STATUS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <span className="text-slate-300">{expandedApp === app.id ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {expandedApp === app.id && (
                        <div className="border-t border-slate-100 p-5 bg-slate-50 space-y-4">

                          {/* Contact info */}
                          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Candidate Info</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Name</p>
                                <p className="text-sm font-medium text-slate-800">{app.candidate_name}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Email</p>
                                <a href={`mailto:${app.candidate_email}`} className="text-sm text-accent-ink hover:underline break-all">{app.candidate_email}</a>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Phone</p>
                                {app.phone
                                  ? <a href={`tel:${app.phone}`} className="text-sm text-accent-ink hover:underline">{app.phone}</a>
                                  : <p className="text-sm text-slate-400 italic">Not provided</p>
                                }
                              </div>
                            </div>
                          </div>

                          {/* Reserve context banner */}
                          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-2">
                            <span className="text-slate-400 text-sm mt-0.5">☆</span>
                            <p className="text-xs text-slate-600">
                              {app.status === 'displaced'
                                ? 'Was shortlisted, then displaced by a stronger candidate. Kept on reserve — promote to bring them back into the shortlist.'
                                : `Not shortlisted (scored ${app.match_score.toFixed(1)}%), but among the top runner-ups. Promote to add them to the shortlist.`}
                            </p>
                          </div>

                          {/* Strengths & Gaps */}
                          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                            {strengths.length > 0 && (
                              <div className="bg-surface rounded-2xl border-2 border-[color:var(--green-line)] p-4">
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
                              <div className="bg-surface rounded-2xl border-2 border-[color:var(--amber-line)] p-4">
                                <div className="flex items-center gap-1.5 mb-3">
                                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold flex items-center justify-center">!</span>
                                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Gaps / Weaknesses</p>
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

                          {/* Actions */}
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              onClick={() => promoteToShortlist(app.id)}
                              disabled={promotingId === app.id}
                              className="flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-ink px-4 py-2.5 rounded-xl transition-colors"
                            >
                              <span>★</span>
                              {promotingId === app.id ? 'Promoting…' : 'Promote to shortlist'}
                            </button>
                            {app.candidate_id && (
                              <button
                                onClick={() => navigate(`/recruiter/candidates/${app.candidate_id}?job_id=${selectedJob}`)}
                                className="flex items-center gap-2 text-sm font-semibold text-white bg-accent hover:opacity-90 border-2 border-ink px-4 py-2.5 rounded-xl transition-colors"
                              >
                                <span>👤</span>
                                View Full Profile
                              </button>
                            )}
                            {app.resume_text && (
                              <button
                                onClick={() => setResumeDrawer(app)}
                                className="flex items-center gap-2 text-sm font-semibold text-accent-ink hover:opacity-80 border border-accent hover:border-accent bg-blue-50 hover:bg-blue-100 px-4 py-2.5 rounded-xl transition-colors"
                              >
                                <span>📄</span>
                                View Full Resume
                              </button>
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
        </div>
      )}

      {/* ── Resume Side Drawer ────────────────────────────────────────────────── */}
      {resumeDrawer && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/40 backdrop-blur-sm"
            onClick={() => setResumeDrawer(null)}
          />
          {/* Panel */}
          <div className="w-full max-w-3xl bg-white h-full flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 shrink-0 gap-4">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{resumeDrawer.candidate_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {resumeDrawer.resume_filename ?? 'Resume'} · {resumeDrawer.match_score.toFixed(1)}% match
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Download: use S3 URL if available, else generate text file */}
                {drawerFile ? (
                  <a
                    href={drawerFile.url}
                    download={resumeDrawer.resume_filename ?? 'resume'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold bg-accent hover:opacity-90 text-white px-3 py-2 rounded-lg transition-colors"
                  >
                    ↓ Download
                  </a>
                ) : (
                  <button
                    onClick={() => downloadResume(resumeDrawer)}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-accent hover:opacity-90 text-white px-3 py-2 rounded-lg transition-colors"
                  >
                    ↓ Download
                  </button>
                )}
                <button
                  onClick={() => setResumeDrawer(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors font-medium"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Resume body */}
            <div className="flex-1 min-h-0">
              {drawerFileLoading && (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading resume…
                </div>
              )}

              {/* PDF — rendered natively in the browser */}
              {!drawerFileLoading && drawerFile?.content_type === 'application/pdf' && (
                <iframe
                  src={drawerFile.url}
                  title="Resume"
                  className="w-full h-full border-0"
                />
              )}

              {/* DOCX / DOC — can't render in browser; prompt download */}
              {!drawerFileLoading && drawerFile && drawerFile.content_type !== 'application/pdf' && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-3xl">📄</div>
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">{resumeDrawer.resume_filename}</p>
                    <p className="text-sm text-slate-400">Word documents can't be previewed in the browser.</p>
                  </div>
                  <a
                    href={drawerFile.url}
                    download={resumeDrawer.resume_filename ?? 'resume'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-accent hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    ↓ Download to Open
                  </a>
                </div>
              )}

              {/* Fallback — no S3 file stored; show parsed text */}
              {!drawerFileLoading && !drawerFile && (
                <div className="h-full overflow-y-auto px-10 py-8">
                  <div className="mb-4 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <span>⚠</span>
                    Original file not available — showing extracted text.
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap leading-7 font-sans">
                    {resumeDrawer.resume_text}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CLAUDE CODE (MCP) TAB ── */}
      {tab === 'mcp' && <McpKeysCard />}
    </div>
  )
}

// ── Claude Code / MCP connect card ──────────────────────────────────────────
// Lets a recruiter generate a key to connect their own Claude Code to the
// recruiter MCP server (interview copilot). Revoking hard-deletes the key.

interface McpKey {
  id: number
  created_at: string
  last_used_at: string | null
}
interface McpKeyIssue extends McpKey {
  key: string
  connect_command: string
}

function McpKeysCard() {
  const [keys, setKeys] = useState<McpKey[] | null>(null)
  const [justIssued, setJustIssued] = useState<McpKeyIssue | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await api.get<McpKey[]>('/recruiter/mcp-keys')
    setKeys(res.data)
  }, [])

  useEffect(() => { load().catch(() => { setError('Could not load keys'); setKeys([]) }) }, [load])

  const generate = async () => {
    setBusy(true); setError('')
    try {
      const res = await api.post<McpKeyIssue>('/recruiter/mcp-keys')
      setJustIssued(res.data); setCopied(false)
      await load()
    } catch { setError('Failed to generate key') } finally { setBusy(false) }
  }

  const remove = async (id: number) => {
    try { await api.delete(`/recruiter/mcp-keys/${id}`); await load() }
    catch { setError('Failed to revoke key') }
  }

  const copy = () => {
    if (!justIssued) return
    navigator.clipboard?.writeText(justIssued.connect_command)
    setCopied(true)
  }

  return (
    <div className="max-w-3xl">
      {/* Intro */}
      <div className="bg-white rounded-2xl border-2 border-ink shadow-card p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🤖</div>
          <div>
            <h2 className="font-display font-extrabold text-ink text-lg">Connect Claude Code</h2>
            <p className="text-sm text-slate-500 mt-1 leading-6">
              Generate a key to connect your own Claude Code to Nideknil's recruiter MCP server.
              Then ask questions about a candidate's AI-fluency report right before an interview —
              e.g. <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">"what should I ask them?"</span>.
              You'll only ever see submissions on jobs you own.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* One-time key reveal */}
      {justIssued && (
        <div className="mb-6 rounded-2xl border-2 border-violet-300 bg-violet-50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-extrabold text-violet-900">Your connect command</span>
            <span className="text-xs font-semibold text-violet-600 bg-white border border-violet-200 rounded-full px-2 py-0.5">
              shown once — copy it now
            </span>
          </div>
          <pre className="bg-white border border-violet-200 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all text-slate-800">
            {justIssued.connect_command}
          </pre>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={copy}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 text-white text-sm font-bold hover:from-violet-500 hover:to-pink-500 transition">
              {copied ? '✓ Copied' : 'Copy command'}
            </button>
            <button onClick={() => setJustIssued(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Keys */}
      <div className="bg-white rounded-2xl border-2 border-ink shadow-card p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="font-display font-extrabold text-ink text-base">Your keys</h3>
          <button onClick={generate} disabled={busy}
            className="px-4 py-2 rounded-lg bg-ink text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 transition inline-flex items-center gap-2">
            {busy && <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
            {busy ? 'Generating…' : '+ Generate new key'}
          </button>
        </div>

        {!keys ? (
          <LoadingSpinner />
        ) : keys.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-8">
            No keys yet — generate one to connect Claude Code.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">
                    Created {new Date(k.created_at).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-slate-400">
                    {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : 'Never used'}
                  </div>
                </div>
                <button onClick={() => remove(k.id)}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition">
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-4">
          Revoking a key deletes it permanently and immediately disconnects any Claude Code using it.
        </p>
      </div>
    </div>
  )
}
