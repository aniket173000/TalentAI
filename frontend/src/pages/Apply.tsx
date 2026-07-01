import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Job, UserProfile } from '../types'

interface AppCheck {
  has_applied: boolean
  same_resume: boolean
  previous_match_score: number | null
  previous_status?: string
  previous_candidate_status?: string
  previous_rank?: number | null
  status_token?: string | null
  usable_vault_ids: number[]
}

type TailorState = 'idle' | 'loading' | 'done' | 'blocked'

export default function Apply() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [job, setJob] = useState<Job | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [appCheck, setAppCheck] = useState<AppCheck | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [phone, setPhone] = useState('')

  // Resume selection
  const [file, setFile] = useState<File | null>(null)
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [reapplyConfirmed, setReapplyConfirmed] = useState(false)

  // Tailor state
  const [tailorState, setTailorState] = useState<TailorState>('idle')
  const [tailoredText, setTailoredText] = useState<string | null>(null)
  const [tailorChanges, setTailorChanges] = useState<string[]>([])
  const [tailorBlockedMsg, setTailorBlockedMsg] = useState('')
  const [tailorFitScore, setTailorFitScore] = useState<number | null>(null)
  const [tailorFeasibility, setTailorFeasibility] = useState<string>('')
  const [useTailored, setUseTailored] = useState(false)
  const [showFullTailored, setShowFullTailored] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<Job>(`/jobs/${jobId}`).then(r => setJob(r.data)).catch(() => setError('Job not found.'))
    Promise.all([
      api.get<UserProfile>('/profile/me'),
      api.get<AppCheck>(`/applications/check/${jobId}`),
    ])
      .then(([pRes, cRes]) => {
        setProfile(pRes.data)
        setPhone(pRes.data.phone ?? '')
        setAppCheck(cRes.data)
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false))
  }, [jobId])

  const resetTailor = () => {
    setTailorState('idle')
    setTailoredText(null)
    setTailorChanges([])
    setTailorBlockedMsg('')
    setTailorFitScore(null)
    setTailorFeasibility('')
    setUseTailored(false)
    setShowFullTailored(false)
  }

  const handleFileChange = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setSelectedVaultId(null)
    setReapplyConfirmed(false)
    resetTailor()
  }

  const handleVaultSelect = (id: number) => {
    setSelectedVaultId(id === selectedVaultId ? null : id)
    setFile(null)
    setReapplyConfirmed(false)
    resetTailor()
  }

  const handleTailor = async () => {
    setTailorState('loading')
    setError('')
    try {
      const res = await api.post<{
        tailored_resume: string
        changes: string[]
        domain_fit_score: number
        tailoring_feasibility: string
      }>(`/applications/tailor-resume/${jobId}`)
      setTailoredText(res.data.tailored_resume)
      setTailorChanges(res.data.changes)
      setTailorFitScore(res.data.domain_fit_score ?? null)
      setTailorFeasibility(res.data.tailoring_feasibility ?? '')
      setUseTailored(true)
      setTailorState('done')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { error?: string; message?: string } } } })
        ?.response?.data?.detail
      if (detail && typeof detail === 'object' && detail.message) {
        setTailorBlockedMsg(detail.message)
        setTailorState('blocked')
      } else {
        setTailorState('idle')
        setError('Could not tailor resume. Please try again.')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

    const needsPhone = !profile.phone
    const needsResume = !profile.resume_filename && !file && !selectedVaultId
    const isReapplying = appCheck?.has_applied
    const usingNewFile = !!file && !selectedVaultId

    if (needsPhone && !phone.trim()) { setError('Please enter your phone number.'); return }
    if (needsResume) { setError('Please select or upload a resume.'); return }
    if (isReapplying && usingNewFile && !reapplyConfirmed) {
      setError('Please confirm your new resume better matches the job requirements.')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      if (needsPhone && phone.trim()) {
        await api.patch('/profile/me', { phone: phone.trim() })
      }

      const isConfirmed = isReapplying && (!!selectedVaultId || reapplyConfirmed)
      const url = `/applications/apply/${jobId}${isConfirmed ? '?confirmed_reapply=true' : ''}`

      const fd = new FormData()
      if (file) {
        fd.append('resume_file', file)
      } else if (selectedVaultId) {
        fd.append('resume_id', String(selectedVaultId))
      }
      if (useTailored && tailoredText) {
        fd.append('tailored_resume_text', tailoredText)
      }

      const hasBody = file || selectedVaultId || (useTailored && tailoredText)
      const res = hasBody ? await api.post(url, fd) : await api.post(url)

      navigate('/result', { state: { result: res.data, jobTitle: job?.title } })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { message?: string } | string } } })
        ?.response?.data?.detail
      if (typeof detail === 'object' && detail?.message) setError(detail.message)
      else setError(typeof detail === 'string' ? detail : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitting) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <LoadingSpinner message="AI is analysing your resume… this may take 10–20 seconds." />
      </div>
    )
  }

  // ── Already applied: one application per job — show status, no reapply ────
  // Reapplying is blocked server-side for any prior application, so we never
  // show tailoring advice or a resubmit form. Instead we mirror the shortlisted
  // card for every outcome and make it clear the candidate can't apply again.
  if (!loadingProfile && appCheck?.has_applied) {
    const status = appCheck.previous_status ?? 'received'
    const candidateStatus = appCheck.previous_candidate_status ?? 'received'
    const score = appCheck.previous_match_score
    const rank = appCheck.previous_rank
    const isAccepted = status === 'accepted'

    const candidateLabels: Record<string, string> = {
      pool_accepted: 'In the candidate pool',
      interview_scheduled: 'Interview scheduled',
      hired: 'Hired',
    }

    const theme = isAccepted
      ? { bar: 'from-emerald-400 to-teal-400', border: 'border-emerald-200', iconBg: 'bg-emerald-100', emoji: '🎉', sub: 'text-emerald-600', scoreColor: 'text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700' }
      : status === 'displaced'
      ? { bar: 'from-amber-400 to-orange-400', border: 'border-amber-200', iconBg: 'bg-amber-100', emoji: '📋', sub: 'text-amber-600', scoreColor: 'text-amber-600', btn: 'bg-slate-700 hover:bg-slate-800' }
      : { bar: 'from-slate-300 to-slate-400', border: 'border-slate-200', iconBg: 'bg-slate-100', emoji: '📋', sub: 'text-slate-500', scoreColor: 'text-slate-600', btn: 'bg-slate-700 hover:bg-slate-800' }

    const subtitle = isAccepted
      ? (candidateLabels[candidateStatus] ?? 'Application accepted')
      : status === 'displaced'
      ? 'No longer in the candidate pool'
      : 'Not shortlisted'

    const message = isAccepted
      ? 'Your application is live. The recruiter will reach out if you progress. You can track real-time status updates using the link below.'
      : 'Each candidate may submit only one application per job opening, so you can’t apply to this role again. You can review your application status any time using the link below.'

    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-fade-in">
        <Link to={`/jobs/${jobId}`} className="text-sm text-accent-ink hover:underline mb-8 block">
          ← Back to job
        </Link>

        {job && (
          <div className="mb-6">
            <p className="text-muted text-sm font-medium">{job.company}</p>
            <h1 className="text-2xl font-display font-extrabold text-ink">{job.title}</h1>
          </div>
        )}

        <div className={`rounded-2xl border ${theme.border} bg-white shadow-sm overflow-hidden`}>
          <div className={`h-2 bg-gradient-to-r ${theme.bar}`} />
          <div className="p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl ${theme.iconBg} flex items-center justify-center text-3xl shrink-0`}>
                {theme.emoji}
              </div>
              <div>
                <h2 className="text-xl font-display font-extrabold text-ink leading-tight">
                  You've already applied to this role
                </h2>
                <p className={`text-sm font-semibold mt-1 ${theme.sub}`}>{subtitle}</p>
              </div>
            </div>

            {(score !== null || (isAccepted && rank)) && (
              <div className="grid grid-cols-2 gap-3 mb-6">
                {score !== null && (
                  <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className={`text-2xl font-extrabold ${theme.scoreColor}`}>{score}%</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Match score</p>
                  </div>
                )}
                {isAccepted && rank && (
                  <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-extrabold text-accent-ink">#{rank}</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Current rank</p>
                  </div>
                )}
              </div>
            )}

            <p className="text-sm text-muted mb-6 leading-relaxed">{message}</p>

            <div className="flex gap-3">
              {appCheck.status_token && (
                <Link
                  to={`/status/${appCheck.status_token}`}
                  className={`flex-1 text-center ${theme.btn} text-white font-semibold rounded-xl py-3 text-sm transition-colors`}
                >
                  Track Status →
                </Link>
              )}
              <Link
                to="/candidate/dashboard"
                className="flex-1 text-center border border-slate-200 hover:border-slate-300 text-slate-600 font-semibold rounded-xl py-3 text-sm transition-colors"
              >
                My Applications
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal apply form ─────────────────────────────────────────────────────
  // Tailor feature is hidden for now; set to true to re-enable
  const TAILOR_ENABLED = false
  // Show tailor button when user has a profile resume and hasn't swapped to a different one
  const canTailor = TAILOR_ENABLED && !!(profile?.resume_filename) && !file && !selectedVaultId

  return (
    <div className="max-w-xl mx-auto px-4 py-12 animate-fade-in">
      <Link to={`/jobs/${jobId}`} className="text-sm text-accent-ink hover:underline mb-6 block">
        ← Back to job
      </Link>

      {job && (
        <div className="mb-8">
          <p className="text-muted text-sm">{job.company}</p>
          <h1 className="text-2xl font-extrabold text-navy-900">{job.title}</h1>
          <p className="text-muted text-sm mt-1">
            Min. match: {job.min_match_score}% · Pool: {job.active_applications}/{job.max_count}
          </p>
        </div>
      )}

      {loadingProfile ? (
        <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-brand-blue rounded-full animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-8 space-y-5">

            {/* Reapply warning */}
            {appCheck?.has_applied && !appCheck.same_resume && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-orange-800">
                  ⚠️ You've applied to this job before
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  Previous score: <span className="font-bold">{appCheck.previous_match_score}%</span>.
                  {' '}Make sure your resume better matches the role this time.
                </p>
              </div>
            )}

            {/* Profile summary */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-xs font-bold text-muted uppercase tracking-wide">Applying as</p>
              <ProfileRow icon="👤" label="Name" value={profile?.full_name ?? ''} />
              <ProfileRow icon="✉" label="Email" value={profile?.email ?? ''} />

              {profile?.phone ? (
                <ProfileRow icon="📱" label="Phone" value={profile.phone} />
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">📱</span>
                    <label className="text-xs font-semibold text-muted">Phone Number</label>
                    <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold rounded px-1.5 py-0.5 ml-1">Required</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent transition"
                  />
                  <p className="text-xs text-muted">Will be saved to your profile.</p>
                </div>
              )}

              {profile?.resume_filename && !file && !selectedVaultId && (
                <div className="flex items-start gap-2">
                  <span className="text-base mt-0.5 shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted font-medium">Resume</p>
                    <p className="text-sm text-slate-700 font-medium truncate">{profile.resume_filename}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {appCheck?.has_applied && (
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-semibold text-accent-ink border border-accent/30 rounded-lg px-3 py-1.5 hover:border-accent transition-colors">
                        Upload new
                      </button>
                    )}
                    {TAILOR_ENABLED && (tailorState === 'idle' || tailorState === 'blocked') && (
                      <button
                        type="button"
                        onClick={handleTailor}
                        className="text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg px-3 py-1.5 hover:border-violet-400 hover:bg-violet-50 transition-colors"
                      >
                        ✨ Tailor
                      </button>
                    )}
                    {TAILOR_ENABLED && tailorState === 'loading' && (
                      <span className="text-xs text-violet-500 flex items-center gap-1.5">
                        <span className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin block" />
                        Analysing fit…
                      </span>
                    )}
                    {TAILOR_ENABLED && tailorState === 'done' && (
                      <span className="text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                        ✨ Tailored
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tailor: blocked (incompatible roles or excessive drift) */}
            {TAILOR_ENABLED && tailorState === 'blocked' && tailorBlockedMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2 animate-fade-in">
                <div className="flex items-start gap-2">
                  <span className="text-red-400 text-base shrink-0 mt-0.5">🚫</span>
                  <div>
                    <p className="text-sm font-bold text-red-800">Tailoring not possible</p>
                    <p className="text-xs text-red-600 leading-relaxed mt-1">{tailorBlockedMsg}</p>
                  </div>
                </div>
                <p className="text-xs text-muted italic">
                  Your original resume is the most honest representation of your background.
                </p>
              </div>
            )}

            {/* Tailor preview panel (success) */}
            {TAILOR_ENABLED && tailorState === 'done' && canTailor && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-violet-500 text-base">✨</span>
                  <p className="text-sm font-bold text-violet-800">AI-tailored for this role</p>
                  <span className="ml-auto text-[10px] bg-violet-100 text-violet-600 font-semibold rounded px-2 py-0.5">No fabrication</span>
                </div>

                {/* Fit score + feasibility row */}
                {(tailorFitScore !== null || tailorFeasibility) && (
                  <div className="flex items-center gap-3">
                    {tailorFitScore !== null && (
                      <div className="flex items-center gap-1.5 bg-white border border-violet-100 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-muted font-medium">Genuine fit</span>
                        <span className={`text-sm font-extrabold ${
                          tailorFitScore >= 60 ? 'text-emerald-600'
                          : tailorFitScore >= 40 ? 'text-amber-600'
                          : 'text-red-500'
                        }`}>{tailorFitScore}%</span>
                      </div>
                    )}
                    {tailorFeasibility && (
                      <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-2 py-1 ${
                        tailorFeasibility === 'high' ? 'bg-emerald-100 text-emerald-700'
                        : tailorFeasibility === 'medium' ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-600'
                      }`}>
                        {tailorFeasibility} tailoring potential
                      </span>
                    )}
                  </div>
                )}

                {tailorChanges.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">What changed</p>
                    {tailorChanges.map((change, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                        <p className="text-xs text-violet-700 leading-relaxed">{change}</p>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowFullTailored(v => !v)}
                  className="text-xs text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2"
                >
                  {showFullTailored ? 'Hide full resume ↑' : 'Preview full resume ↓'}
                </button>

                {showFullTailored && tailoredText && (
                  <pre className="text-xs text-slate-600 bg-white border border-violet-100 rounded-lg p-3 max-h-52 overflow-y-auto whitespace-pre-wrap font-sans leading-relaxed">
                    {tailoredText}
                  </pre>
                )}

                {/* Toggle: tailored vs original */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setUseTailored(true)}
                    className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                      useTailored
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'border-violet-300 text-violet-600 hover:bg-violet-100'
                    }`}
                  >
                    {useTailored ? '✓ Using tailored' : 'Use tailored version'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseTailored(false)}
                    className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                      !useTailored
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'border-slate-300 text-muted hover:bg-slate-50'
                    }`}
                  >
                    {!useTailored ? '✓ Using original' : 'Keep original'}
                  </button>
                </div>
              </div>
            )}

            {/* Resume upload when no profile resume */}
            {!profile?.resume_filename && (
              <ResumeDropzone file={file} dragOver={dragOver} setDragOver={setDragOver} onFile={handleFileChange} fileInputRef={fileInputRef} label="Resume" required note="No resume on your profile yet — it will be saved after upload." />
            )}

            {/* File selected indicator (reapply) */}
            {file && profile?.resume_filename && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <span className="text-emerald-500 text-lg">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{file.name}</p>
                  <p className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button type="button" onClick={() => setFile(null)} className="text-xs text-muted hover:text-red-500">Remove</button>
              </div>
            )}

            {/* Reapply confirmation checkbox */}
            {appCheck?.has_applied && !appCheck.same_resume && file && (
              <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${reapplyConfirmed ? 'border-accent bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="checkbox" checked={reapplyConfirmed} onChange={e => setReapplyConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-blue shrink-0" />
                <span className="text-sm text-slate-700">
                  <span className="font-semibold text-ink">I confirm this resume is an improvement</span> — it better highlights the skills and experience required for this role.
                </span>
              </label>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting || (appCheck?.has_applied && !appCheck.same_resume && !!file && !reapplyConfirmed)}
              className="w-full bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition-colors"
            >
              {appCheck?.has_applied ? 'Resubmit Application' : 'Submit Application'}
            </button>

            <p className="text-xs text-muted text-center">
              Our AI will score your resume instantly against the job description.
              {TAILOR_ENABLED && useTailored && tailoredText && (
                <span className="text-violet-500"> Sending tailored version.</span>
              )}
            </p>

            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={e => handleFileChange(e.target.files?.[0])} />
          </div>
        </form>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResumeDropzone({ file, dragOver, setDragOver, onFile, fileInputRef, label, required, note }: {
  file: File | null; dragOver: boolean; setDragOver: (v: boolean) => void
  onFile: (f: File | undefined) => void; fileInputRef: React.RefObject<HTMLInputElement>
  label: string; required?: boolean; note?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        {required && <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold rounded px-1.5 py-0.5">Required</span>}
      </div>
      {note && <p className="text-xs text-muted mb-2">{note}</p>}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0]) }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-accent bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-accent hover:bg-blue-50/30'
        }`}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        {file ? (
          <div className="text-emerald-600">
            <p className="text-2xl mb-1">✓</p>
            <p className="font-semibold text-sm">{file.name}</p>
            <p className="text-xs mt-0.5 text-emerald-500">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        ) : (
          <div className="text-muted">
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm font-medium">Drop your resume or <span className="text-accent-ink">browse</span></p>
            <p className="text-xs mt-1">PDF, DOCX, or TXT · Max 10MB</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-muted font-medium">{label}</p>
        <p className="text-sm text-slate-700 font-medium">{value}</p>
      </div>
    </div>
  )
}
