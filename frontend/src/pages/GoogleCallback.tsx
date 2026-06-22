import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { GoogleIcon } from '../components/GoogleButton'

export default function GoogleCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { completeGoogleLogin } = useAuth()

  const token = params.get('token')
  const accountType = params.get('account_type') as 'recruiter' | 'candidate' | null
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

    if (!token || !accountType) {
      setErrorMsg('Missing authentication data.')
      setStatus('error')
      return
    }

    completeGoogleLogin(token, accountType)
      .then(() => {
        if (needsCompany && accountType === 'recruiter') {
          setStatus('company')
        } else {
          navigate(accountType === 'recruiter' ? '/recruiter' : '/', { replace: true })
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
      await api.patch('/profile/recruiter', {
        company: isThirdParty ? null : company.trim(),
        is_third_party: isThirdParty,
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
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Google sign-in failed</h1>
          <p className="text-slate-500 text-sm mb-6 capitalize">{errorMsg}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="bg-accent hover:opacity-90 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
          >
            Back to login
          </button>
        </div>
      </div>
    )
  }

  // ── Company setup for first-time Google recruiter ──────────────────────────
  if (status === 'company') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white border border-slate-200 shadow-sm mb-4">
              <GoogleIcon className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">One last step</h1>
            <p className="text-slate-500 text-sm mt-1">Tell us about your recruiter role so we can verify your job postings.</p>
          </div>

          <form
            onSubmit={handleCompanySave}
            className="bg-surface rounded-2xl border-2 border-ink shadow-card p-8 space-y-5 shadow-sm"
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isThirdParty}
                onChange={e => setIsThirdParty(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-ink focus:ring-accent"
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
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent transition"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Jobs you post will be verified against this company name.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || (!isThirdParty && !company.trim())}
              className="w-full bg-accent hover:opacity-90 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors"
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
        <div className="w-8 h-8 border-4 border-accent/30 border-t-brand-blue rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Completing Google sign-in…</p>
      </div>
    </div>
  )
}
