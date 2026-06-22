import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleIcon } from '../components/GoogleButton'
import { useAuth, ActiveMode } from '../context/AuthContext'

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
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-navy-900">Welcome back</h1>
          <p className="text-slate-500 mt-1 text-sm">Sign in to your TalentAI account</p>
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
              autoFocus
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
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-blue hover:underline font-medium">
              Create one
            </Link>
          </p>
        </form>

        {/* Social sign-in */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">or continue with</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <div className="mt-4 space-y-3">
          {/* Google */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => loginWithGoogle('candidate')}
              className="flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <GoogleIcon className="w-4 h-4" />
              Google · Candidate
            </button>
            <button
              onClick={() => loginWithGoogle('recruiter')}
              className="flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <GoogleIcon className="w-4 h-4" />
              Google · Recruiter
            </button>
          </div>

          {/* LinkedIn */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => loginWithLinkedIn('candidate')}
              className="flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <LinkedInIcon />
              LinkedIn · Candidate
            </button>
            <button
              onClick={() => loginWithLinkedIn('recruiter')}
              className="flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <LinkedInIcon />
              LinkedIn · Recruiter
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
