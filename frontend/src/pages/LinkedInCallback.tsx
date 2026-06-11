import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function LinkedInCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { completeLinkedInLogin } = useAuth()

  const token = params.get('token')
  const role = params.get('role') as 'recruiter' | 'candidate' | null
  const error = params.get('error')
  const needsCompany = params.get('needs_company') === 'true'

  const [status, setStatus] = useState<'loading' | 'company' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [company, setCompany] = useState('')
  const [isThirdParty, setIsThirdParty] = useState(false)
  const [saving, setSaving] = useState(false)

  const ranOnce = useRef(false)

  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true

    if (error) {
      setErrorMsg(decodeURIComponent(error).replace(/_/g, ' '))
      setStatus('error')
      return
    }

    if (!token || !role) {
      setErrorMsg('Missing authentication data.')
      setStatus('error')
      return
    }

    completeLinkedInLogin(token, role)
      .then(() => {
        if (needsCompany && role === 'recruiter') {
          setStatus('company')
        } else {
          navigate(role === 'recruiter' ? '/recruiter' : '/', { replace: true })
        }
      })
      .catch(() => {
        setErrorMsg('Failed to complete sign-in. Please try again.')
        setStatus('error')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompanySave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company.trim() && !isThirdParty) return
    setSaving(true)
    try {
      await api.patch('/auth/linkedin/profile', {
        company: isThirdParty ? null : company.trim(),
        is_third_party_recruiter: isThirdParty,
      })
      navigate('/recruiter', { replace: true })
    } catch {
      setErrorMsg('Failed to save company. You can update it later in your profile.')
      navigate('/recruiter', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">LinkedIn sign-in failed</h1>
          <p className="text-slate-500 text-sm mb-6 capitalize">{errorMsg}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="bg-brand-blue hover:bg-blue-600 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
          >
            Back to login
          </button>
        </div>
      </div>
    )
  }

  // ── Company setup for first-time LinkedIn recruiter ────────────────────────
  if (status === 'company') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 border border-blue-100 mb-4">
              <svg className="w-7 h-7 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">One last step</h1>
            <p className="text-slate-500 text-sm mt-1">Tell us about your recruiter role so we can verify your job postings.</p>
          </div>

          <form
            onSubmit={handleCompanySave}
            className="bg-white rounded-2xl border border-slate-200 p-8 space-y-5 shadow-sm"
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isThirdParty}
                onChange={e => setIsThirdParty(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
              />
              <span className="text-sm text-slate-700">
                <span className="font-semibold">I am a third-party recruiter</span>
                <span className="block text-slate-500 mt-0.5">I recruit on behalf of client companies, not as a direct employee.</span>
              </span>
            </label>

            {!isThirdParty && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Your Company <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required={!isThirdParty}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Jobs you post will be verified against this company name.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || (!isThirdParty && !company.trim())}
              className="w-full bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors"
            >
              {saving ? 'Saving…' : 'Continue to Dashboard'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Completing LinkedIn sign-in…</p>
      </div>
    </div>
  )
}
