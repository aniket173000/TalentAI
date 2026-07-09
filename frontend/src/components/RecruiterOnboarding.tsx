import { useState } from 'react'
import api from '../api/client'

interface Props {
  onComplete: () => void
  onSkip: () => void
}

export default function RecruiterOnboarding({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0)

  // Company step
  const [company, setCompany] = useState('')
  const [isThirdParty, setIsThirdParty] = useState<boolean | null>(null)
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyError, setCompanyError] = useState('')

  // Resume step (compulsory — no skip here)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUploading, setResumeUploading] = useState(false)
  const [resumeError, setResumeError] = useState('')
  const [resumeDragging, setResumeDragging] = useState(false)

  const handleCompanySubmit = async () => {
    setCompanyError('')
    if (!company.trim() && isThirdParty === null) { setStep(2); return }
    setSavingCompany(true)
    try {
      await api.patch('/profile/recruiter', {
        company: company.trim() || null,
        is_third_party: isThirdParty ?? false,
      })
      setStep(2)
    } catch {
      setCompanyError('Something went wrong. Please try again.')
    } finally {
      setSavingCompany(false)
    }
  }

  const handleResumeUpload = async () => {
    if (!resumeFile) { setResumeError('Please choose a resume file to continue.'); return }
    setResumeUploading(true)
    setResumeError('')
    try {
      const form = new FormData()
      form.append('resume_file', resumeFile)
      await api.post('/profile/resume', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setStep(3)
      setTimeout(onComplete, 2000)
    } catch {
      setResumeError('Upload failed — check the file and try again.')
    } finally {
      setResumeUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(12px)' }}>

      <div className="relative w-full max-w-lg" style={{ animation: 'slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(40px) scale(0.95); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes pop {
            0%  { transform: scale(1); }
            50% { transform: scale(1.15); }
            100%{ transform: scale(1); }
          }
          @keyframes float {
            0%,100% { transform: translateY(0); }
            50%     { transform: translateY(-8px); }
          }
          @keyframes confetti-fall {
            0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(80px) rotate(720deg); opacity: 0; }
          }
        `}</style>

        {/* Skip — only offered before the compulsory resume step */}
        {step < 2 && (
          <button onClick={onSkip} className="absolute -top-10 right-0 text-slate-400 hover:text-white text-xs font-medium transition-colors">
            Skip for now ↗
          </button>
        )}

        {/* Progress bar */}
        {step < 3 && (
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1, 2].map(i => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-violet-400' : i < step ? 'w-4 bg-emerald-400' : 'w-4 bg-slate-600'
              }`} />
            ))}
          </div>
        )}

        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl border border-slate-700 overflow-hidden shadow-2xl shadow-violet-900/30">

          {/* ── Step 0: Intro ─────────────────────────────────────────────── */}
          {step === 0 && (
            <div className="p-8 text-center">
              <div className="text-6xl mb-4" style={{ animation: 'float 3s ease-in-out infinite' }}>💼</div>
              <h2 className="text-2xl font-black text-white mb-2">let's set up your recruiter profile!</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Takes 30 seconds. Tell us about your company, and add your resume so candidates and your team can see who you are.
              </p>
              <div className="flex flex-wrap gap-3 justify-center mb-8">
                {['🏢 Company Profile', '📄 Your Resume', '🤝 Trusted Hiring'].map(tag => (
                  <span key={tag} className="text-xs font-bold px-3 py-1.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">{tag}</span>
                ))}
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full py-3.5 rounded-2xl font-black text-white text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 shadow-lg shadow-violet-700/40 transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                let's go ✨
              </button>
              <button onClick={onSkip} className="mt-3 w-full py-2.5 rounded-2xl text-slate-500 text-xs font-medium hover:text-slate-300 transition-colors">
                maybe later
              </button>
            </div>
          )}

          {/* ── Step 1: Company ───────────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-8">
              <div className="text-4xl mb-3 text-center">🏢</div>
              <h2 className="text-xl font-black text-white text-center mb-1">who are you hiring for?</h2>
              <p className="text-slate-500 text-xs text-center mb-6">optional — you can add or change this later</p>

              <div className="mb-5">
                <label className="block text-slate-500 text-xs mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-slate-800 border border-slate-600 rounded-2xl px-5 py-3.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                />
              </div>

              <div className="mb-5">
                <label className="block text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wide">Hiring as</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { val: false, emoji: '🏠', label: 'In-house', sub: 'hiring for my own company' },
                    { val: true,  emoji: '🤝', label: 'Third-party', sub: 'agency / staffing firm' },
                  ] as const).map(opt => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => setIsThirdParty(opt.val)}
                      className={`rounded-2xl border-2 p-4 text-center transition-all duration-200 ${
                        isThirdParty === opt.val
                          ? 'border-violet-500 bg-violet-500/20 shadow-lg shadow-violet-500/20'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="text-3xl mb-1.5" style={isThirdParty === opt.val ? { animation: 'pop 0.3s ease' } : {}}>
                        {opt.emoji}
                      </div>
                      <p className="text-white text-xs font-bold">{opt.label}</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {companyError && <p className="text-red-400 text-xs mb-3">{companyError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-2xl border border-slate-600 text-slate-400 text-sm font-semibold hover:border-slate-400 hover:text-white transition-all">
                  ← back
                </button>
                <button
                  onClick={handleCompanySubmit}
                  disabled={savingCompany}
                  className="flex-[2] py-3 rounded-2xl font-black text-white text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-50 shadow-lg shadow-violet-700/40 transition-all hover:scale-[1.02] active:scale-95"
                >
                  {savingCompany ? 'saving…' : 'next →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Resume (compulsory) ──────────────────────────────── */}
          {step === 2 && (
            <div className="p-8">
              <div className="text-4xl mb-3 text-center">📄</div>
              <h2 className="text-xl font-black text-white text-center mb-1">add your resume</h2>
              <p className="text-slate-500 text-xs text-center mb-6">PDF, DOCX or TXT · max 10 MB — required to complete your profile</p>

              {/* Drop zone */}
              <label
                className={`relative flex flex-col items-center justify-center w-full h-36 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                  resumeDragging
                    ? 'border-violet-400 bg-violet-500/10'
                    : resumeFile
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-800/50 hover:border-violet-500 hover:bg-violet-500/5'
                }`}
                onDragOver={e => { e.preventDefault(); setResumeDragging(true) }}
                onDragLeave={() => setResumeDragging(false)}
                onDrop={e => {
                  e.preventDefault(); setResumeDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f) { setResumeFile(f); setResumeError('') }
                }}
              >
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setResumeFile(f); setResumeError('') }
                  }}
                />
                {resumeFile ? (
                  <>
                    <span className="text-3xl mb-2">✅</span>
                    <p className="text-emerald-400 text-sm font-bold truncate max-w-[260px]">{resumeFile.name}</p>
                    <p className="text-slate-500 text-xs mt-1">click to change</p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl mb-2">📁</span>
                    <p className="text-slate-300 text-sm font-semibold">drag & drop or click to browse</p>
                    <p className="text-slate-600 text-xs mt-1">PDF · DOCX · TXT</p>
                  </>
                )}
              </label>

              {resumeError && <p className="text-red-400 text-xs mt-2">{resumeError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleResumeUpload}
                  disabled={!resumeFile || resumeUploading}
                  className="w-full py-3 rounded-2xl font-black text-white text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-50 shadow-lg shadow-violet-700/40 transition-all hover:scale-[1.02] active:scale-95"
                >
                  {resumeUploading ? 'uploading…' : 'upload resume 🚀'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Success ───────────────────────────────────────────── */}
          {step === 3 && (
            <div className="p-8 text-center relative overflow-hidden">
              {['🎊', '✨', '🎉', '💫', '🌟', '🎈'].map((e, i) => (
                <span key={i} className="absolute text-2xl pointer-events-none" style={{
                  left: `${10 + i * 15}%`, top: '-10px',
                  animation: `confetti-fall ${1 + i * 0.2}s ease-out forwards`,
                  animationDelay: `${i * 0.1}s`,
                }}>{e}</span>
              ))}
              <div className="text-6xl mb-4" style={{ animation: 'pop 0.5s ease' }}>💼</div>
              <h2 className="text-2xl font-black text-white mb-2">you're all set!</h2>
              <p className="text-slate-400 text-sm mb-2">Your recruiter profile is ready to go.</p>
              <p className="text-slate-500 text-xs">Redirecting…</p>
              <div className="mt-4 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
                  style={{ animation: 'progressBar 2s linear forwards' }}>
                  <style>{`@keyframes progressBar { from { width: 0% } to { width: 100% } }`}</style>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
