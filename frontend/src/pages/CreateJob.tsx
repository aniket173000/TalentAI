import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import AIJobDescription, { SuggestedDetails } from '../components/AIJobDescription'
import { useAuth } from '../context/AuthContext'
import { Job } from '../types'

// Kept for backward-compat with other pages that still import it.
export const CURRENCIES = [
  { code: 'INR', symbol: '₹' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
] as const

const inputCls = 'w-full border-2 border-hairline rounded-lg px-4 py-2.5 text-sm bg-surface text-ink focus:outline-none focus:border-accent transition'
const selectCls = `${inputCls}`
const labelCls = 'block text-sm font-bold text-ink mb-1.5'

export default function CreateJob() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  // Lock company field for any recruiter who has a company on their profile
  // (regardless of whether they authenticated via LinkedIn or email/password)
  const profileCompany = user?.company ?? ''
  const isInternalWithCompany = !!profileCompany && !user?.is_third_party_recruiter

  // Campus hiring: pre-fill if coming from a college page (?campus=College+Name)
  const campusParam = searchParams.get('campus') || ''

  const [title, setTitle] = useState('')
  const [company, setCompany] = useState(profileCompany)
  const [isCampusHiring, setIsCampusHiring] = useState(!!campusParam)
  const [campusCollegeName, setCampusCollegeName] = useState(campusParam)
  const [isThirdParty, setIsThirdParty] = useState(false)
  const [companyUrl, setCompanyUrl] = useState('')
  const [location, setLocation] = useState('')
  const [department, setDepartment] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [remotePolicy, setRemotePolicy] = useState('')
  const [maxCount, setMaxCount] = useState(10)
  const [minScore, setMinScore] = useState(80)
  const [jdText, setJdText] = useState('')
  const [jdFile, setJdFile] = useState<File | null>(null)
  const [isFresherFriendly, setIsFresherFriendly] = useState(false)
  const [autoFilling, setAutoFilling] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const publishModeRef = useRef(false)

  // Fill Department / Employment Type / Remote Policy / Location from the AI.
  // Only fills a field the recruiter hasn't already set, and everything stays editable.
  const applyDetails = (d: SuggestedDetails) => {
    if (d.department && !department.trim()) setDepartment(d.department)
    if (d.employment_type && !employmentType) setEmploymentType(d.employment_type)
    if (d.remote_policy && !remotePolicy) setRemotePolicy(d.remote_policy)
    if (d.location && !location.trim()) setLocation(d.location)
  }

  const autoFillDetails = async () => {
    if (!title.trim()) { setError('Add a job title first.'); return }
    setError('')
    setAutoFilling(true)
    try {
      const { data } = await api.post<SuggestedDetails>('/ai/job-details', {
        title, company, jd_text: jdText || undefined,
      })
      applyDetails(data)
    } catch { /* non-fatal */ } finally {
      setAutoFilling(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Job title is required.'); return }
    if (!jdText.trim() && !jdFile) { setError('Please provide a job description.'); return }
    if (jdText.trim().length > 0 && jdText.trim().length < 100) {
      setError('Job description must be at least 100 characters.'); return
    }

    setSubmitting(true)
    setError('')

    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('company', company.trim() || 'Our Company')
      fd.append('is_third_party', String(isThirdParty))
      if (companyUrl.trim()) fd.append('company_url', companyUrl.trim())
      fd.append('location', location.trim() || 'Remote')
      fd.append('max_count', String(maxCount))
      fd.append('min_match_score', String(minScore))
      if (department.trim()) fd.append('department', department.trim())
      if (employmentType) fd.append('employment_type', employmentType)
      if (remotePolicy) fd.append('remote_policy', remotePolicy)
      fd.append('is_fresher_friendly', String(isFresherFriendly))
      fd.append('is_campus_hiring', String(isCampusHiring))
      if (isCampusHiring && campusCollegeName.trim()) fd.append('campus_college_name', campusCollegeName.trim())
      if (jdText.trim()) fd.append('jd_text', jdText.trim())
      if (jdFile) fd.append('jd_file', jdFile)
      fd.append('status', publishModeRef.current ? 'published' : 'draft')

      await api.post<Job>('/jobs/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      navigate('/recruiter')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to create job. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Posting jobs (including campus hiring) requires recruiter mode. Candidates
  // who land here are shown how to switch instead of a form that would 403 on submit.
  if (!user?.is_recruiter) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="text-5xl mb-4">🧑‍💼</div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Recruiter mode required</h1>
        <p className="text-slate-500 text-sm mb-6">
          Posting a job or a campus-hiring role is a recruiter action. Switch to recruiter
          mode (or add recruiter access from your account) to continue.
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={() => navigate('/')}
            className="px-6 py-3 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
            Back to home
          </button>
          <button onClick={() => navigate('/recruiter')}
            className="px-6 py-3 rounded-lg bg-brand-blue hover:bg-blue-600 text-white text-sm font-semibold transition">
            Go to recruiter portal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <button onClick={() => navigate('/recruiter')} className="text-slate-400 hover:text-slate-600 transition text-sm">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Create a job in seconds</h1>
          <p className="text-slate-500 text-sm mt-0.5">Name the role, let AI draft the rest — then tweak anything.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Third-party recruiter disclosure — shown whenever recruiter has a company locked */}
        {isInternalWithCompany && (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isThirdParty}
                onChange={e => {
                  setIsThirdParty(e.target.checked)
                  if (!e.target.checked) setCompany(profileCompany)
                }}
                className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-semibold text-amber-800">
                  I am posting this job as a third-party recruiter
                </span>
                <p className="text-xs text-amber-700 mt-0.5">
                  Check this if you are recruiting on behalf of a client company rather than your own employer.
                  The job will be labelled "Posted by third-party recruiter" on the job board.
                </p>
              </div>
            </label>
          </section>
        )}

        {/* Step 1 — the role */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-display font-extrabold text-ink text-lg mb-5">Start here</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Job Title <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer" className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Company Name</label>
              {/* Lock company to recruiter's profile when they are not posting as third-party */}
              {isInternalWithCompany && !isThirdParty ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={company} readOnly
                    className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`} />
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                    ✓ Your company
                  </span>
                </div>
              ) : (
                <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Corp" className={inputCls} />
              )}
            </div>
            <div>
              <label className={labelCls}>
                Company Website or LinkedIn URL
                <span className="font-normal text-slate-400 ml-1">(optional — for your logo)</span>
              </label>
              <input type="url" value={companyUrl} onChange={e => setCompanyUrl(e.target.value)}
                placeholder="https://acme.com" className={inputCls} />
            </div>
          </div>
        </section>

        {/* Step 2 — Job Description with Write with AI / Paste / Upload */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-display font-extrabold text-ink text-lg mb-5">Job Description <span className="text-red-500">*</span></h2>
          <AIJobDescription
            value={jdText}
            onChange={setJdText}
            title={title}
            company={company}
            employmentType={employmentType}
            location={location}
            onDetails={applyDetails}
            allowUpload
            onFile={setJdFile}
            fileName={jdFile?.name}
          />
        </section>

        {/* Step 3 — details, AI-suggested and editable */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
            <div>
              <h2 className="font-display font-extrabold text-ink text-lg">Details</h2>
              <p className="text-xs text-slate-400 mt-0.5">Auto-filled from the role — change anything.</p>
            </div>
            <button type="button" onClick={autoFillDetails} disabled={autoFilling || !title.trim()}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 transition inline-flex items-center gap-2">
              {autoFilling && <span className="h-3 w-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />}
              ✨ Auto-fill with AI
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="Remote / Bengaluru" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)}
                placeholder="Engineering" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Employment Type</label>
              <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className={selectCls}>
                <option value="">— Select —</option>
                {['Full-time', 'Part-time', 'Contract', 'Internship'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Remote Policy</label>
              <select value={remotePolicy} onChange={e => setRemotePolicy(e.target.value)} className={selectCls}>
                <option value="">— Select —</option>
                {['On-site', 'Remote', 'Hybrid'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fresher-Friendly toggle */}
          <div className={`mt-4 rounded-xl border p-4 cursor-pointer transition-colors ${isFresherFriendly ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-violet-200'}`}
            onClick={() => setIsFresherFriendly(v => !v)}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={isFresherFriendly}
                onChange={e => setIsFresherFriendly(e.target.checked)}
                onClick={e => e.stopPropagation()}
                className="mt-0.5 h-4 w-4 rounded border-violet-400 text-violet-600 focus:ring-violet-500" />
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  🎓 Fresher-Friendly Role (Project-First Scoring)
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Projects count for 40% of the match score (up from 30%). Ideal for internships, junior roles, and entry-level positions where candidates may lack formal experience.
                </p>
              </div>
            </label>
          </div>

          {/* Campus Hiring toggle */}
          <div className={`mt-4 rounded-xl border p-4 cursor-pointer transition-colors ${isCampusHiring ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-200'}`}
            onClick={() => setIsCampusHiring(v => !v)}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={isCampusHiring}
                onChange={e => setIsCampusHiring(e.target.checked)}
                onClick={e => e.stopPropagation()}
                className="mt-0.5 h-4 w-4 rounded border-indigo-400 text-indigo-600 focus:ring-indigo-500" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-slate-800">
                  🏛️ Campus Hiring — Target a Specific College
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  This job will be visible only to candidates from the selected college, shown in the Campus Hiring section of that college's page.
                </p>
                {isCampusHiring && (
                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                    <input type="text" value={campusCollegeName}
                      onChange={e => setCampusCollegeName(e.target.value)}
                      placeholder="e.g. IIT Bombay"
                      readOnly={!!campusParam}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 transition ${campusParam ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'border-indigo-200 bg-white'}`} />
                    {campusParam && (
                      <p className="text-xs text-indigo-600 mt-1 font-medium">🔒 Locked to {campusParam}</p>
                    )}
                  </div>
                )}
              </div>
            </label>
          </div>
        </section>

        {/* Screening Settings (pool) */}
        <section className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6">
          <h2 className="font-display font-extrabold text-ink text-lg mb-5">Screening Settings</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Max Pool Size</label>
              <input type="number" min={1} max={500} value={maxCount}
                onChange={e => setMaxCount(Number(e.target.value))} className={inputCls} />
              <p className="text-xs text-slate-400 mt-1">Max accepted candidates held in the pool.</p>
            </div>
            <div>
              <label className={labelCls}>Min. AI Match Score (%)</label>
              <input type="number" min={0} max={100} value={minScore}
                onChange={e => setMinScore(Number(e.target.value))} className={inputCls} />
              <p className="text-xs text-slate-400 mt-1">Candidates below this score are auto-rejected.</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3 pb-8">
          <button type="button" onClick={() => navigate('/recruiter')}
            className="px-6 py-3 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            onClick={() => { publishModeRef.current = false }}
            className="px-6 py-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition">
            {submitting && !publishModeRef.current ? 'Saving…' : 'Save as Draft'}
          </button>
          <button type="submit" disabled={submitting}
            onClick={() => { publishModeRef.current = true }}
            className="flex-1 py-3 rounded-xl text-white text-sm font-extrabold disabled:opacity-50 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 shadow-lg shadow-violet-200 transition hover:scale-[1.01] active:scale-95">
            {submitting && publishModeRef.current ? 'Posting…' : 'Post Job 🚀'}
          </button>
        </div>
      </form>
    </div>
  )
}
