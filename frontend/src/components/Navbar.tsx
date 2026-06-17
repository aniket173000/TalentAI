import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStudentMode } from '../context/StudentModeContext'

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated, isRecruiter, isCandidate, logout, switchRole, hasLinkedRole, activeRole } = useAuth()
  const { studentMode, toggleStudentMode } = useStudentMode()

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors ${
      pathname.startsWith(path)
        ? 'text-white'
        : 'text-slate-300 hover:text-white'
    }`

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleSwitchRole = async (role: 'recruiter' | 'candidate') => {
    const success = await switchRole(role)
    if (success) {
      navigate(role === 'recruiter' ? '/recruiter' : '/', { replace: true })
    } else {
      // Token for that role doesn't exist or expired — go log in with it
      navigate(`/login?role=${role}`)
    }
  }

  const otherRole = isRecruiter ? 'candidate' : 'recruiter'
  const otherRoleLabel = isRecruiter ? 'Candidate' : 'Recruiter'
  const otherRoleIcon = isRecruiter ? '🎯' : '💼'

  return (
    <nav className="bg-navy-900 border-b border-navy-700 sticky top-0 z-50">
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
              🎓 {studentMode ? 'Student Mode' : 'Student Mode'}
            </button>
          )}

          {isRecruiter && (
            <Link to="/recruiter" className={linkClass('/recruiter')}>
              Recruiter Portal
            </Link>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-3 border-l border-navy-700 pl-6">
              <Link to="/profile" className="text-right hidden sm:block hover:opacity-80 transition-opacity">
                <p className="text-white text-xs font-semibold leading-tight">{user?.full_name}</p>
                <p className="text-slate-400 text-xs capitalize">{activeRole} · Profile</p>
              </Link>

              {/* Switch role button — shown when the other role has a stored token */}
              {hasLinkedRole(otherRole) ? (
                <button
                  onClick={() => handleSwitchRole(otherRole)}
                  title={`Switch to ${otherRoleLabel} dashboard`}
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:text-white bg-navy-800 hover:bg-navy-700 border border-navy-600 rounded-lg px-3 py-1.5 transition-colors"
                >
                  {otherRoleIcon} Switch to {otherRoleLabel}
                </button>
              ) : (
                <button
                  onClick={() => navigate(`/login?role=${otherRole}`)}
                  title={`Also sign in as ${otherRoleLabel}`}
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-navy-800 hover:bg-navy-700 border border-navy-600 rounded-lg px-3 py-1.5 transition-colors"
                >
                  + {otherRoleLabel}
                </button>
              )}

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
  )
}
