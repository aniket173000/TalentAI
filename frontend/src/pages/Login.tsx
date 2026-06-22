import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleIcon } from '../components/GoogleButton'
import { Button, Card } from '../components/ui'
import { useAuth, ActiveMode } from '../context/AuthContext'

const INP = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none transition'
const inpStyle = { border: '2px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' } as const
const socialBtn = 'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-ink hover:bg-surface2 transition-colors'

export default function Login() {
  const { login, loginWithLinkedIn, loginWithGoogle, user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // After login, if the user has both capabilities, ask which mode to enter
  const [dualModeUser, setDualModeUser] = useState(false)

  // If already logged in, redirect
  if (user && !dualModeUser) {
    navigate(redirect || (user.is_recruiter && !user.is_candidate ? '/recruiter' : '/'), { replace: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      // AuthContext already sets activeMode based on saved preference.
      // Redirect is handled by the effect above, but check for dual-mode first:
      const stored = localStorage.getItem('active_mode') as ActiveMode | null
      const isRecruiter = stored === 'recruiter'
      navigate(redirect || (isRecruiter ? '/recruiter' : '/'), { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.035em', color: 'var(--ink)', margin: 0 }}>Welcome back</h1>
          <p className="text-muted mt-1 text-sm font-medium">Sign in to your TalentAI account</p>
        </div>

        <Card padding={32}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-ink mb-1.5">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoFocus className={INP} style={inpStyle} />
            </div>
            <div>
              <label className="block text-sm font-bold text-ink mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required className={INP} style={inpStyle} />
            </div>

            {error && (
              <div style={{ background: 'var(--red-soft)', border: '1.5px solid var(--red-line)', color: 'var(--red-ink)' }} className="rounded-lg px-4 py-3 text-sm font-medium">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" full size="lg" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>

            <p className="text-center text-sm text-muted">
              Don't have an account?{' '}
              <Link to="/register" style={{ color: 'var(--violet-ink)', fontWeight: 700 }} className="hover:underline">Create one</Link>
            </p>
          </form>
        </Card>

        {/* Social sign-in */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
          <span className="text-xs text-muted font-bold">or continue with</span>
          <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
        </div>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => loginWithGoogle('candidate')} className={socialBtn} style={{ border: '2px solid var(--line)', background: 'var(--surface)' }}>
              <GoogleIcon className="w-4 h-4" /> Google · Candidate
            </button>
            <button onClick={() => loginWithGoogle('recruiter')} className={socialBtn} style={{ border: '2px solid var(--line)', background: 'var(--surface)' }}>
              <GoogleIcon className="w-4 h-4" /> Google · Recruiter
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => loginWithLinkedIn('candidate')} className={socialBtn} style={{ border: '2px solid var(--line)', background: 'var(--surface)' }}>
              <LinkedInIcon /> LinkedIn · Candidate
            </button>
            <button onClick={() => loginWithLinkedIn('recruiter')} className={socialBtn} style={{ border: '2px solid var(--line)', background: 'var(--surface)' }}>
              <LinkedInIcon /> LinkedIn · Recruiter
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkedInIcon() {
  return (
    <svg className="w-4 h-4 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}
