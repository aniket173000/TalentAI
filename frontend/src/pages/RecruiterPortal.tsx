import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Job } from '../types'

interface AppRecord {
  id: number
  candidate_name: string
  candidate_email: string
  match_score: number
  rank: number | null
  status: string
  strengths: string[]
  gaps: string[]
  improvement_suggestions: string[]
  applied_at: string
}

type Tab = 'post' | 'view'

const STATUS_COLORS: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
  displaced: 'bg-amber-50 text-amber-600 border-amber-200',
}

export default function RecruiterPortal() {
  const [tab, setTab] = useState<Tab>('post')

  // Post Job state
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [maxCount, setMaxCount] = useState(10)
  const [jdText, setJdText] = useState('')
  const [jdFile, setJdFile] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)
  const [postSuccess, setPostSuccess] = useState('')
  const [postError, setPostError] = useState('')
  const jdFileRef = useRef<HTMLInputElement>(null)

  // View Applications state
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<number | null>(null)
  const [applications, setApplications] = useState<AppRecord[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [expandedApp, setExpandedApp] = useState<number | null>(null)

  useEffect(() => {
    api.get<Job[]>('/jobs/').then(r => setJobs(r.data)).catch(() => {})
  }, [postSuccess])

  useEffect(() => {
    if (selectedJob == null) return
    setLoadingApps(true)
    api.get<AppRecord[]>(`/applications/job/${selectedJob}/all`)
      .then(r => setApplications(r.data))
      .catch(() => setApplications([]))
      .finally(() => setLoadingApps(false))
  }, [selectedJob])

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setPostError('Job title is required.'); return }
    if (!jdText.trim() && !jdFile) { setPostError('Please provide a job description.'); return }

    setPosting(true)
    setPostError('')
    setPostSuccess('')

    const fd = new FormData()
    fd.append('title', title.trim())
    fd.append('company', company.trim() || 'Our Company')
    fd.append('location', location.trim() || 'Remote')
    fd.append('max_count', String(maxCount))
    if (jdText.trim()) fd.append('jd_text', jdText.trim())
    if (jdFile) fd.append('jd_file', jdFile)

    try {
      const res = await api.post<Job>('/jobs/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPostSuccess(`"${res.data.title}" posted successfully! Job ID: ${res.data.id}`)
      setTitle(''); setCompany(''); setLocation(''); setJdText(''); setJdFile(null); setMaxCount(10)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPostError(msg || 'Failed to post job. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  const accepted = applications.filter(a => a.status === 'accepted').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  const others = applications.filter(a => a.status !== 'accepted')

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-navy-900">Recruiter Portal</h1>
        <p className="text-slate-500 text-sm mt-1">Post jobs and manage your AI-screened candidate pool.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-8">
        {(['post', 'view'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? 'bg-white shadow text-navy-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'post' ? '+ Post a Job' : '📋 View Applications'}
          </button>
        ))}
      </div>

      {/* ── POST JOB ── */}
      {tab === 'post' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-2xl">
          <h2 className="font-bold text-slate-800 text-xl mb-6">New Job Posting</h2>
          <form onSubmit={handlePostJob} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Job Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company</label>
                <input
                  type="text" value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Location</label>
                <input
                  type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="Remote / Singapore"
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Max Candidates in Pool
                </label>
                <input
                  type="number" min={1} max={100} value={maxCount}
                  onChange={e => setMaxCount(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Job Description *
              </label>
              <textarea
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                placeholder="Paste the full job description here…"
                rows={10}
                className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition resize-none"
              />
              <div className="mt-2 flex items-center gap-3">
                <span className="text-slate-400 text-xs">or upload a file</span>
                <button
                  type="button"
                  onClick={() => jdFileRef.current?.click()}
                  className="text-xs text-brand-blue hover:underline font-medium"
                >
                  {jdFile ? `✓ ${jdFile.name}` : 'Upload PDF / DOCX / TXT'}
                </button>
                <input
                  ref={jdFileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={e => setJdFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {postError && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
                {postError}
              </div>
            )}
            {postSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
                ✓ {postSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={posting}
              className="w-full bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors"
            >
              {posting ? 'Posting…' : 'Post Job'}
            </button>
          </form>
        </div>
      )}

      {/* ── VIEW APPLICATIONS ── */}
      {tab === 'view' && (
        <div>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Job</label>
            <select
              value={selectedJob ?? ''}
              onChange={e => setSelectedJob(Number(e.target.value) || null)}
              className="border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition min-w-72"
            >
              <option value="">-- choose a job --</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.active_applications}/{j.max_count} candidates
                </option>
              ))}
            </select>
          </div>

          {loadingApps && <LoadingSpinner message="Loading applications…" />}

          {selectedJob && !loadingApps && applications.length === 0 && (
            <div className="text-slate-400 text-center py-12">No applications yet for this role.</div>
          )}

          {!loadingApps && accepted.length > 0 && (
            <div className="mb-8">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center">✓</span>
                Shortlisted Pool ({accepted.length})
              </h3>
              <div className="space-y-3">
                {accepted.map(app => (
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
                      <div className="border-t border-slate-100 p-4 bg-slate-50 grid gap-4 sm:grid-cols-2 animate-fade-in">
                        {app.strengths.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Strengths</p>
                            <ul className="space-y-1">{app.strengths.map((s, i) => <li key={i} className="text-xs text-slate-600">• {s}</li>)}</ul>
                          </div>
                        )}
                        {app.gaps.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Gaps</p>
                            <ul className="space-y-1">{app.gaps.map((g, i) => <li key={i} className="text-xs text-slate-600">• {g}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[app.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
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
