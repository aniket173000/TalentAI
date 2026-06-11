import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LinkedInButton from '../components/LinkedInButton'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register, loginWithLinkedIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefilledRole = params.get('role') as 'candidate' | 'recruiter' | null

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'candidate' | 'recruiter'>(prefilledRole ?? 'candidate')
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
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-navy-900">Create account</h1>
          <p className="text-slate-500 mt-1 text-sm">Join TalentAI today</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 p-8 space-y-5 shadow-sm"
        >
          {/* Role selector */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">I am a…</p>
            <div className="grid grid-cols-2 gap-3">
              {(['candidate', 'recruiter'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-xl border-2 py-3 px-4 text-sm font-semibold transition-all ${
                    role === r
                      ? 'border-brand-blue bg-blue-50 text-brand-blue'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {r === 'candidate' ? 'Job Seeker' : 'Recruiter'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
            />
          </div>

          {/* Recruiter-only: company + third-party flag */}
          {role === 'recruiter' && (
            <>
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-slate-200 p-3 hover:border-slate-300 transition">
                <input
                  type="checkbox"
                  checked={isThirdParty}
                  onChange={e => { setIsThirdParty(e.target.checked); if (e.target.checked) setCompany('') }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                />
                <span className="text-sm text-slate-700">
                  <span className="font-semibold">I am a third-party recruiter</span>
                  <span className="block text-slate-400 text-xs mt-0.5">I recruit on behalf of client companies, not as a direct employee.</span>
                </span>
              </label>

              {!isThirdParty && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    required
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                  />
                  <p className="text-xs text-slate-400 mt-1">Jobs you post will be auto-assigned to this company.</p>
                </div>
              )}
            </>
          )}

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
              <span className="font-normal text-slate-400 ml-1">(min. 8 characters)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
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
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-blue hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">or sign up with</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <div className="mt-4">
          <LinkedInButton
            label={`Sign up as ${role === 'recruiter' ? 'Recruiter' : 'Job Seeker'} with LinkedIn`}
            onClick={() => loginWithLinkedIn(role)}
          />
        </div>
      </div>
    </div>
  )
}
