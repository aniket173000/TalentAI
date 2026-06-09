import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const { pathname } = useLocation()

  const linkClass = (path: string) =>
    `text-sm font-medium transition-colors ${
      pathname.startsWith(path)
        ? 'text-white'
        : 'text-slate-300 hover:text-white'
    }`

  return (
    <nav className="bg-navy-900 border-b border-navy-700 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="text-brand-teal font-bold text-xl tracking-tight">
            Talent<span className="text-brand-blue">AI</span>
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <Link to="/" className={linkClass('/')}>
            Jobs
          </Link>
          <Link to="/recruiter" className={linkClass('/recruiter')}>
            Recruiter Portal
          </Link>
        </div>
      </div>
    </nav>
  )
}
