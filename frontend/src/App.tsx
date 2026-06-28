import React, { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import CandidateOnboarding from './components/CandidateOnboarding'
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

// Skipping hides the modal for the current browser session only.
// On next login (new session) it reappears until the form is actually completed.
const SESSION_SKIP_KEY = 'onboarding_skipped_this_session'

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, isCandidate, refreshUser } = useAuth()
  const [skippedThisSession, setSkippedThisSession] = useState(
    () => sessionStorage.getItem(SESSION_SKIP_KEY) === '1'
  )

  const needsOnboarding =
    isCandidate &&
    user != null &&
    !user.onboarding_completed &&
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
          <Routes>
            {/* Public */}
            <Route path="/" element={<RootRoute />} />
                  <Route path="/colleges" element={<Colleges />} />
                  <Route path="/jobs/:jobId" element={<JobDetail />} />
                  <Route path="/result" element={<ApplicationResult />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/auth/linkedin/callback" element={<LinkedInCallback />} />
                  <Route path="/auth/google/callback" element={<GoogleCallback />} />
                  <Route path="/status/:token" element={<ApplicationStatus />} />
                  <Route path="/feedback" element={<Feedback />} />

                  {/* Referrals — candidate-facing discovery (recruiters blocked) */}
                  <Route path="/referrals" element={<ReferralGate><CompanyReferrals /></ReferralGate>} />
                  <Route path="/referrals/company/:companyName" element={<ReferralGate><CompanyReferralDetail /></ReferralGate>} />
                  <Route path="/referrals/:slug" element={<ReferralGate><ReferralPostPage /></ReferralGate>} />

                  {/* Candidate-only */}
                  <Route
                    path="/jobs/:jobId/apply"
                    element={
                      <ProtectedRoute requires="candidate">
                        <Apply />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute requires="candidate">
                        <CandidateDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Referrals — candidate-only (create/dashboard) */}
                  <Route
                    path="/referrals/create"
                    element={
                      <ProtectedRoute requires="candidate">
                        <CreateReferralPost />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/referrals/dashboard"
                    element={
                      <ProtectedRoute requires="candidate">
                        <ReferrerDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/referrals/dashboard/:postId"
                    element={
                      <ProtectedRoute requires="candidate">
                        <ReferrerDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Profile — both roles */}
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />

                  {/* Recruiter-only */}
                  <Route
                    path="/recruiter"
                    element={
                      <ProtectedRoute requires="recruiter">
                        <RecruiterPortal />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/create"
                    element={
                      <ProtectedRoute requires="recruiter">
                        <CreateJob />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/jobs/:jobId/edit"
                    element={
                      <ProtectedRoute requires="recruiter">
                        <EditJob />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/candidates-corpus"
                    element={
                      <ProtectedRoute requires="recruiter">
                        <CandidatesCorpus />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/rank-candidates"
                    element={
                      <ProtectedRoute requires="recruiter">
                        <RankCandidates />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/recruiter/candidates/:candidateId"
                    element={
                      <ProtectedRoute requires="recruiter">
                        <CandidateRankingDetail />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
        </main>
      </div>
    </OnboardingGate>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}
