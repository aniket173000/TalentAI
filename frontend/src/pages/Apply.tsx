import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Job, UserProfile, VaultResume } from '../types'

interface AppCheck {
  has_applied: boolean
  same_resume: boolean
  previous_match_score: number | null
  usable_vault_ids: number[]
}

export default function Apply() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [job, setJob] = useState<Job | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [appCheck, setAppCheck] = useState<AppCheck | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Fields only shown when missing from profile
  const [phone, setPhone] = useState('')

  // Resume selection
  const [file, setFile] = useState<File | null>(null)
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [reapplyConfirmed, setReapplyConfirmed] = useState(false)

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

  const handleFileChange = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setSelectedVaultId(null)
    setReapplyConfirmed(false)
  }

  const handleVaultSelect = (id: number) => {
    setSelectedVaultId(id === selectedVaultId ? null : id)
    setFile(null)
    setReapplyConfirmed(false)
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

      let res
      if (file) {
        const fd = new FormData()
        fd.append('resume_file', file)
        res = await api.post(url, fd)
      } else if (selectedVaultId) {
        const fd = new FormData()
        fd.append('resume_id', String(selectedVaultId))
        res = await api.post(url, fd)
      } else {
        res = await api.post(url)
      }

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

  // ── Blocked state: same resume already applied ────────────────────────────
  const isBlocked = !loadingProfile && appCheck?.has_applied && appCheck.same_resume
  const usableVault = profile?.resumes.filter(r => appCheck?.usable_vault_ids.includes(r.id)) ?? []
  const canVaultReapply = usableVault.length > 0

  if (isBlocked) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-fade-in">
        <Link to={`/jobs/${jobId}`} className="text-sm text-brand-blue hover:underline mb-8 block">
          ← Back to job
        </Link>

        {job && (
          <div className="mb-6">
            <p className="text-slate-400 text-sm font-medium">{job.company}</p>
            <h1 className="text-2xl font-extrabold text-slate-900">{job.title}</h1>
          </div>
        )}

        {/* Hero card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-4">
          <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-400" />
          <div className="p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-2xl shrink-0">
                💡
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg leading-tight">
                  Your resume is ready — but it's the same one you used before
                </h2>
                {appCheck.previous_match_score !== null && (
                  <p className="text-sm text-slate-500 mt-1">
                    Previous match score:{' '}
                    <span className={`font-bold ${appCheck.previous_match_score >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {appCheck.previous_match_score}%
                    </span>
                  </p>
                )}
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              To give yourself the best shot at this role, tailor your resume to highlight the skills
              and experience this job is looking for. A targeted resume consistently scores higher.
            </p>

            {/* Tips */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2.5 mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Quick wins to improve your score</p>
              <TipRow n={1} text={`Mirror keywords from the "${job?.title}" job description in your resume.`} />
              <TipRow n={2} text={'Add measurable results (e.g. "reduced load time by 40%") instead of responsibilities.'} />
              <TipRow n={3} text="Move your most relevant skills and experience to the top of each section." />
            </div>

            {/* Options */}
            {canVaultReapply ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Apply with a different resume from your vault</p>
                {usableVault.map(r => (
                  <VaultResumeCard
                    key={r.id}
                    resume={r}
                    selected={selectedVaultId === r.id}
                    onSelect={() => handleVaultSelect(r.id)}
                  />
                ))}

                {selectedVaultId && (
                  <button
                    onClick={handleSubmit as unknown as React.MouseEventHandler}
                    disabled={submitting}
                    className="w-full bg-brand-blue hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
                  >
                    Apply with selected resume
                  </button>
                )}

                <div className="relative flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 shrink-0">or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              </div>
            ) : null}

            <div className="flex gap-3">
              <Link
                to="/profile"
                className="flex-1 text-center bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-sm"
              >
                Update Resume in Profile
              </Link>
              {(profile?.resumes.length ?? 0) < 3 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 text-center border border-slate-300 hover:border-brand-blue text-slate-700 hover:text-brand-blue font-semibold rounded-xl py-3 text-sm transition-colors"
                >
                  Upload New Here
                </button>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-500 mt-3 text-center">{error}</p>
            )}
          </div>
        </div>

        {/* Hidden upload for "Upload New Here" on blocked page */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
          onChange={e => {
            handleFileChange(e.target.files?.[0])
            // If user picks a file here, scroll/show the form
          }}
        />

        {/* Show inline form if user picked a new file from the blocked page */}
        {file && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <span className="text-emerald-500 text-lg">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
            </div>

            <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${reapplyConfirmed ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="checkbox" checked={reapplyConfirmed} onChange={e => setReapplyConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-blue shrink-0" />
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-800">I confirm this resume is tailored to this role</span> and better highlights the required skills and experience.
              </span>
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleSubmit as unknown as React.MouseEventHandler}
              disabled={!reapplyConfirmed || submitting}
              className="w-full bg-brand-blue hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-colors"
            >
              Resubmit Application
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Normal apply form ─────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto px-4 py-12 animate-fade-in">
      <Link to={`/jobs/${jobId}`} className="text-sm text-brand-blue hover:underline mb-6 block">
        ← Back to job
      </Link>

      {job && (
        <div className="mb-8">
          <p className="text-slate-500 text-sm">{job.company}</p>
          <h1 className="text-2xl font-extrabold text-navy-900">{job.title}</h1>
          <p className="text-slate-400 text-sm mt-1">
            Min. match: {job.min_match_score}% · Pool: {job.active_applications}/{job.max_count}
          </p>
        </div>
      )}

      {loadingProfile ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-brand-blue rounded-full animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-8 space-y-5">

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
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Applying as</p>
            <ProfileRow icon="👤" label="Name" value={profile?.full_name ?? ''} />
            <ProfileRow icon="✉" label="Email" value={profile?.email ?? ''} />

            {profile?.phone ? (
              <ProfileRow icon="📱" label="Phone" value={profile.phone} />
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">📱</span>
                  <label className="text-xs font-semibold text-slate-500">Phone Number</label>
                  <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold rounded px-1.5 py-0.5 ml-1">Required</span>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                />
                <p className="text-xs text-slate-400">Will be saved to your profile.</p>
              </div>
            )}

            {profile?.resume_filename && !file && !selectedVaultId && (
              <div className="flex items-start gap-2">
                <span className="text-base mt-0.5 shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 font-medium">Resume</p>
                  <p className="text-sm text-slate-700 font-medium truncate">{profile.resume_filename}</p>
                </div>
                {appCheck?.has_applied && (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="shrink-0 text-xs font-semibold text-brand-blue border border-brand-blue/30 rounded-lg px-3 py-1.5 hover:border-brand-blue transition-colors">
                    Upload new
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Resume upload when no profile resume */}
          {!profile?.resume_filename && (
            <ResumeDropzone file={file} dragOver={dragOver} setDragOver={setDragOver} onFile={handleFileChange} fileInputRef={fileInputRef} label="Resume" required note="No resume on your profile yet — it will be saved after upload." />
          )}

          {/* File selected indicator (reapply) */}
          {file && profile?.resume_filename && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <span className="text-emerald-500 text-lg">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
            </div>
          )}

          {/* Reapply confirmation checkbox */}
          {appCheck?.has_applied && !appCheck.same_resume && file && (
            <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${reapplyConfirmed ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="checkbox" checked={reapplyConfirmed} onChange={e => setReapplyConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-blue shrink-0" />
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-800">I confirm this resume is an improvement</span> — it better highlights the skills and experience required for this role.
              </span>
            </label>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting || (appCheck?.has_applied && !appCheck.same_resume && !!file && !reapplyConfirmed)}
            className="w-full bg-brand-blue hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition-colors"
          >
            {appCheck?.has_applied ? 'Resubmit Application' : 'Submit Application'}
          </button>

          <p className="text-xs text-slate-400 text-center">
            Our AI will score your resume instantly against the job description.
          </p>

          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={e => handleFileChange(e.target.files?.[0])} />
        </form>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TipRow({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <p className="text-sm text-slate-600 leading-snug">{text}</p>
    </div>
  )
}

function VaultResumeCard({ resume, selected, onSelect }: { resume: VaultResume; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
        selected
          ? 'border-brand-blue bg-blue-50 shadow-sm'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <span className="text-lg shrink-0">📄</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{resume.filename}</p>
        <p className="text-xs text-slate-400">
          Added {new Date(resume.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
      <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-brand-blue bg-brand-blue' : 'border-slate-300'}`}>
        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
    </button>
  )
}

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
      {note && <p className="text-xs text-slate-400 mb-2">{note}</p>}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0]) }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-brand-blue bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-brand-blue hover:bg-blue-50/30'
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
          <div className="text-slate-400">
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm font-medium">Drop your resume or <span className="text-brand-blue">browse</span></p>
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
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm text-slate-700 font-medium">{value}</p>
      </div>
    </div>
  )
}
