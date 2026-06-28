import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LinkedInButton from '../components/LinkedInButton'
import GoogleButton from '../components/GoogleButton'
import { Button, Card } from '../components/ui'
import { useAuth, ActiveMode } from '../context/AuthContext'

const INP = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none transition'
const inpStyle = { border: '2px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' } as const

export default function Register() {
  const { register, loginWithLinkedIn, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefilledAccountType = params.get('account_type') as ActiveMode | null
    ?? (params.get('role') as ActiveMode | null) // legacy compat

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<ActiveMode>(prefilledAccountType ?? 'candidate')
  const [company, setCompany] = useState('')
  const [isThirdParty, setIsThirdParty] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (role === 'recruiter' && !isThirdParty && !company.trim()) {
      setError('Please enter your company name, or check the third-party recruiter option.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await register(email, password, fullName, role, company.trim() || null, isThirdParty)
      navigate(role === 'recruiter' ? '/recruiter' : '/', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.035em', color: 'var(--ink)', margin: 0 }}>Create account</h1>
          <p className="text-muted mt-1 text-sm font-medium">Join Nideknil today</p>
        </div>

        <Card padding={32}>
          <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role selector */}
          <div>
            <p className="text-sm font-bold text-ink mb-2">I am a…</p>
            <div className="grid grid-cols-2 gap-3">
              {(['candidate', 'recruiter'] as const).map(r => {
                const active = role === r
                return (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className="rounded-xl py-3 px-4 text-sm font-extrabold transition-all"
                    style={active
                      ? { border: '2px solid var(--ink)', background: 'var(--ink)', color: 'var(--bg)', boxShadow: '3px 3px 0 var(--violet)', fontFamily: 'var(--font-display)' }
                      : { border: '2px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
                    {r === 'candidate' ? 'Job Seeker' : 'Recruiter'}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-ink mb-1.5">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith" required className={INP} style={inpStyle} />
          </div>

          {/* Recruiter-only: company + third-party flag */}
          {role === 'recruiter' && (
            <>
              <label className="flex items-start gap-3 cursor-pointer rounded-xl p-3 transition" style={{ border: '2px solid var(--line)' }}>
                <input type="checkbox" checked={isThirdParty}
                  onChange={e => { setIsThirdParty(e.target.checked); if (e.target.checked) setCompany('') }}
                  className="mt-0.5 h-4 w-4" style={{ accentColor: 'var(--violet)' }} />
                <span className="text-sm text-ink">
                  <span className="font-bold">I am a third-party recruiter</span>
                  <span className="block text-muted text-xs mt-0.5">I recruit on behalf of client companies, not as a direct employee.</span>
                </span>
              </label>

              {!isThirdParty && (
                <div>
                  <label className="block text-sm font-bold text-ink mb-1.5">Company Name <span style={{ color: 'var(--red-ink)' }}>*</span></label>
                  <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                    placeholder="e.g. Acme Corp" required className={INP} style={inpStyle} />
                  <p className="text-xs text-muted mt-1">Jobs you post will be auto-assigned to this company.</p>
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-sm font-bold text-ink mb-1.5">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required className={INP} style={inpStyle} />
          </div>

          <div>
            <label className="block text-sm font-bold text-ink mb-1.5">
              Password <span className="font-normal text-muted ml-1">(min. 8 characters)</span>
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={8} className={INP} style={inpStyle} />
          </div>

          {error && (
            <div style={{ background: 'var(--red-soft)', border: '1.5px solid var(--red-line)', color: 'var(--red-ink)' }} className="rounded-lg px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" full size="lg" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </Button>

          <p className="text-center text-sm text-muted">
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--violet-ink)', fontWeight: 700 }} className="hover:underline">Sign in</Link>
          </p>
          </form>
        </Card>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
          <span className="text-xs text-muted font-bold">or sign up with</span>
          <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
        </div>

        <div className="mt-4 space-y-3">
          <GoogleButton
            label={`Sign up as ${role === 'recruiter' ? 'Recruiter' : 'Job Seeker'} with Google`}
            onClick={() => loginWithGoogle(role)}
          />
          <LinkedInButton
            label={`Sign up as ${role === 'recruiter' ? 'Recruiter' : 'Job Seeker'} with LinkedIn`}
            onClick={() => loginWithLinkedIn(role)}
          />
        </div>
      </div>
    </div>
  )
}
