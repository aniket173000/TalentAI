import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, ActiveMode } from '../context/AuthContext'
import { Avatar, Logo } from './ui'

function initialsOf(name?: string | null): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

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
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-ink focus:ring-accent"
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
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent transition"
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
                  ? 'bg-accent hover:opacity-90'
                  : 'bg-accent hover:opacity-90'
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

// Midnight Terminal nav tokens — applied as CSS-var overrides on the /colleges
// header so the existing Tailwind/inline `var(--…)` styles cascade to dark.
const NAV_DARK = { bg: '#08080B', ink: '#E7E9EE', muted: '#9CA0AB', surface: '#101218', line: '#262932', violet: '#9D7CFF' }
const NAV_DARK_VARS = {
  '--bg': NAV_DARK.bg,
  '--ink': NAV_DARK.ink,
  '--muted': NAV_DARK.muted,
  '--surface': NAV_DARK.surface,
  '--surface-2': NAV_DARK.surface,
  '--line': NAV_DARK.line,
  '--violet': NAV_DARK.violet,
} as React.CSSProperties

// ── Mode toggle pill (shown for dual-mode users) ──────────────────────────────

function ModeSwitcher() {
  const { activeMode, switchMode, isRecruiter: _r, isCandidate: _c } = useAuth()
  const navigate = useNavigate()

  const handleSwitch = (mode: ActiveMode) => {
    switchMode(mode)
    navigate(mode === 'recruiter' ? '/recruiter' : '/', { replace: true })
  }

  const opts: [ActiveMode, string][] = [['candidate', 'Candidate'], ['recruiter', 'Recruiter']]
  return (
    <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--surface-2)', border: '2px solid var(--line)', borderRadius: 12 }}>
      {opts.map(([val, label]) => {
        const active = activeMode === val
        return (
          <button key={val} onClick={() => handleSwitch(val)} style={{
            padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: 'pointer',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.01em', border: 'none',
            background: active ? 'var(--ink)' : 'transparent', color: active ? 'var(--bg)' : 'var(--muted)',
            transition: 'all .15s ease',
          }}>{label}</button>
        )
      })}
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

  const [mobileOpen, setMobileOpen] = useState(false)

  // Midnight Terminal: the Colleges route uses the dark directory theme, so the
  // navbar themes dark there too (grid + detail share the /colleges path).
  const dark = pathname === '/colleges'

  // Close mobile menu whenever the route changes
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const linkClass = (path: string) =>
    `text-sm font-bold transition-colors ${
      pathname === path || (path !== '/' && pathname.startsWith(path))
        ? 'text-ink' : 'text-muted hover:text-ink'
    }`

  const mobileLinkClass = (path: string) =>
    `block py-2.5 px-3 rounded-lg text-sm font-bold transition-colors ${
      pathname === path || (path !== '/' && pathname.startsWith(path))
        ? 'text-ink bg-surface' : 'text-muted hover:text-ink hover:bg-surface'
    }`

  const handleLogout = () => {
    logout()
    setMobileOpen(false)
    navigate('/')
  }

  // For single-mode users: which capability can they add?


  const sub = `${activeMode ?? 'Account'} · Profile`

  return (
    <>
      <header
        className={`sticky top-0 z-40 ${dark ? '' : 'border-b-2 border-ink'}`}
        style={{
          ...(dark ? NAV_DARK_VARS : {}),
          background: dark ? 'rgba(8,8,11,.82)' : 'color-mix(in oklch, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          ...(dark ? { borderBottom: `1px solid ${NAV_DARK.line}` } : {}),
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-5">
          <Link to="/" aria-label="Home" onClick={() => setMobileOpen(false)}><Logo dark={dark} /></Link>

          {/* Desktop nav — hidden on mobile */}
          <nav className="hidden md:flex items-center gap-5 ml-2">
            <Link to="/jobs" className={linkClass('/jobs')}>Jobs</Link>
            <Link to="/colleges" className={linkClass('/colleges')}>Colleges</Link>
            <Link to="/feedback" className={linkClass('/feedback')}>Feedback</Link>
            {!(isRecruiter && !isCandidate) && (
              <Link to="/referrals" className={linkClass('/referrals')}>Referrals</Link>
            )}
            {isCandidate && (
              <Link to="/dashboard" className={linkClass('/dashboard')}>My Applications</Link>
            )}
            {isRecruiter && (
              <Link to="/recruiter" className={linkClass('/recruiter')}>Recruiter</Link>
            )}
            {isRecruiter && (
              <Link to="/recruiter/rank-candidates" className={linkClass('/recruiter/rank-candidates')}>Rank</Link>
            )}
            {user?.is_admin && (
              <Link to="/admin" className={linkClass('/admin')}>Admin</Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <>
                {isDualMode && <div className="hidden sm:block"><ModeSwitcher /></div>}

                <Link
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 hover:opacity-90 transition-opacity"
                  style={{ padding: '5px 10px 5px 6px', background: 'var(--surface)', border: '2px solid var(--line)', borderRadius: 99 }}
                >
                  <Avatar initials={initialsOf(user?.full_name)} color="violet" size={28} />
                  <div style={{ lineHeight: 1.15 }} className="hidden sm:block">
                    <div className="text-ink" style={{ fontSize: 13, fontWeight: 800 }}>{user?.full_name}</div>
                    <div className="text-muted capitalize" style={{ fontSize: 11, fontWeight: 600 }}>{sub}</div>
                  </div>
                </Link>

                <button
                  onClick={handleLogout}
                  className="hidden sm:block text-xs font-bold text-muted hover:text-ink rounded-lg px-3 py-1.5 transition-colors"
                  style={{ background: 'var(--surface-2)', border: '2px solid var(--line)' }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block text-sm font-bold text-muted hover:text-ink transition-colors" onClick={() => setMobileOpen(false)}>
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-extrabold rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 transition-transform active:translate-x-0.5 active:translate-y-0.5"
                  style={{
                    background: 'var(--violet)',
                    color: dark ? '#08080B' : '#fff',
                    border: dark ? '1px solid var(--violet)' : '2px solid var(--ink)',
                    boxShadow: dark ? `0 0 22px ${NAV_DARK.violet}80` : '3px 3px 0 var(--ink)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  Register
                </Link>
              </>
            )}

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--muted)', background: mobileOpen ? 'var(--surface)' : 'transparent' }}
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? (
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div
            className="md:hidden px-4 pb-4 pt-1 flex flex-col gap-1"
            style={{ borderTop: '1px solid var(--line)', background: dark ? 'rgba(8,8,11,.96)' : 'var(--bg)' }}
          >
            <Link to="/jobs" className={mobileLinkClass('/jobs')} onClick={() => setMobileOpen(false)}>Jobs</Link>
            <Link to="/colleges" className={mobileLinkClass('/colleges')} onClick={() => setMobileOpen(false)}>Colleges</Link>
            <Link to="/feedback" className={mobileLinkClass('/feedback')} onClick={() => setMobileOpen(false)}>Feedback</Link>
            {!(isRecruiter && !isCandidate) && (
              <Link to="/referrals" className={mobileLinkClass('/referrals')} onClick={() => setMobileOpen(false)}>Referrals</Link>
            )}
            {isCandidate && (
              <Link to="/dashboard" className={mobileLinkClass('/dashboard')} onClick={() => setMobileOpen(false)}>My Applications</Link>
            )}
            {isRecruiter && (
              <Link to="/recruiter" className={mobileLinkClass('/recruiter')} onClick={() => setMobileOpen(false)}>Recruiter</Link>
            )}
            {isRecruiter && (
              <Link to="/recruiter/rank-candidates" className={mobileLinkClass('/recruiter/rank-candidates')} onClick={() => setMobileOpen(false)}>Rank Candidates</Link>
            )}
            {user?.is_admin && (
              <Link to="/admin" className={mobileLinkClass('/admin')} onClick={() => setMobileOpen(false)}>Admin</Link>
            )}
            {isDualMode && (
              <div className="pt-2 pb-1"><ModeSwitcher /></div>
            )}
            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                className="mt-2 text-left py-2.5 px-3 rounded-lg text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
              >
                Sign out
              </button>
            ) : (
              <Link to="/login" className="mt-1 block py-2.5 px-3 rounded-lg text-sm font-bold text-muted hover:text-ink hover:bg-surface transition-colors" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
            )}
          </div>
        )}
      </header>

      {/* Add-capability modal */}
    </>
  )
}
