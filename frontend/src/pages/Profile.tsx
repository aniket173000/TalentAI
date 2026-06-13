import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { CareerProfile, CareerUpgradeArea, UserProfile, VaultResume } from '../types'

// ── Career sub-components (read-only) ────────────────────────────────────────

function UpgradeAreaCard({ area, index }: { area: CareerUpgradeArea; index: number }) {
  const [open, setOpen] = useState(index === 0)
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <span className="font-semibold text-slate-800 text-sm">{area.area}</span>
        </div>
        <span className="text-slate-400 text-sm ml-2 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-3 bg-slate-50 border-t border-slate-100 space-y-3">
          <p className="text-xs text-slate-500 italic leading-relaxed">{area.why}</p>
          <ul className="space-y-2">
            {area.sub_skills.map((skill, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {skill}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function CareerInsightsDisplay({ profile }: { profile: CareerProfile }) {
  return (
    <div className="space-y-5">
      {/* Level progression banner */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-5 flex items-center gap-5">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-1">Current Level</p>
          <p className="font-bold text-lg leading-tight truncate">{profile.detected_level_label}</p>
          {profile.detected_role && (
            <p className="text-sm text-indigo-200 mt-0.5 truncate">{profile.detected_role}</p>
          )}
        </div>
        <div className="text-2xl font-bold text-white/50 shrink-0">→</div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-1">Next Level</p>
          <p className="font-bold text-lg leading-tight truncate">{profile.next_level_label}</p>
          <p className="text-sm text-indigo-200 mt-0.5">Your target</p>
        </div>
      </div>

      {/* Summary */}
      {profile.summary && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-600 leading-relaxed">{profile.summary}</p>
        </div>
      )}

      {/* Strengths + Weaknesses */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-2xl border border-emerald-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center">✓</span>
            <h3 className="font-bold text-emerald-700 text-sm uppercase tracking-wide">Your Strengths</h3>
          </div>
          <ul className="space-y-2.5">
            {profile.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-2xl border border-red-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs font-bold flex items-center justify-center">!</span>
            <h3 className="font-bold text-red-600 text-sm uppercase tracking-wide">Gaps to Address</h3>
          </div>
          <ul className="space-y-2.5">
            {profile.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Upgrade path */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🚀</span>
          <h3 className="font-bold text-slate-800">Skills to reach {profile.next_level_label}</h3>
        </div>
        <div className="space-y-2">
          {profile.upgrade_path.map((area, i) => (
            <UpgradeAreaCard key={i} area={area} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const { user: authUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Personal info edit state
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Resume upload state
  const [uploadingResume, setUploadingResume] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  // Vault actions
  const [vaultActionId, setVaultActionId] = useState<number | null>(null)

  // Career analysis state
  const [analysing, setAnalysing] = useState(false)
  const [analyseMsg, setAnalyseMsg] = useState<string | null>(null)

  useEffect(() => {
    api.get<UserProfile>('/profile/me')
      .then(r => {
        setProfile(r.data)
        setName(r.data.full_name)
        setPhone(r.data.phone ?? '')
        setCompany(r.data.company ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const r = await api.patch<UserProfile>('/profile/me', {
        full_name: name.trim() || undefined,
        phone: phone.trim() || null,
        company: company.trim() || null,
      })
      setProfile(r.data)
      setEditing(false)
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleFileChosen = async (file: File | null) => {
    if (!file) return
    setUploadingResume(true)
    setResumeError(null)
    const fd = new FormData()
    fd.append('resume_file', file)
    try {
      const r = await api.post<UserProfile>('/profile/resume', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setProfile(r.data)  // career_profile will be null — triggers state 2
    } catch {
      setResumeError('Could not parse this file. Please upload a PDF, DOCX, or TXT.')
    } finally {
      setUploadingResume(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAnalyse = async () => {
    setAnalysing(true)
    setAnalyseMsg(null)
    try {
      await api.post('/profile/refresh-career')
      setAnalyseMsg('Analysing your resume — results in ~15 seconds…')
      // Poll once after 15 s
      setTimeout(async () => {
        try {
          const r = await api.get<UserProfile>('/profile/me')
          setProfile(r.data)
        } catch {}
        setAnalysing(false)
        setAnalyseMsg(null)
      }, 15000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAnalyseMsg(typeof detail === 'string' ? detail : 'Analysis failed. Try again.')
      setAnalysing(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-500">
        Could not load your profile.
      </div>
    )
  }

  const initials = profile.full_name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  const isCandidate = profile.role === 'candidate'

  // Resume states
  const hasResume = !!profile.resume_filename
  const isAnalysed = !!profile.career_profile

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        className="hidden"
        onChange={e => handleFileChosen(e.target.files?.[0] ?? null)}
      />

      {/* ── 1. Personal info card ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand-blue to-indigo-600" />
        <div className="px-6 pb-6">
          <div className="-mt-10 mb-4 flex items-end justify-between">
            <div className="w-20 h-20 rounded-2xl bg-white border-4 border-white shadow-md flex items-center justify-center text-2xl font-extrabold text-brand-blue">
              {initials}
            </div>
            {!editing && (
              <button
                onClick={() => { setEditing(true); setSaveError(null) }}
                className="text-sm font-semibold text-brand-blue hover:text-blue-700 border border-brand-blue/30 hover:border-brand-blue rounded-xl px-4 py-1.5 transition-colors"
              >
                Edit Profile
              </button>
            )}
          </div>

          {!editing ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900">{profile.full_name}</h1>
                {profile.linkedin_verified && (
                  <span title="LinkedIn verified" className="text-blue-600 font-bold text-sm border border-blue-300 rounded px-1">in</span>
                )}
              </div>
              <p className="text-slate-500 text-sm capitalize">{profile.role}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoRow icon="✉" label="Email" value={profile.email} />
                <InfoRow icon="📱" label="Phone" value={profile.phone ?? '—'} />
                <InfoRow icon="🏢" label="Company" value={profile.company ?? '—'} />
                <InfoRow icon="🗓" label="Member since" value={
                  profile.created_at
                    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : '—'
                } />
              </div>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <Field label="Full Name">
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition" />
              </Field>
              <Field label="Phone Number">
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition" />
              </Field>
              <Field label="Current Company">
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition" />
              </Field>
              <p className="text-xs text-slate-400">Email cannot be changed after registration.</p>
              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setEditing(false); setName(profile.full_name); setPhone(profile.phone ?? ''); setCompany(profile.company ?? '') }}
                  className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-xl py-2.5 text-sm hover:bg-slate-50 transition">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !name.trim()}
                  className="flex-1 bg-brand-blue hover:bg-blue-600 text-white font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Resume section (candidates only) ───────────────────────────── */}
      {isCandidate && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Active Resume</h2>
            {profile.resumes.length > 0 && (
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">
                {profile.resumes.length}/{3} in vault
              </span>
            )}
          </div>

          {/* ── State 1: No resume ── */}
          {!hasResume && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingResume}
              className="w-full rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-blue hover:bg-blue-50/40 transition-colors p-10 text-center group"
            >
              {uploadingResume ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-7 h-7 border-2 border-slate-300 border-t-brand-blue rounded-full animate-spin" />
                  <p className="text-sm text-slate-500">Uploading…</p>
                </div>
              ) : (
                <>
                  <p className="text-4xl mb-3 group-hover:scale-110 transition-transform">📄</p>
                  <p className="font-semibold text-slate-700 group-hover:text-brand-blue transition-colors">
                    Upload your resume
                  </p>
                  <p className="text-xs text-slate-400 mt-1">PDF, DOCX, or TXT · Click to browse</p>
                  <p className="text-xs text-indigo-500 mt-2 font-medium">
                    Enables Career Insights and Magic Match
                  </p>
                </>
              )}
            </button>
          )}

          {/* ── State 2 & 3: Resume on file ── */}
          {hasResume && (
            <div className="space-y-4">
              {/* Resume file row */}
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                <span className="text-2xl shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{profile.resume_filename}</p>
                  {isAnalysed && profile.career_profile_updated_at && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Analysed {new Date(profile.career_profile_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  {!isAnalysed && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">Not yet analysed</p>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingResume}
                  className="shrink-0 text-xs font-semibold text-slate-500 hover:text-brand-blue border border-slate-200 hover:border-brand-blue rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                >
                  {uploadingResume ? 'Uploading…' : 'Replace'}
                </button>
              </div>

              {/* State 2: not analysed → prominent CTA */}
              {!isAnalysed && !analysing && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Resume ready for analysis</p>
                    <p className="text-xs text-amber-600 mt-0.5">Get your strengths, gaps, and career upgrade plan</p>
                  </div>
                  <button
                    onClick={handleAnalyse}
                    className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors"
                  >
                    ✨ Analyse Resume
                  </button>
                </div>
              )}

              {/* Analysing in-progress */}
              {analysing && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                  <p className="text-sm text-indigo-700 font-medium">
                    {analyseMsg ?? 'Analysing your resume…'}
                  </p>
                </div>
              )}

              {/* State 3: analysed → subtle re-analyse option */}
              {isAnalysed && !analysing && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Analysis is up to date with your current resume.</p>
                  <button
                    onClick={handleAnalyse}
                    className="text-xs font-semibold text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    ↻ Re-analyse
                  </button>
                </div>
              )}

              {/* Analysis error */}
              {!analysing && analyseMsg && (
                <p className="text-xs text-red-500">{analyseMsg}</p>
              )}
            </div>
          )}

          {resumeError && (
            <p className="text-xs text-red-500">{resumeError}</p>
          )}
        </div>
      )}

      {/* ── 3. Resume Vault (candidates only) ────────────────────────────── */}
      {isCandidate && profile.resumes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Resume Vault</h2>
              <p className="text-xs text-slate-400 mt-0.5">Up to 3 versions saved — switch anytime</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`w-2 h-2 rounded-full ${profile.resumes.length >= 3 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {profile.resumes.length}/3 slots used
            </div>
          </div>

          <div className="space-y-2">
            {profile.resumes.map((r: VaultResume) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  r.is_primary
                    ? 'border-brand-blue/40 bg-blue-50/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <span className="text-lg shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.filename}</p>
                    {r.is_primary && (
                      <span className="text-[10px] font-bold bg-brand-blue text-white rounded-full px-2 py-0.5 shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(r.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!r.is_primary && (
                    <button
                      disabled={vaultActionId === r.id}
                      onClick={async () => {
                        setVaultActionId(r.id)
                        try {
                          const res = await api.post<UserProfile>(`/profile/resumes/${r.id}/set-active`)
                          setProfile(res.data)
                        } catch {}
                        setVaultActionId(null)
                      }}
                      className="text-xs font-semibold text-brand-blue hover:text-blue-700 border border-brand-blue/30 hover:border-brand-blue rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                    >
                      {vaultActionId === r.id ? '…' : 'Set active'}
                    </button>
                  )}
                  <button
                    disabled={vaultActionId === r.id}
                    onClick={async () => {
                      if (!confirm(`Delete "${r.filename}" from your vault?`)) return
                      setVaultActionId(r.id)
                      try {
                        const res = await api.delete<UserProfile>(`/profile/resumes/${r.id}`)
                        setProfile(res.data)
                      } catch {}
                      setVaultActionId(null)
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {profile.resumes.length < 3 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingResume}
              className="w-full rounded-xl border border-dashed border-slate-300 hover:border-brand-blue hover:bg-blue-50/30 transition-colors py-3 text-sm text-slate-500 hover:text-brand-blue font-medium"
            >
              {uploadingResume ? 'Uploading…' : '+ Add another resume version'}
            </button>
          )}
          {profile.resumes.length >= 3 && (
            <p className="text-xs text-amber-600 text-center">
              Vault is full (3/3). Delete an old version to add a new one.
            </p>
          )}
        </div>
      )}

      {/* ── 4. Career insights (candidates only, shown when analysed) ─────── */}
      {isCandidate && isAnalysed && profile.career_profile && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-slate-900">Career Insights</h2>
            {profile.career_profile_updated_at && (
              <p className="text-xs text-slate-400">
                Last analysed {new Date(profile.career_profile_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
          <CareerInsightsDisplay profile={profile.career_profile} />
        </div>
      )}
    </div>
  )
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm text-slate-700 font-medium">{value}</p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}
