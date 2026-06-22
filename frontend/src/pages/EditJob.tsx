import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import EligibilityCriteriaEditor from '../components/EligibilityCriteriaEditor'
import LoadingSpinner from '../components/LoadingSpinner'
import { EligibilityCriteria, Job, JobAuditLog } from '../types'
import { CURRENCIES } from './CreateJob'

const BLANK_CRITERIA: EligibilityCriteria = { min_years_experience: null, required_skills: [], required_education: null }
const inputCls = 'w-full border-2 border-hairline rounded-lg px-4 py-2.5 text-sm bg-surface text-ink focus:outline-none focus:border-accent transition'
const selectCls = `${inputCls}`
const labelCls = 'block text-sm font-bold text-ink mb-1.5'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-red-50 text-red-600 border-red-200',
}

export default function EditJob() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [auditLog, setAuditLog] = useState<JobAuditLog[]>([])

  // Form state
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [location, setLocation] = useState('')
  const [department, setDepartment] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [remotePolicy, setRemotePolicy] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [salaryCurrency, setSalaryCurrency] = useState('INR')
  const [deadline, setDeadline] = useState('')
  const [maxCount, setMaxCount] = useState(10)
  const [minScore, setMinScore] = useState(80)
  const [jdText, setJdText] = useState('')
  const [criteria, setCriteria] = useState<EligibilityCriteria>(BLANK_CRITERIA)

  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Track initial values to detect dirty state
  const initialRef = useRef<string>('')

  const snapshot = () => JSON.stringify({ title, company, companyUrl, location, department, employmentType, remotePolicy, salaryMin, salaryMax, salaryCurrency, deadline, maxCount, minScore, jdText, criteria })

  useEffect(() => {
    if (!jobId) return
    Promise.all([
      api.get<Job>(`/jobs/${jobId}`),
      api.get<JobAuditLog[]>(`/jobs/${jobId}/audit-log`).catch(() => ({ data: [] })),
    ]).then(([jobRes, logRes]) => {
      const j = jobRes.data
      setJob(j)
      setTitle(j.title)
      setCompany(j.company)
      setCompanyUrl(j.company_url || '')
      setLocation(j.location)
      setDepartment(j.department || '')
      setEmploymentType(j.employment_type || '')
      setRemotePolicy(j.remote_policy || '')
      setSalaryMin(j.salary_range_min?.toString() || '')
      setSalaryMax(j.salary_range_max?.toString() || '')
      setSalaryCurrency(j.salary_currency || 'INR')
      setDeadline(j.application_deadline ? j.application_deadline.slice(0, 16) : '')
      setMaxCount(j.max_count)
      setMinScore(j.min_match_score)
      setJdText(j.jd_text)
      setCriteria(j.eligibility_criteria ?? BLANK_CRITERIA)
      setAuditLog(logRes.data as JobAuditLog[])
    }).finally(() => setLoading(false))
  }, [jobId])

  // Set initial snapshot after loading
  useEffect(() => {
    if (!loading) {
      setTimeout(() => { initialRef.current = snapshot() }, 50)
    }
  }, [loading])

  // Track dirty state
  useEffect(() => {
    if (initialRef.current) {
      setIsDirty(snapshot() !== initialRef.current)
    }
  })

  // Browser-level unsaved changes warning
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jdText.trim()) { setSaveError('Job description cannot be empty.'); return }
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const body: Record<string, unknown> = {
        title, company, company_url: companyUrl || '', location, max_count: maxCount, min_match_score: minScore, jd_text: jdText,
      }
      if (department) body.department = department
      if (employmentType) body.employment_type = employmentType
      if (remotePolicy) body.remote_policy = remotePolicy
      if (salaryMin) body.salary_range_min = parseInt(salaryMin)
      if (salaryMax) body.salary_range_max = parseInt(salaryMax)
      if (salaryMin || salaryMax) body.salary_currency = salaryCurrency
      if (deadline) body.application_deadline = new Date(deadline).toISOString()
      body.eligibility_criteria = criteria

      const res = await api.patch<Job>(`/jobs/${jobId}`, body)
      setJob(res.data)
      initialRef.current = snapshot()
      setIsDirty(false)
      setSaveSuccess(true)
      // Refresh audit log
      api.get<JobAuditLog[]>(`/jobs/${jobId}/audit-log`).then(r => setAuditLog(r.data)).catch(() => {})
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(msg || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    if (!job) return
    setToggling(true)
    try {
      const endpoint = job.status === 'published' ? 'unpublish' : 'publish'
      const res = await api.post<Job>(`/jobs/${jobId}/${endpoint}`)
      setJob(res.data)
      api.get<JobAuditLog[]>(`/jobs/${jobId}/audit-log`).then(r => setAuditLog(r.data)).catch(() => {})
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(msg || 'Failed to update status.')
    } finally {
      setToggling(false)
    }
  }

  if (loading) return <div className="py-24"><LoadingSpinner message="Loading job…" /></div>
  if (!job) return <div className="text-center py-24 text-slate-400">Job not found.</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/recruiter')} className="text-slate-400 hover:text-slate-600 transition text-sm">← Back</button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Edit Job</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[job.status]}`}>
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </span>
              {job.slug && <span className="text-xs text-slate-400">/jobs/{job.slug}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-50 ${
            job.status === 'published'
              ? 'border-red-200 text-red-600 hover:bg-red-50'
              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {toggling ? '…' : job.status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
      </div>

      {/* Unsaved changes banner */}
      {isDirty && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-amber-700 font-medium">You have unsaved changes.</p>
          <button onClick={handleSave} disabled={saving}
            className="text-sm font-semibold text-amber-700 hover:text-amber-900 underline">
            {saving ? 'Saving…' : 'Save now'}
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Basic Info */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-display font-extrabold text-ink text-lg mb-5">Basic Info</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Job Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Company Name</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Company Website or LinkedIn URL
                <span className="font-normal text-slate-400 ml-1">(used to show logo on the job board)</span>
              </label>
              <input type="url" value={companyUrl} onChange={e => setCompanyUrl(e.target.value)}
                placeholder="https://aspire.io  or  https://linkedin.com/company/aspire" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Employment Type</label>
              <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className={selectCls}>
                <option value="">— Select —</option>
                {['Full-time', 'Part-time', 'Contract', 'Internship'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Remote Policy</label>
              <select value={remotePolicy} onChange={e => setRemotePolicy(e.target.value)} className={selectCls}>
                <option value="">— Select —</option>
                {['On-site', 'Remote', 'Hybrid'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Application Deadline</label>
              <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
            </div>
          </div>
        </section>

        {/* Compensation */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-display font-extrabold text-ink text-lg mb-5">Compensation <span className="text-xs font-normal text-slate-400">(optional)</span></h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Currency</label>
              <select value={salaryCurrency} onChange={e => setSalaryCurrency(e.target.value)} className={selectCls}>
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Salary Min <span className="font-normal text-slate-400">/ year</span></label>
              <input type="number" min={0} value={salaryMin} onChange={e => setSalaryMin(e.target.value)} placeholder="800000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Salary Max <span className="font-normal text-slate-400">/ year</span></label>
              <input type="number" min={0} value={salaryMax} onChange={e => setSalaryMax(e.target.value)} placeholder="1200000" className={inputCls} />
            </div>
          </div>
        </section>

        {/* Job Description */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-bold text-slate-800 mb-2">Job Description</h2>
          <p className="text-xs text-slate-400 mb-4">Editing a published job flags it for AI re-parsing on the next application submission.</p>
          <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={14}
            className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition resize-none" />
        </section>

        {/* Screening Settings */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-display font-extrabold text-ink text-lg mb-5">Screening Settings</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Max Pool Size</label>
              <input type="number" min={1} max={500} value={maxCount} onChange={e => setMaxCount(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Min. AI Match Score (%)</label>
              <input type="number" min={0} max={100} value={minScore} onChange={e => setMinScore(Number(e.target.value))} className={inputCls} />
            </div>
          </div>
        </section>

        {/* Eligibility Criteria */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-bold text-slate-800 mb-1.5">Eligibility Criteria</h2>
          <p className="text-xs text-slate-400 mb-5">Changes do not retroactively re-score existing candidates.</p>
          <EligibilityCriteriaEditor value={criteria} onChange={setCriteria} />
        </section>

        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{saveError}</div>
        )}
        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">✓ Changes saved.</div>
        )}

        <button type="submit" disabled={saving || !isDirty}
          className="w-full disabled:opacity-40 text-white font-extrabold rounded-xl py-3 text-sm">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      {/* Audit Log */}
      {auditLog.length > 0 && (
        <section className="mt-10 bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-bold text-slate-800 mb-4">Change History</h2>
          <div className="space-y-3">
            {auditLog.map(entry => (
              <div key={entry.id} className="flex gap-3 text-sm">
                <div className="w-1 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700">{entry.field_name}</span>
                    {entry.actor_name && <span className="text-slate-400 text-xs">by {entry.actor_name}</span>}
                    <span className="text-slate-400 text-xs ml-auto">
                      {new Date(entry.changed_at).toLocaleString()}
                    </span>
                  </div>
                  {(entry.old_value || entry.new_value) && (
                    <div className="mt-1 flex gap-2 text-xs flex-wrap">
                      {entry.old_value && (
                        <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded line-through">
                          {entry.old_value.length > 60 ? entry.old_value.slice(0, 60) + '…' : entry.old_value}
                        </span>
                      )}
                      {entry.new_value && (
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                          {entry.new_value.length > 60 ? entry.new_value.slice(0, 60) + '…' : entry.new_value}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
