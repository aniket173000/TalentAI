import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import EligibilityCriteriaEditor from '../components/EligibilityCriteriaEditor'
import { EligibilityCriteria, Job } from '../types'

const BLANK_CRITERIA: EligibilityCriteria = { min_years_experience: null, required_skills: [], required_education: null }

const inputCls = 'w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition'
const selectCls = `${inputCls} bg-white`
const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5'

export default function CreateJob() {
  const navigate = useNavigate()
  const jdFileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [department, setDepartment] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [remotePolicy, setRemotePolicy] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [deadline, setDeadline] = useState('')
  const [maxCount, setMaxCount] = useState(10)
  const [minScore, setMinScore] = useState(80)
  const [jdText, setJdText] = useState('')
  const [jdFile, setJdFile] = useState<File | null>(null)
  const [criteria, setCriteria] = useState<EligibilityCriteria>(BLANK_CRITERIA)
  const [showCriteria, setShowCriteria] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const hasCriteria = criteria.required_skills.length > 0 || !!criteria.min_years_experience ||
    (!!criteria.required_education && criteria.required_education !== 'None')

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
      fd.append('location', location.trim() || 'Remote')
      fd.append('max_count', String(maxCount))
      fd.append('min_match_score', String(minScore))
      if (department.trim()) fd.append('department', department.trim())
      if (employmentType) fd.append('employment_type', employmentType)
      if (remotePolicy) fd.append('remote_policy', remotePolicy)
      if (salaryMin) fd.append('salary_range_min', salaryMin)
      if (salaryMax) fd.append('salary_range_max', salaryMax)
      if (deadline) fd.append('application_deadline', new Date(deadline).toISOString())
      if (jdText.trim()) fd.append('jd_text', jdText.trim())
      if (jdFile) fd.append('jd_file', jdFile)

      const res = await api.post<Job>('/jobs/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      // Attach eligibility criteria via PATCH (form-data POST can't carry nested JSON)
      if (showCriteria && hasCriteria) {
        await api.patch(`/jobs/${res.data.id}`, { eligibility_criteria: criteria })
      }

      navigate('/recruiter')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to create job. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <button onClick={() => navigate('/recruiter')} className="text-slate-400 hover:text-slate-600 transition text-sm">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Create Job Posting</h1>
          <p className="text-slate-500 text-sm mt-0.5">Saved as Draft — publish from the dashboard when ready.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Basic Info */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-800 mb-5">Basic Info</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Job Title <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer" className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Company</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                placeholder="Acme Corp" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="Remote / Singapore" className={inputCls} />
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
            <div>
              <label className={labelCls}>Application Deadline</label>
              <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
            </div>
          </div>
        </section>

        {/* Compensation */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-800 mb-5">Compensation <span className="text-xs font-normal text-slate-400">(optional)</span></h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Salary Min (USD / year)</label>
              <input type="number" min={0} value={salaryMin} onChange={e => setSalaryMin(e.target.value)}
                placeholder="80000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Salary Max (USD / year)</label>
              <input type="number" min={0} value={salaryMax} onChange={e => setSalaryMax(e.target.value)}
                placeholder="120000" className={inputCls} />
            </div>
          </div>
        </section>

        {/* Job Description */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-800 mb-5">Job Description <span className="text-red-500">*</span></h2>
          <textarea
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            placeholder="Paste the full job description here (min. 100 characters)…"
            rows={12}
            className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition resize-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <span className="text-slate-400 text-xs">or upload a file</span>
            <button type="button" onClick={() => jdFileRef.current?.click()}
              className="text-xs text-brand-blue hover:underline font-medium">
              {jdFile ? `✓ ${jdFile.name}` : 'Upload PDF / DOCX / TXT'}
            </button>
            <input ref={jdFileRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
              onChange={e => setJdFile(e.target.files?.[0] || null)} />
          </div>
          {jdText.length > 0 && (
            <p className={`text-xs mt-1 ${jdText.length < 100 ? 'text-red-500' : 'text-slate-400'}`}>
              {jdText.length} / 100 characters minimum
            </p>
          )}
        </section>

        {/* Screening Settings */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-800 mb-5">Screening Settings</h2>
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

        {/* Eligibility Criteria */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-slate-800">Eligibility Criteria</h2>
              <p className="text-xs text-slate-400 mt-0.5">Hard requirements — candidates not meeting these score below 50.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCriteria(v => !v)}
              className="text-sm text-brand-blue hover:underline font-medium"
            >
              {showCriteria ? 'Hide' : 'Add criteria'}
            </button>
          </div>
          {showCriteria && <EligibilityCriteriaEditor value={criteria} onChange={setCriteria} />}
          {!showCriteria && hasCriteria && (
            <div className="flex flex-wrap gap-2">
              {criteria.required_skills.map(s => (
                <span key={s} className="bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2.5 py-1 rounded-full border border-brand-blue/20">{s}</span>
              ))}
              {criteria.min_years_experience && (
                <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200">{criteria.min_years_experience}+ yrs exp</span>
              )}
              {criteria.required_education && criteria.required_education !== 'None' && (
                <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200">{criteria.required_education}</span>
              )}
            </div>
          )}
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
            className="flex-1 bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors text-sm">
            {submitting ? 'Saving…' : 'Save as Draft'}
          </button>
        </div>
      </form>
    </div>
  )
}
