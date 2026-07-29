import React, { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { RouteRecord } from 'vite-react-ssg'
import CandidateOnboarding from './components/CandidateOnboarding'
import RecruiterOnboarding from './components/RecruiterOnboarding'
import CandidatesCorpus from './pages/CandidatesCorpus'
import RankCandidates from './pages/RankCandidates'
import CandidateRankingDetail from './pages/CandidateRankingDetail'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import Apply from './pages/Apply'
import ApplicationResult from './pages/ApplicationResult'
import CandidateDashboard from './pages/CandidateDashboard'
import Colleges from './pages/Colleges'
import CompanyReferralDetail from './pages/CompanyReferralDetail'
import CompanyReferrals from './pages/CompanyReferrals'
import CreateJob from './pages/CreateJob'
import CreateReferralPost from './pages/CreateReferralPost'
import EditJob from './pages/EditJob'
import Home from './pages/Home'
import Landing from './pages/Landing'
import JobDetail from './pages/JobDetail'
import ApplicationStatus from './pages/ApplicationStatus'
import LinkedInCallback from './pages/LinkedInCallback'
import GoogleCallback from './pages/GoogleCallback'
import Login from './pages/Login'
import Profile from './pages/Profile'
import RecruiterPortal from './pages/RecruiterPortal'
import ReferralPostPage from './pages/ReferralPostPage'
import ReferrerDashboard from './pages/ReferrerDashboard'
import Register from './pages/Register'
import Feedback from './pages/Feedback'
import AdminPanel from './pages/AdminPanel'
import JobAssignments from './pages/JobAssignments'
import ColdEmail from './pages/ColdEmail'
import FluencyReportPage from './pages/FluencyReportPage'
import AssignmentPortal from './pages/AssignmentPortal'
import TeamPulseDashboard from './pages/TeamPulseDashboard'
import PulsePortal from './pages/PulsePortal'
import PulseLanding from './pages/PulseLanding'
import PulseAdmin from './pages/PulseAdmin'

// Skipping hides the modal for the current browser session only.
// On next login (new session) it reappears until the form is actually completed.
const SESSION_SKIP_KEY = 'onboarding_skipped_this_session'

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, isCandidate, isRecruiter, refreshUser } = useAuth()
  // SSR-safe: sessionStorage doesn't exist during static prerender (Node). Guard
  // the initial read so vite-react-ssg can render this shell server-side.
  const [skippedThisSession, setSkippedThisSession] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(SESSION_SKIP_KEY) === '1'
  )

  const needsOnboarding =
    isCandidate &&
    user != null &&
    !user.onboarding_completed &&
    !skippedThisSession

  const needsRecruiterOnboarding =
    isRecruiter &&
    user != null &&
    !user.recruiter_onboarding_completed &&
    !skippedThisSession

  const handleComplete = async () => {
    // Refresh user so onboarding_completed flips to true — permanently suppresses modal
    await refreshUser()
  }

  const handleSkip = () => {
    // Session-only: modal will reappear next login
    sessionStorage.setItem(SESSION_SKIP_KEY, '1')
    setSkippedThisSession(true)
  }

  return (
    <>
      {children}
      {needsOnboarding && (
        <CandidateOnboarding onComplete={handleComplete} onSkip={handleSkip} />
      )}
      {!needsOnboarding && needsRecruiterOnboarding && (
        <RecruiterOnboarding onComplete={handleComplete} onSkip={handleSkip} />
      )}
    </>
  )
}

// The referral portal is a candidate-facing feature. Recruiters (users with
// recruiter capability who are NOT also candidates) are redirected away.
// Anonymous visitors and dual-mode users keep access.
function ReferralGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.is_recruiter && !user.is_candidate) {
    return <Navigate to="/recruiter" replace />
  }
  return <>{children}</>
}

function RootRoute() {
  const { user } = useAuth()
  return user ? <Home /> : <Landing />
}

// Admin-only route guard — redirects non-admins (and logged-out users) home.
function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

// App chrome shared by every route. Renders the matched route via <Outlet/>.
function AppShell() {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  const { user } = useAuth()
  const showNavbar = !isLanding || !!user

  return (
    <OnboardingGate>
      <div className={`min-h-screen flex flex-col${isLanding && !user ? '' : ' bg-slate-50'}`}>
        {showNavbar && <Navbar />}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </OnboardingGate>
  )
}

// Root layout element: providers + shell. Everything routed renders inside this.
export function Layout() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

// Route table in data-router form so vite-react-ssg can statically render the
// public marketing pages at build time. Paths are relative to the "/" layout.
export const routes: RouteRecord[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      // Public
      { index: true, element: <RootRoute /> },
      { path: 'jobs', element: <Home /> },
      { path: 'colleges', element: <Colleges /> },
      { path: 'jobs/:jobId', element: <JobDetail /> },
      { path: 'result', element: <ApplicationResult /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'auth/linkedin/callback', element: <LinkedInCallback /> },
      { path: 'auth/google/callback', element: <GoogleCallback /> },
      { path: 'status/:token', element: <ApplicationStatus /> },
      { path: 'assignment/:token', element: <AssignmentPortal /> },
      { path: 'pulse', element: <PulseLanding /> },
      { path: 'pulse/portal/:token', element: <PulsePortal /> },
      { path: 'feedback', element: <Feedback /> },

      // Referrals — candidate-facing discovery (recruiters blocked)
      { path: 'referrals', element: <ReferralGate><CompanyReferrals /></ReferralGate> },
      { path: 'referrals/company/:companyName', element: <ReferralGate><CompanyReferralDetail /></ReferralGate> },
      { path: 'referrals/:slug', element: <ReferralGate><ReferralPostPage /></ReferralGate> },

      // Candidate-only
      { path: 'jobs/:jobId/apply', element: <ProtectedRoute requires="candidate"><Apply /></ProtectedRoute> },
      { path: 'dashboard', element: <ProtectedRoute requires="candidate"><CandidateDashboard /></ProtectedRoute> },
      { path: 'cold-email', element: <ProtectedRoute requires="candidate"><ColdEmail /></ProtectedRoute> },
      { path: 'referrals/create', element: <ProtectedRoute requires="candidate"><CreateReferralPost /></ProtectedRoute> },
      { path: 'referrals/dashboard', element: <ProtectedRoute requires="candidate"><ReferrerDashboard /></ProtectedRoute> },
      { path: 'referrals/dashboard/:postId', element: <ProtectedRoute requires="candidate"><ReferrerDashboard /></ProtectedRoute> },

      // Profile — both roles
      { path: 'profile', element: <ProtectedRoute><Profile /></ProtectedRoute> },

      // Recruiter-only
      { path: 'recruiter', element: <ProtectedRoute requires="recruiter"><RecruiterPortal /></ProtectedRoute> },

      // Pulse dashboard — decoupled from hiring: any signed-in user, gated on
      // early-access inside the component.
      { path: 'pulse/dashboard', element: <ProtectedRoute><TeamPulseDashboard /></ProtectedRoute> },
      { path: 'pulse/admin', element: <ProtectedRoute><PulseAdmin /></ProtectedRoute> },

      { path: 'recruiter/jobs/create', element: <ProtectedRoute requires="recruiter"><CreateJob /></ProtectedRoute> },
      { path: 'recruiter/jobs/:jobId/edit', element: <ProtectedRoute requires="recruiter"><EditJob /></ProtectedRoute> },
      { path: 'recruiter/candidates-corpus', element: <ProtectedRoute requires="recruiter"><CandidatesCorpus /></ProtectedRoute> },
      { path: 'recruiter/rank-candidates', element: <ProtectedRoute requires="recruiter"><RankCandidates /></ProtectedRoute> },
      { path: 'recruiter/jobs/:jobId/assignments', element: <ProtectedRoute requires="recruiter"><JobAssignments /></ProtectedRoute> },
      { path: 'recruiter/submissions/:submissionId/report', element: <ProtectedRoute requires="recruiter"><FluencyReportPage /></ProtectedRoute> },
      { path: 'recruiter/candidates/:candidateId', element: <ProtectedRoute requires="recruiter"><CandidateRankingDetail /></ProtectedRoute> },

      { path: 'admin', element: <AdminGate><AdminPanel /></AdminGate> },

      // Unknown paths → the public job board instead of a blank screen
      { path: '*', element: <Navigate to="/jobs" replace /> },
    ],
  },
]
