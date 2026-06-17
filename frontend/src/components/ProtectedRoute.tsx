import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, ActiveMode } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

interface Props {
  children: React.ReactNode
  /** If set, the user must have this capability extension (regardless of active mode). */
  requires?: ActiveMode
}

export default function ProtectedRoute({ children, requires }: Props) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner message="Loading…" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (requires === 'recruiter' && !user.is_recruiter) {
    return <Navigate to="/" replace />
  }

  if (requires === 'candidate' && !user.is_candidate) {
    return <Navigate to="/recruiter" replace />
  }

  return <>{children}</>
}
