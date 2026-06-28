import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { resolveCanonicalName, searchLocalColleges } from '../data/colleges'

interface Props {
  onComplete: () => void
  onSkip: () => void
}

const CURRENT_YEAR = new Date().getFullYear()
const FUTURE_YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR + i)       // current student
const PAST_YEARS   = Array.from({ length: CURRENT_YEAR - 1999 }, (_, i) => CURRENT_YEAR - i)  // graduated (back to 2000)

export default function CandidateOnboarding({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0)
  const [collegeName, setCollegeName] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isGraduated, setIsGraduated] = useState<boolean | null>(null)
  const [gradYear, setGradYear] = useState<number | null>(null)

  // Logo resolution state (first from college only)
  const [collegeUrl, setCollegeUrl] = useState('')
  const [resolvedLogo, setResolvedLogo] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [logoErr, setLogoErr] = useState(false)
  const [isFirstFromCollege, setIsFirstFromCollege] = useState(false)

  // Candidate profile fields
  const [candidateLinkedIn, setCandidateLinkedIn] = useState('')
  const [currentCompany, setCurrentCompany] = useState('')
  const [phone, setPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiSearching, setAiSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Resume upload state
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUploading, setResumeUploading] = useState(false)
  const [resumeError, setResumeError] = useState('')
  const [resumeDragging, setResumeDragging] = useState(false)

  useEffect(() => {
    if (step === 1) inputRef.current?.focus()
  }, [step])

  // Autocomplete: local DB (instant) → backend DB → AI fallback
  useEffect(() => {
    const local = searchLocalColleges(collegeName)
    if (!collegeName.trim()) {
      setSuggestions(local)
      return
    }
    // Show local results immediately (no delay)
    setSuggestions(local)

    const controller = new AbortController()
    // Merge in DB results after 250ms
    const dbTimer = setTimeout(() => {
      api
        .get<{ colleges: string[] }>(`/colleges/search?q=${encodeURIComponent(collegeName)}`, { signal: controller.signal })
        .then(r => {
          setSuggestions(prev => [...new Set([...prev, ...r.data.colleges])].slice(0, 12))
        })
        .catch(() => {})
    }, 250)

    // AI fallback after 800ms only when local list returns <3 results
    let aiTimer: ReturnType<typeof setTimeout> | null = null
    if (local.length < 3) {
      aiTimer = setTimeout(() => {
        setAiSearching(true)
        api
          .get<{ colleges: string[] }>(`/colleges/ai-search?q=${encodeURIComponent(collegeName)}`, { signal: controller.signal })
          .then(r => {
            if (r.data.colleges.length > 0) {
              setSuggestions(prev => [...new Set([...prev, ...r.data.colleges])].slice(0, 12))
            }
          })
          .catch(() => {})
          .finally(() => setAiSearching(false))
      }, 800)
    }

    return () => {
      clearTimeout(dbTimer)
      if (aiTimer) clearTimeout(aiTimer)
      controller.abort()
      setAiSearching(false)
    }
  }, [collegeName])

  // Check if first from this college (to show logo section)
  useEffect(() => {
    if (!collegeName.trim()) { setIsFirstFromCollege(false); return }
    const timer = setTimeout(() => {
      api
        .get<{ colleges: string[] }>(`/colleges/search?q=${encodeURIComponent(collegeName)}`)
        .then(r => {
          const exact = r.data.colleges.find(c => c.toLowerCase() === collegeName.toLowerCase())
          setIsFirstFromCollege(!exact)
        })
        .catch(() => setIsFirstFromCollege(false))
    }, 400)
    return () => clearTimeout(timer)
  }, [collegeName])

  // Live logo resolution from website/LinkedIn URL
  useEffect(() => {
    const url = collegeUrl.trim()
    if (!url) { setResolvedLogo(null); return }

    setResolving(true)
    setLogoErr(false)
    const timer = setTimeout(() => {
      api
        .post<{ logo_url: string | null }>('/colleges/resolve-logo', { url })
        .then(r => {
          setResolvedLogo(r.data.logo_url)
          setResolving(false)
        })
        .catch(() => { setResolvedLogo(null); setResolving(false) })
    }, 700)
    return () => clearTimeout(timer)
  }, [collegeUrl])

  const handleSubmit = async () => {
    if (!collegeName.trim()) { setError('Please enter your college name.'); return }
    if (isGraduated === null) { setError('Please select your student status.'); return }
    setError('')
    setLoading(true)
    try {
      await api.patch('/profile/college', {
        college_name: collegeName.trim(),
        graduation_year: gradYear,
        is_graduated: isGraduated,
        college_url: collegeUrl.trim() || null,
        candidate_linkedin_url: candidateLinkedIn.trim() || null,
        current_company: currentCompany.trim() || null,
        phone: phone.trim() || null,
      })
      setStep(3)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResumeUpload = async (skipUpload = false) => {
    if (skipUpload || !resumeFile) { setStep(4); setTimeout(onComplete, 2000); return }
    setResumeUploading(true)
    setResumeError('')
    try {
      const form = new FormData()
      form.append('resume_file', resumeFile)
      await api.post('/profile/resume', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setStep(4)
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
          @keyframes spin-slow { to { transform: rotate(360deg); } }
        `}</style>

        {/* Skip */}
        {step < 4 && (
          <button onClick={onSkip} className="absolute -top-10 right-0 text-slate-400 hover:text-white text-xs font-medium transition-colors">
            Skip for now ↗
          </button>
        )}

        {/* Progress bar */}
        {step < 4 && (
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1, 2, 3].map(i => (
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
              <div className="text-6xl mb-4" style={{ animation: 'float 3s ease-in-out infinite' }}>🎓</div>
              <h2 className="text-2xl font-black text-white mb-2">hey, let's set up your profile!</h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Takes 30 seconds. Tell us where you're studying so we can connect you with your college community.
              </p>
              <div className="flex flex-wrap gap-3 justify-center mb-8">
                {['🏫 College Network', '🤝 Find Peers', '💼 Better Matches'].map(tag => (
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

          {/* ── Step 1: College name ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-8">
              <div className="text-4xl mb-3 text-center">🏛️</div>
              <h2 className="text-xl font-black text-white text-center mb-1">where do you study?</h2>
              <p className="text-slate-500 text-xs text-center mb-6">start typing — we'll auto-complete</p>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={collegeName}
                  onChange={e => { setCollegeName(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="e.g. IIT Bombay, BITS Pilani…"
                  className="w-full bg-slate-800 border border-slate-600 rounded-2xl px-5 py-3.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                />
                {showSuggestions && (suggestions.length > 0 || aiSearching) && (
                  <div className="absolute z-10 mt-2 w-full bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden shadow-xl shadow-black/40">
                    <div className="py-1 max-h-64 overflow-y-auto">
                      {suggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setCollegeName(resolveCanonicalName(s)); setShowSuggestions(false) }}
                          className="w-full text-left px-5 py-2.5 text-sm text-slate-200 hover:bg-violet-600/30 hover:text-white transition-colors flex items-center gap-2"
                        >
                          <span className="text-slate-500 text-xs">🏫</span> {s}
                        </button>
                      ))}
                      {aiSearching && (
                        <div className="px-5 py-2.5 flex items-center gap-2 text-slate-500 text-xs">
                          <svg className="w-3 h-3 vouch-spin shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                          </svg>
                          searching more colleges…
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

              <div className="mt-6 flex gap-3">
                <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-2xl border border-slate-600 text-slate-400 text-sm font-semibold hover:border-slate-400 hover:text-white transition-all">
                  ← back
                </button>
                <button
                  onClick={() => {
                    if (!collegeName.trim()) { setError('Please enter your college name.'); return }
                    setError('')
                    setCollegeName(resolveCanonicalName(collegeName))
                    setStep(2)
                  }}
                  className="flex-[2] py-3 rounded-2xl font-black text-white text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 shadow-lg shadow-violet-700/40 transition-all hover:scale-[1.02] active:scale-95"
                >
                  next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Status + year + logo ─────────────────────────────── */}
          {step === 2 && (
            <div className="p-8">
              <div className="text-4xl mb-3 text-center">📅</div>
              <h2 className="text-xl font-black text-white text-center mb-1">what's your status?</h2>
              <p className="text-slate-500 text-xs text-center mb-6">current student or already crushing it post-grad?</p>

              {/* Studying / Graduated toggle */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {([
                  { val: false, emoji: '📚', label: 'Currently Studying', sub: "i'm in college rn" },
                  { val: true,  emoji: '🎓', label: 'Graduated',          sub: 'alumnus/alumna' },
                ] as const).map(opt => (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => { setIsGraduated(opt.val); setGradYear(null) }}
                    className={`rounded-2xl border-2 p-4 text-center transition-all duration-200 ${
                      isGraduated === opt.val
                        ? 'border-violet-500 bg-violet-500/20 shadow-lg shadow-violet-500/20'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-3xl mb-1.5" style={isGraduated === opt.val ? { animation: 'pop 0.3s ease' } : {}}>
                      {opt.emoji}
                    </div>
                    <p className="text-white text-xs font-bold">{opt.label}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">{opt.sub}</p>
                  </button>
                ))}
              </div>

              {/* Year picker */}
              {isGraduated !== null && (
                <div className="mb-5">
                  <label className="block text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wide">
                    {isGraduated ? 'Graduation Year' : 'Expected Graduation Year'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(isGraduated ? PAST_YEARS : FUTURE_YEARS).map(y => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setGradYear(y)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          gradYear === y
                            ? 'bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-md shadow-violet-500/30'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* College website / LinkedIn — first from college only */}
              {isFirstFromCollege && collegeName.trim() && (
                <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">🌟</span>
                    <div>
                      <p className="text-amber-300 text-xs font-black">You're the first from {collegeName}!</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Add your college website or LinkedIn URL — we'll auto-fetch the logo.
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="url"
                      value={collegeUrl}
                      onChange={e => { setCollegeUrl(e.target.value); setLogoErr(false) }}
                      placeholder="https://iitb.ac.in  or  linkedin.com/school/iit-bombay"
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-xs pr-10
                        placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-all"
                    />
                    {/* Spinner while resolving */}
                    {resolving && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-3.5 h-3.5 text-amber-400" style={{ animation: 'spin-slow 0.8s linear infinite' }}
                          fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Logo preview */}
                  {resolvedLogo && !resolving && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                        {!logoErr ? (
                          <img src={resolvedLogo} alt="logo" className="w-8 h-8 object-contain" onError={() => setLogoErr(true)} />
                        ) : (
                          <span className="text-slate-500 text-xs">?</span>
                        )}
                      </div>
                      {!logoErr ? (
                        <p className="text-emerald-400 text-xs font-bold">✓ Logo found! Will be used for the college card.</p>
                      ) : (
                        <p className="text-slate-500 text-xs">Logo couldn't load — initials will be shown instead.</p>
                      )}
                    </div>
                  )}

                  {collegeUrl.trim() && !resolving && !resolvedLogo && (
                    <p className="text-slate-500 text-xs mt-2">
                      No logo found for this URL — we'll use initials on the card.
                    </p>
                  )}
                </div>
              )}

              {/* Candidate profile fields — shown for everyone */}
              <div className="mb-5 space-y-3">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Your profile <span className="normal-case font-normal text-slate-600">(optional)</span></p>

                <div>
                  <label className="block text-slate-500 text-xs mb-1.5">
                    Phone Number
                    <span className="ml-2 text-slate-600 normal-case font-normal">🔒 only visible to recruiters, not other candidates</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 text-xs mb-1.5">LinkedIn Profile URL</label>
                  <input
                    type="url"
                    value={candidateLinkedIn}
                    onChange={e => setCandidateLinkedIn(e.target.value)}
                    placeholder="https://linkedin.com/in/yourname"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-all"
                  />
                </div>

                {isGraduated && (
                  <div>
                    <label className="block text-slate-500 text-xs mb-1.5">Current Company <span className="text-slate-600">(where are you working?)</span></label>
                    <input
                      type="text"
                      value={currentCompany}
                      onChange={e => setCurrentCompany(e.target.value)}
                      placeholder="e.g. Google, Infosys, your startup…"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-all"
                    />
                  </div>
                )}
              </div>

              {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-2xl border border-slate-600 text-slate-400 text-sm font-semibold hover:border-slate-400 hover:text-white transition-all"
                >
                  ← back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || resolving}
                  className="flex-[2] py-3 rounded-2xl font-black text-white text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-50 shadow-lg shadow-violet-700/40 transition-all hover:scale-[1.02] active:scale-95"
                >
                  {loading ? 'saving…' : resolving ? 'fetching logo…' : "i'm done 🎉"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Resume upload ────────────────────────────────────── */}
          {step === 3 && (
            <div className="p-8">
              <div className="text-4xl mb-3 text-center">📄</div>
              <h2 className="text-xl font-black text-white text-center mb-1">add your resume</h2>
              <p className="text-slate-500 text-xs text-center mb-6">PDF, DOCX or TXT · max 10 MB — you can always update it later</p>

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

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => handleResumeUpload(true)}
                  className="flex-1 py-3 rounded-2xl border border-slate-600 text-slate-400 text-sm font-semibold hover:border-slate-400 hover:text-white transition-all"
                >
                  skip
                </button>
                <button
                  onClick={() => handleResumeUpload(false)}
                  disabled={!resumeFile || resumeUploading}
                  className="flex-[2] py-3 rounded-2xl font-black text-white text-sm bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-50 shadow-lg shadow-violet-700/40 transition-all hover:scale-[1.02] active:scale-95"
                >
                  {resumeUploading ? 'uploading…' : 'upload resume 🚀'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Success ───────────────────────────────────────────── */}
          {step === 4 && (
            <div className="p-8 text-center relative overflow-hidden">
              {['🎊', '✨', '🎉', '💫', '🌟', '🎈'].map((e, i) => (
                <span key={i} className="absolute text-2xl pointer-events-none" style={{
                  left: `${10 + i * 15}%`, top: '-10px',
                  animation: `confetti-fall ${1 + i * 0.2}s ease-out forwards`,
                  animationDelay: `${i * 0.1}s`,
                }}>{e}</span>
              ))}
              <div className="text-6xl mb-4" style={{ animation: 'pop 0.5s ease' }}>🎓</div>
              <h2 className="text-2xl font-black text-white mb-2">you're all set!</h2>
              <p className="text-slate-400 text-sm mb-2">
                Welcome to the <span className="text-violet-400 font-bold">{collegeName}</span> community.
              </p>
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
