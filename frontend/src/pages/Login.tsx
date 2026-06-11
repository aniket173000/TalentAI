import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LinkedInButton from '../components/LinkedInButton'
import { useAuth } from '../context/AuthContext'

const ROLES = [
  {
    key: 'recruiter' as const,
    label: 'Recruiter',
    icon: '💼',
    description: 'Post jobs, review applicants & manage your talent pipeline',
    destination: '/recruiter',
  },
  {
    key: 'candidate' as const,
    label: 'Candidate',
    icon: '🎯',
    description: 'Find jobs, submit applications & track your progress',
    destination: '/',
  },
]

export default function Login() {
  const { login, loginWithLinkedIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')
  const prefilledRole = params.get('role') as 'recruiter' | 'candidate' | null

  const [selectedRole, setSelectedRole] = useState<'recruiter' | 'candidate' | null>(prefilledRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRole) return
    setError('')
    setLoading(true)
    try {
      await login(email, password, selectedRole)
      const dest = redirect || (selectedRole === 'recruiter' ? '/recruiter' : '/')
      navigate(dest, { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 1: Role selection ─────────────────────────────────────────────────
  if (!selectedRole) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-extrabold text-navy-900">Welcome back</h1>
            <p className="text-slate-500 mt-2 text-sm">How would you like to sign in today?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {ROLES.map(r => (
              <button
                key={r.key}
                onClick={() => setSelectedRole(r.key)}
                className="group relative flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-8 text-center shadow-sm hover:border-brand-blue hover:shadow-md transition-all duration-200"
              >
                <span className="text-4xl">{r.icon}</span>
                <span className="text-lg font-bold text-navy-900 group-hover:text-brand-blue transition-colors">
                  {r.label}
                </span>
                <span className="text-sm text-slate-500 leading-relaxed">{r.description}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue opacity-0 group-hover:opacity-100 transition-opacity">
                  Continue as {r.label} →
                </span>
              </button>
            ))}
          </div>

          <p className="text-center text-sm text-slate-500">
            New to TalentAI?{' '}
            <Link to="/register" className="text-brand-blue hover:underline font-medium">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Step 2: Credentials form ───────────────────────────────────────────────
  const roleInfo = ROLES.find(r => r.key === selectedRole)!

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <button
            onClick={() => { setSelectedRole(null); setError('') }}
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-4 transition-colors"
          >
            ← Change role
          </button>
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-2xl">{roleInfo.icon}</span>
            <h1 className="text-3xl font-extrabold text-navy-900">Sign in</h1>
          </div>
          <span className="inline-block bg-blue-50 text-brand-blue text-xs font-semibold px-3 py-1 rounded-full border border-blue-100">
            {roleInfo.label}
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 p-8 space-y-5 shadow-sm"
        >
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors"
          >
            {loading ? 'Signing in…' : `Sign In as ${roleInfo.label}`}
          </button>

          <p className="text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link
              to={`/register?role=${selectedRole}`}
              className="text-brand-blue hover:underline font-medium"
            >
              Create one
            </Link>
          </p>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <div className="mt-4">
          <LinkedInButton
            label={`Continue with LinkedIn as ${roleInfo.label}`}
            onClick={() => loginWithLinkedIn(selectedRole)}
          />
        </div>
      </div>
    </div>
  )
}
