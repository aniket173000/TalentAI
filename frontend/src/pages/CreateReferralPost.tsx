import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import AIJobDescription from '../components/AIJobDescription'
import { useAuth } from '../context/AuthContext'

type Step = 'verify' | 'details' | 'settings' | 'done'
type VerifyMethod = 'linkedin' | 'work_email' | null
type LinkType = 'internal' | 'external'

interface FormState {
  company_name: string
  link_type: LinkType
  job_id: string
  external_job_url: string
  jd_raw: string
  title: string
  location: string
  employment_type: string
  min_match_score: number
  pool_size: number
  waitlist_size: number
  referrer_title: string
  referrer_tenure: string
  referrer_note: string
}

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship']

export default function CreateReferralPost() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [step, setStep] = useState<Step>('verify')
  const [verifyMethod, setVerifyMethod] = useState<VerifyMethod>(null)
  const [workEmail, setWorkEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [companyVerified, setCompanyVerified] = useState(
    !!(user?.linkedin_verified && user?.company)
  )
  const [verifiedVia, setVerifiedVia] = useState<VerifyMethod>(
    user?.linkedin_verified && user?.company ? 'linkedin' : null
  )
  const [form, setForm] = useState<FormState>({
    company_name: user?.company || '',
    link_type: 'internal',
    job_id: '',
    external_job_url: '',
    jd_raw: '',
    title: '',
    location: '',
    employment_type: 'Full-time',
    min_match_score: 40,
    pool_size: 15,
    waitlist_size: 10,
    referrer_title: '',
    referrer_tenure: '',
    referrer_note: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)

  // Domain check state
  type DomainState = 'idle' | 'checking' | 'valid' | 'invalid' | 'free_provider'
  const [domainState, setDomainState] = useState<DomainState>('idle')
  const [domainMsg, setDomainMsg] = useState('')
  const [expectedDomains, setExpectedDomains] = useState<string[]>([])
  const domainCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setField = (k: keyof FormState, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  const checkEmailDomain = async (email: string, companyName: string) => {
    if (!email || !email.includes('@') || !companyName.trim()) return
    setDomainState('checking')
    setDomainMsg('')
    setExpectedDomains([])
    try {
      const { data } = await api.post('/referrals/verify/check-domain', {
        work_email: email,
        company_name: companyName,
      })
      if (data.is_free_provider) {
        setDomainState('free_provider')
        setDomainMsg(data.reason)
      } else if (data.match) {
        setDomainState('valid')
        setDomainMsg(`Domain verified — looks like a ${companyName} email.`)
        setExpectedDomains(data.expected_domains || [])
      } else {
        setDomainState('invalid')
        setDomainMsg(data.reason || `This domain doesn't appear to belong to ${companyName}.`)
        setExpectedDomains(data.expected_domains || [])
      }
    } catch {
      setDomainState('idle')
    }
  }

  const handleEmailChange = (val: string) => {
    setWorkEmail(val)
    setDomainState('idle')
    if (domainCheckRef.current) clearTimeout(domainCheckRef.current)
    if (val.includes('@') && form.company_name.trim()) {
      domainCheckRef.current = setTimeout(() => {
        checkEmailDomain(val, form.company_name)
      }, 600)
    }
  }

  const handleEmailBlur = () => {
    if (workEmail.includes('@') && form.company_name.trim() && domainState === 'idle') {
      checkEmailDomain(workEmail, form.company_name)
    }
  }

  // ── Step 1: Verify ────────────────────────────────────────────────────────

  const handleSendOtp = async () => {
    if (!form.company_name || !workEmail) return
    setLoading(true); setError('')
    try {
      await api.post('/referrals/verify/send-otp', { work_email: workEmail, company_name: form.company_name })
      setOtpSent(true)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || 'Failed to send OTP.')
    } finally { setLoading(false) }
  }

  const handleConfirmOtp = async () => {
    setLoading(true); setError('')
    try {
      await api.post('/referrals/verify/confirm-otp', {
        work_email: workEmail, company_name: form.company_name, otp_code: otp,
      })
      setCompanyVerified(true)
      setVerifiedVia('work_email')
      setStep('details')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || 'Invalid OTP.')
    } finally { setLoading(false) }
  }

  const handleLinkedInVerify = () => {
    if (user?.linkedin_verified && user?.company) {
      setForm(f => ({ ...f, company_name: user.company! }))
      setCompanyVerified(true)
      setVerifiedVia('linkedin')
      setStep('details')
    } else {
      setError('Please connect your LinkedIn account from your profile first.')
    }
  }

  // ── Step 3: Create post ───────────────────────────────────────────────────

  const handleCreate = async () => {
    setLoading(true); setError('')
    try {
      const payload = {
        title: form.title,
        company_name: form.company_name,
        link_type: form.link_type,
        job_id: form.link_type === 'internal' && form.job_id ? parseInt(form.job_id) : undefined,
        external_job_url: form.link_type === 'external' ? form.external_job_url : undefined,
        jd_raw: form.jd_raw,
        location: form.location,
        employment_type: form.employment_type,
        min_match_score: form.min_match_score,
        pool_size: form.pool_size,
        waitlist_size: form.waitlist_size,
        referrer_title: form.referrer_title || undefined,
        referrer_tenure: form.referrer_tenure || undefined,
        referrer_note: form.referrer_note || undefined,
      }
      const { data } = await api.post('/referrals/posts', payload)
      // Mark post as verified via work email if needed
      if (verifiedVia === 'work_email') {
        await api.post(`/referrals/posts/${data.id}/verify-work-email`, {
          work_email: workEmail, company_name: form.company_name,
        })
      }
      // Open the post
      await api.post(`/referrals/posts/${data.id}/open`, {})
      setCreatedSlug(data.slug || data.id)
      setStep('done')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || 'Failed to create referral post.')
    } finally { setLoading(false) }
  }

  // ── Stepper UI ────────────────────────────────────────────────────────────

  const steps: { id: Step; label: string }[] = [
    { id: 'verify', label: 'Verify' },
    { id: 'details', label: 'Job Details' },
    { id: 'settings', label: 'Pool Settings' },
    { id: 'done', label: 'Live' },
  ]
  const stepIdx = steps.findIndex(s => s.id === step)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold">Create a Referral Post</h1>
          <p className="text-indigo-100 mt-2 text-sm">Help great candidates get noticed at your company.</p>

          {/* Progress */}
          <div className="mt-8 flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < stepIdx
                    ? 'bg-white text-accent-ink'
                    : i === stepIdx
                    ? 'bg-white/30 text-white ring-2 ring-white'
                    : 'bg-white/10 text-white/40'
                }`}>
                  {i < stepIdx ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium ${i <= stepIdx ? 'text-white' : 'text-white/40'}`}>{s.label}</span>
                {i < steps.length - 1 && <div className="w-6 h-px bg-white/20 mx-1" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* ── Step: Verify ── */}
        {step === 'verify' && (
          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card shadow-sm p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-ink">Verify your employer</h2>
              <p className="text-muted text-sm mt-1">We need to confirm you work at the company you're creating a referral for.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company name</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                placeholder="e.g. Google, Stripe, Figma"
                value={form.company_name}
                onChange={e => setField('company_name', e.target.value)}
              />
            </div>

            {!verifyMethod && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {user?.linkedin_verified && user?.company && (
                  <button
                    onClick={handleLinkedInVerify}
                    className="flex items-center gap-3 p-4 border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
                  >
                    <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    <div>
                      <div className="font-semibold text-ink text-sm">LinkedIn</div>
                      <div className="text-xs text-muted">{user.company}</div>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => setVerifyMethod('work_email')}
                  className="flex items-center gap-3 p-4 border-2 border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-accent-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-ink text-sm">Work Email</div>
                    <div className="text-xs text-muted">Verify via OTP</div>
                  </div>
                </button>
              </div>
            )}

            {verifyMethod === 'work_email' && (
              <div className="space-y-4 border border-slate-100 rounded-xl p-5 bg-slate-50">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Work email address</label>
                  <div className="relative">
                    <input
                      type="email"
                      className={`w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-white transition-colors ${
                        domainState === 'valid'
                          ? 'border-emerald-400 focus:ring-emerald-400'
                          : domainState === 'invalid' || domainState === 'free_provider'
                          ? 'border-rose-400 focus:ring-rose-400'
                          : 'border-slate-200 focus:ring-indigo-500'
                      }`}
                      placeholder="you@company.com"
                      value={workEmail}
                      onChange={e => handleEmailChange(e.target.value)}
                      onBlur={handleEmailBlur}
                      disabled={otpSent}
                    />
                    {/* Inline status icon */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {domainState === 'checking' && (
                        <svg className="w-4 h-4 text-muted animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                        </svg>
                      )}
                      {domainState === 'valid' && (
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {(domainState === 'invalid' || domainState === 'free_provider') && (
                        <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Domain feedback banner */}
                  {domainState === 'valid' && (
                    <div className="mt-2 flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs text-emerald-700">{domainMsg}</p>
                    </div>
                  )}
                  {(domainState === 'invalid' || domainState === 'free_provider') && (
                    <div className="mt-2 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2.5">
                      <svg className="w-3.5 h-3.5 text-rose-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-xs text-rose-700">{domainMsg}</p>
                        {expectedDomains.length > 0 && (
                          <p className="text-xs text-rose-600 mt-1">
                            Expected domain{expectedDomains.length > 1 ? 's' : ''} for <strong>{form.company_name}</strong>:{' '}
                            {expectedDomains.map(d => (
                              <code key={d} className="bg-rose-100 px-1 rounded text-xs mx-0.5">@{d}</code>
                            ))}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {!otpSent ? (
                  <button
                    onClick={handleSendOtp}
                    disabled={loading || !workEmail || !form.company_name || domainState === 'invalid' || domainState === 'free_provider' || domainState === 'checking'}
                    className="bg-accent hover:opacity-90 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Sending...' : domainState === 'checking' ? 'Verifying domain...' : 'Send OTP'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Enter 6-digit code</label>
                      <input
                        type="text"
                        maxLength={6}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent bg-white text-center text-lg tracking-widest font-mono"
                        placeholder="000000"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleConfirmOtp}
                        disabled={loading || otp.length !== 6}
                        className="flex-1 bg-accent hover:opacity-90 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
                      >
                        {loading ? 'Verifying...' : 'Verify'}
                      </button>
                      <button onClick={() => { setOtpSent(false); setOtp('') }} className="text-sm text-muted hover:text-slate-700">Resend</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Details ── */}
        {step === 'details' && (
          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card shadow-sm p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-ink">Job Details</h2>
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full font-medium">
                  Verified: {form.company_name}
                </span>
              </div>
              <p className="text-muted text-sm">Provide the job info — this is what candidates will see.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Job Title</label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. Senior Software Engineer"
                  value={form.title}
                  onChange={e => setField('title', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                  placeholder="e.g. Bangalore / Remote"
                  value={form.location}
                  onChange={e => setField('location', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Employment Type</label>
                <select
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent bg-white"
                  value={form.employment_type}
                  onChange={e => setField('employment_type', e.target.value)}
                >
                  {EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Link type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Job Source</label>
              <div className="flex gap-3">
                {(['internal', 'external'] as LinkType[]).map(lt => (
                  <button
                    key={lt}
                    onClick={() => setField('link_type', lt)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      form.link_type === lt
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-[color:var(--violet-line)]'
                    }`}
                  >
                    {lt === 'internal' ? 'Job on Platform' : 'External Link'}
                  </button>
                ))}
              </div>
            </div>

            {form.link_type === 'internal' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Job ID (optional)</label>
                <input
                  type="number"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                  placeholder="Paste the job ID from Nideknil"
                  value={form.job_id}
                  onChange={e => setField('job_id', e.target.value)}
                />
              </div>
            )}

            {form.link_type === 'external' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Job Posting URL</label>
                <input
                  type="url"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                  placeholder="https://careers.company.com/job/..."
                  value={form.external_job_url}
                  onChange={e => setField('external_job_url', e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Job Description</label>
              <AIJobDescription
                value={form.jd_raw}
                onChange={v => setField('jd_raw', v)}
                title={form.title}
                company={form.company_name}
                employmentType={form.employment_type}
                location={form.location}
                minChars={0}
                rows={10}
              />
              <p className="text-xs text-muted mt-1">The more detailed, the better the AI matching quality.</p>
            </div>

            {/* Referrer presentation — powers your public referrer card */}
            <div className="border-t border-slate-100 pt-5 space-y-4">
              <p className="text-sm font-semibold text-ink">About you as the referrer <span className="font-normal text-muted">(optional)</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Your title</label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                    placeholder="e.g. Staff Engineer, Platform"
                    value={form.referrer_title}
                    onChange={e => setField('referrer_title', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tenure</label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                    placeholder="e.g. 3 yrs at Lumen"
                    value={form.referrer_tenure}
                    onChange={e => setField('referrer_tenure', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Note to candidates</label>
                <textarea
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent resize-none"
                  placeholder="e.g. I review every applicant myself. Show me one thing you've shipped end-to-end."
                  value={form.referrer_note}
                  onChange={e => setField('referrer_note', e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep('verify')} className="px-5 py-2.5 text-sm text-slate-600 hover:text-ink border border-slate-200 rounded-xl">
                Back
              </button>
              <button
                onClick={() => setStep('settings')}
                disabled={!form.title || !form.jd_raw}
                className="flex-1 bg-accent hover:opacity-90 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Settings ── */}
        {step === 'settings' && (
          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card shadow-sm p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-ink">Pool Settings</h2>
              <p className="text-muted text-sm mt-1">Configure how the referral pool works.</p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-2">
                  <span>Pool Size</span>
                  <span className="text-accent-ink font-bold text-base">{form.pool_size}</span>
                </label>
                <input
                  type="range" min={5} max={30} step={1}
                  value={form.pool_size}
                  onChange={e => setField('pool_size', parseInt(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-muted mt-1"><span>5</span><span>30</span></div>
                <p className="text-xs text-muted mt-1">Top candidates you'll refer when closing. Default: 15.</p>
              </div>

              <div>
                <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-2">
                  <span>Waitlist Size</span>
                  <span className="text-amber-600 font-bold text-base">{form.waitlist_size}</span>
                </label>
                <input
                  type="range" min={0} max={20} step={1}
                  value={form.waitlist_size}
                  onChange={e => setField('waitlist_size', parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-xs text-muted mt-1"><span>0</span><span>20</span></div>
                <p className="text-xs text-muted mt-1">Backup candidates referred only if you have remaining capacity.</p>
              </div>

              <div>
                <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-2">
                  <span>Min Match Score</span>
                  <span className="text-ink font-bold text-base">{form.min_match_score}%</span>
                </label>
                <input
                  type="range" min={20} max={80} step={5}
                  value={form.min_match_score}
                  onChange={e => setField('min_match_score', parseInt(e.target.value))}
                  className="w-full accent-slate-600"
                />
                <div className="flex justify-between text-xs text-muted mt-1"><span>20%</span><span>80%</span></div>
                <p className="text-xs text-muted mt-1">Candidates below this score are instantly rejected.</p>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-indigo-800">Summary</p>
              <div className="grid grid-cols-2 gap-1 text-sm text-indigo-700">
                <span>Role</span><span className="font-medium">{form.title}</span>
                <span>Company</span><span className="font-medium">{form.company_name}</span>
                <span>Pool</span><span className="font-medium">{form.pool_size} candidates</span>
                <span>Waitlist</span><span className="font-medium">{form.waitlist_size} candidates</span>
                <span>Min score</span><span className="font-medium">{form.min_match_score}%</span>
                <span>Closes in</span><span className="font-medium">5 days (auto)</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep('details')} className="px-5 py-2.5 text-sm text-slate-600 hover:text-ink border border-slate-200 rounded-xl">
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 bg-accent hover:opacity-90 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {loading ? 'Publishing...' : 'Publish Referral Post'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card shadow-sm p-10 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-ink">Your referral post is live!</h2>
              <p className="text-muted text-sm mt-2">Candidates can now find it on the {form.company_name} referral page.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={() => navigate(`/referrals/${createdSlug}`)}
                className="px-6 py-2.5 bg-accent hover:opacity-90 text-white rounded-xl text-sm font-medium transition-colors"
              >
                View Post
              </button>
              <button
                onClick={() => navigate('/referrals/dashboard')}
                className="px-6 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
