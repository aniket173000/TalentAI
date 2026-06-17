import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, ActiveMode } from '../context/AuthContext'
import { useStudentMode } from '../context/StudentModeContext'

// ── Add-capability modal ──────────────────────────────────────────────────────

interface AddCapabilityModalProps {
  targetMode: ActiveMode
  onClose: () => void
}

function AddCapabilityModal({ targetMode, onClose }: AddCapabilityModalProps) {
  const { addCapability } = useAuth()
  const navigate = useNavigate()
  const isRecruiterMode = targetMode === 'recruiter'

  const [company, setCompany] = useState('')
  const [isThirdParty, setIsThirdParty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isRecruiterMode && !isThirdParty && !company.trim()) {
      setError('Enter your company name or check the third-party option.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await addCapability(targetMode, {
        company: isRecruiterMode && !isThirdParty ? company.trim() : undefined,
        isThirdParty: isRecruiterMode ? isThirdParty : undefined,
      })
      onClose()
      navigate(targetMode === 'recruiter' ? '/recruiter' : '/', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to add capability. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-5 border-b border-slate-100 ${isRecruiterMode ? 'bg-blue-50' : 'bg-teal-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{isRecruiterMode ? '💼' : '🎯'}</span>
              <div>
                <h2 className="font-bold text-slate-900 text-base">
                  Add {isRecruiterMode ? 'Recruiter' : 'Candidate'} Access
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isRecruiterMode
                    ? 'Post jobs and review applicants from your existing account'
                    : 'Apply to jobs and track your applications from your existing account'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isRecruiterMode && (
            <>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isThirdParty}
                  onChange={e => setIsThirdParty(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                />
                <span className="text-sm text-slate-700">
                  <span className="font-semibold">I'm a third-party recruiter</span>
                  <span className="block text-slate-500 mt-0.5 text-xs">
                    I recruit for client companies, not as a direct employee.
                  </span>
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
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
                  />
                </div>
              )}
            </>
          )}

          {!isRecruiterMode && (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
              Your candidate profile will be created instantly. You can upload a resume and
              complete your profile from the dashboard.
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 font-semibold rounded-lg py-2.5 text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 font-semibold rounded-lg py-2.5 text-sm text-white transition-colors disabled:opacity-50 ${
                isRecruiterMode
                  ? 'bg-brand-blue hover:bg-blue-600'
                  : 'bg-brand-teal hover:bg-teal-600'
              }`}
            >
              {loading ? 'Setting up…' : `Enable ${isRecruiterMode ? 'Recruiter' : 'Candidate'} Mode`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Mode toggle pill (shown for dual-mode users) ──────────────────────────────

function ModeSwitcher() {
  const { activeMode, switchMode, isRecruiter: _r, isCandidate: _c } = useAuth()
  const navigate = useNavigate()

  const handleSwitch = (mode: ActiveMode) => {
    switchMode(mode)
    navigate(mode === 'recruiter' ? '/recruiter' : '/', { replace: true })
  }

  return (
    <div className="flex items-center bg-navy-800 border border-navy-600 rounded-full p-0.5 gap-0.5">
      <button
        onClick={() => handleSwitch('candidate')}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-200 ${
          activeMode === 'candidate'
            ? 'bg-brand-teal text-white shadow-sm'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        🎯 Candidate
      </button>
      <button
        onClick={() => handleSwitch('recruiter')}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-200 ${
          activeMode === 'recruiter'
            ? 'bg-brand-blue text-white shadow-sm'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        💼 Recruiter
      </button>
    </div>
  )
}

// ── Main Navbar ───────────────────────────────────────────────────────────────

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const {
    user,
    isAuthenticated,
    isRecruiter,
    isCandidate,
    isDualMode,
    activeMode,
    logout,
  } = useAuth()
  const { studentMode, toggleStudentMode } = useStudentMode()

  const [addModal, setAddModal] = useState<ActiveMode | null>(null)

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors ${
      pathname.startsWith(path) ? 'text-white' : 'text-slate-300 hover:text-white'
    }`

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // For single-mode users: which capability can they add?
  const canAddRecruiter = user?.is_candidate && !user?.is_recruiter
  const canAddCandidate = user?.is_recruiter && !user?.is_candidate

  return (
    <>
      <nav className="bg-navy-900 border-b border-navy-700 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-brand-teal font-bold text-xl tracking-tight">
              Talent<span className="text-brand-blue">AI</span>
            </span>
          </Link>

          <div className="flex items-center gap-6">
            <Link to="/" className={linkClass('/')}>
              Jobs
            </Link>
            <Link to="/colleges" className={linkClass('/colleges')}>
              Colleges
            </Link>
            <Link to="/referrals" className={linkClass('/referrals')}>
              Referrals
            </Link>

            {isCandidate && (
              <Link to="/dashboard" className={linkClass('/dashboard')}>
                My Applications
              </Link>
            )}

            {/* Student mode toggle — visible for candidates and unauthenticated users */}
            {!isRecruiter && (
              <button
                onClick={toggleStudentMode}
                title={studentMode ? 'Student Mode is ON — click to turn off' : 'Switch to Student Mode for readiness roadmaps & practice apply'}
                className={`relative text-xs font-bold px-3.5 py-1.5 rounded-full border transition-all duration-300 ${
                  studentMode
                    ? 'bg-gradient-to-r from-violet-500 to-pink-500 border-transparent text-white shadow-lg shadow-violet-500/40'
                    : 'border-navy-600 text-slate-300 hover:border-violet-400 hover:text-violet-300'
                }`}
              >
                {studentMode && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-navy-900" />
                )}
                🎓 Student Mode
              </button>
            )}

            {isRecruiter && (
              <Link to="/recruiter" className={linkClass('/recruiter')}>
                Recruiter Portal
              </Link>
            )}

            {isAuthenticated ? (
              <div className="flex items-center gap-3 border-l border-navy-700 pl-6">
                {/* ── Dual-mode switcher ─────────────────────────────────────── */}
                {isDualMode && <ModeSwitcher />}

                {/* ── Single-mode: offer to add the other capability ─────────── */}
                {!isDualMode && canAddRecruiter && (
                  <button
                    onClick={() => setAddModal('recruiter')}
                    title="Add recruiter access to post jobs from this account"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-brand-blue border border-dashed border-navy-600 hover:border-brand-blue rounded-lg px-3 py-1.5 transition-colors"
                  >
                    + Recruiter Mode
                  </button>
                )}
                {!isDualMode && canAddCandidate && (
                  <button
                    onClick={() => setAddModal('candidate')}
                    title="Add candidate access to apply to jobs from this account"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-brand-teal border border-dashed border-navy-600 hover:border-brand-teal rounded-lg px-3 py-1.5 transition-colors"
                  >
                    + Candidate Mode
                  </button>
                )}

                {/* ── Profile link ──────────────────────────────────────────── */}
                <Link
                  to="/profile"
                  className="text-right hidden sm:block hover:opacity-80 transition-opacity"
                >
                  <p className="text-white text-xs font-semibold leading-tight">{user?.full_name}</p>
                  <p className="text-slate-400 text-xs capitalize">
                    {isDualMode ? `${activeMode} mode` : activeMode} · Profile
                  </p>
                </Link>

                <button
                  onClick={handleLogout}
                  className="text-xs font-medium text-slate-300 hover:text-white bg-navy-800 hover:bg-navy-700 border border-navy-600 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 border-l border-navy-700 pl-6">
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="text-sm font-semibold bg-brand-blue hover:bg-blue-600 text-white rounded-lg px-4 py-1.5 transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Add-capability modal */}
      {addModal && (
        <AddCapabilityModal
          targetMode={addModal}
          onClose={() => setAddModal(null)}
        />
      )}
    </>
  )
}
