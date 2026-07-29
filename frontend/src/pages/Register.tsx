import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LinkedInButton from '../components/LinkedInButton'
import GoogleButton from '../components/GoogleButton'
import { Button, Card } from '../components/ui'
import { useAuth, ActiveMode } from '../context/AuthContext'

const INP = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none transition'
const inpStyle = { border: '2px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' } as const

export default function Register() {
  const { sendSignupOtp, verifySignupOtp, resendSignupOtp, loginWithLinkedIn, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefilledAccountType = params.get('account_type') as ActiveMode | null
    ?? (params.get('role') as ActiveMode | null) // legacy compat

  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<ActiveMode>(prefilledAccountType ?? 'candidate')
  // Product intent drives the account capability + where we land after signup.
  // 'pulse' users are companies measuring their team → recruiter-capable account.
  type Intent = 'jobseeker' | 'hiring' | 'pulse'
  const [intent, setIntent] = useState<Intent>(prefilledAccountType === 'recruiter' ? 'hiring' : 'jobseeker')
  const chooseIntent = (i: Intent) => { setIntent(i); setRole(i === 'jobseeker' ? 'candidate' : 'recruiter') }
  const landingFor = (i: Intent) => (i === 'pulse' ? '/pulse' : i === 'hiring' ? '/recruiter' : '/')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // OTP step state
  const [otp, setOtp] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [info, setInfo] = useState('')

  const startResendCooldown = () => {
    setResendIn(30)
    const t = setInterval(() => {
      setResendIn(prev => { if (prev <= 1) { clearInterval(t); return 0 } return prev - 1 })
    }, 1000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError('')
    setLoading(true)
    try {
      await sendSignupOtp(email, password, fullName, role)
      setStep('otp')
      setInfo(`We sent a 6-digit code to ${email}.`)
      startResendCooldown()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Could not send the verification code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return }
    setError('')
    setLoading(true)
    try {
      await verifySignupOtp(email, otp.trim(), role)
      navigate(landingFor(intent), { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendIn > 0) return
    setError(''); setInfo('')
    try {
      await resendSignupOtp(email)
      setInfo(`A new code was sent to ${email}.`)
      startResendCooldown()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Could not resend the code.')
    }
  }

  // ── OTP verification step ───────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">📬</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, letterSpacing: '-0.035em', color: 'var(--ink)', margin: 0 }}>Verify your email</h1>
            <p className="text-muted mt-2 text-sm font-medium">
              Enter the 6-digit code we sent to <span className="font-bold text-ink">{email}</span>
            </p>
          </div>

          <Card padding={32}>
            <form onSubmit={handleVerify} className="space-y-5">
              <input
                type="text" inputMode="numeric" autoFocus value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="• • • • • •"
                className="w-full rounded-lg px-4 py-3 text-center tracking-[0.5em] font-bold text-2xl focus:outline-none transition"
                style={inpStyle}
              />

              {info && !error && (
                <div style={{ background: 'var(--green-soft, #ecfdf5)', border: '1.5px solid var(--green-line, #a7f3d0)', color: 'var(--green-ink, #047857)' }} className="rounded-lg px-4 py-3 text-sm font-medium">{info}</div>
              )}
              {error && (
                <div style={{ background: 'var(--red-soft)', border: '1.5px solid var(--red-line)', color: 'var(--red-ink)' }} className="rounded-lg px-4 py-3 text-sm font-medium">{error}</div>
              )}

              <Button type="submit" variant="primary" full size="lg" disabled={loading || otp.length !== 6}>
                {loading ? 'Verifying…' : 'Verify & Create Account'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep('form'); setError(''); setInfo(''); setOtp('') }} className="text-muted hover:text-ink font-semibold">← Edit details</button>
                <button type="button" onClick={handleResend} disabled={resendIn > 0} style={{ color: resendIn > 0 ? 'var(--muted)' : 'var(--violet-ink)', fontWeight: 700 }} className="disabled:cursor-not-allowed">
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    )
  }

  // ── Signup form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.035em', color: 'var(--ink)', margin: 0 }}>Create account</h1>
          <p className="text-muted mt-1 text-sm font-medium">Join Nideknil today</p>
        </div>

        <Card padding={32}>
          {/* Intent selector — what brings you here */}
          <div className="mb-5">
            <p className="text-sm font-bold text-ink mb-2">What brings you here?</p>
            <div className="grid gap-3">
              {([
                ['jobseeker', 'Find a job', 'Apply and show recruiters how you work with AI'],
                ['hiring', 'Hire & assess candidates', 'Post roles, run AI-fluency take-homes'],
                ['pulse', 'Measure my team’s AI fluency', 'Nideknil Pulse — for founders & eng leaders'],
              ] as const).map(([val, title, sub]) => {
                const active = intent === val
                return (
                  <button key={val} type="button" onClick={() => chooseIntent(val)}
                    className="rounded-xl py-3 px-4 text-left transition-all"
                    style={active
                      ? { border: '2px solid var(--ink)', background: 'var(--ink)', color: 'var(--bg)', boxShadow: '3px 3px 0 var(--violet)' }
                      : { border: '2px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5 }}>{title}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2, color: active ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>{sub}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* OAuth */}
          <div className="space-y-3">
            <GoogleButton label={`Sign up with Google`} onClick={() => loginWithGoogle(role)} />
            <LinkedInButton label={`Sign up with LinkedIn`} onClick={() => loginWithLinkedIn(role)} />
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
            <span className="text-xs text-muted font-bold">or with email</span>
            <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-ink mb-1.5">Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" required className={INP} style={inpStyle} />
            </div>
            <div>
              <label className="block text-sm font-bold text-ink mb-1.5">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className={INP} style={inpStyle} />
            </div>
            <div>
              <label className="block text-sm font-bold text-ink mb-1.5">Password <span className="font-normal text-muted ml-1">(min. 8 characters)</span></label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} className={INP} style={inpStyle} />
            </div>

            {error && (
              <div style={{ background: 'var(--red-soft)', border: '1.5px solid var(--red-line)', color: 'var(--red-ink)' }} className="rounded-lg px-4 py-3 text-sm font-medium">{error}</div>
            )}

            <Button type="submit" variant="primary" full size="lg" disabled={loading}>
              {loading ? 'Sending code…' : 'Continue →'}
            </Button>
            <p className="text-center text-xs text-muted">We'll email you a 6-digit code to verify your address.</p>

            <p className="text-center text-sm text-muted">
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--violet-ink)', fontWeight: 700 }} className="hover:underline">Sign in</Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}
