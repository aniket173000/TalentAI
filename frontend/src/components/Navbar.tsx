import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated, isRecruiter, isCandidate, logout } = useAuth()

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

          {isCandidate && (
            <Link to="/dashboard" className={linkClass('/dashboard')}>
              My Applications
            </Link>
          )}

          {isRecruiter && (
            <Link to="/recruiter" className={linkClass('/recruiter')}>
              Recruiter Portal
            </Link>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-3 border-l border-navy-700 pl-6">
              <div className="text-right hidden sm:block">
                <p className="text-white text-xs font-semibold leading-tight">{user?.full_name}</p>
                <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
              </div>
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
