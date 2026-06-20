import React, { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import CandidateOnboarding from './components/CandidateOnboarding'
import CandidatesCorpus from './pages/CandidatesCorpus'
import RankCandidates from './pages/RankCandidates'
import CandidateRankingDetail from './pages/CandidateRankingDetail'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { StudentModeProvider } from './context/StudentModeContext'
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
import JobDetail from './pages/JobDetail'
import ApplicationStatus from './pages/ApplicationStatus'
import LinkedInCallback from './pages/LinkedInCallback'
import Login from './pages/Login'
import Profile from './pages/Profile'
import RecruiterPortal from './pages/RecruiterPortal'
import ReferralPostPage from './pages/ReferralPostPage'
import ReferrerDashboard from './pages/ReferrerDashboard'
import Register from './pages/Register'

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StudentModeProvider>
          <OnboardingGate>
            <div className="min-h-screen bg-slate-50 flex flex-col">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  {/* Public */}
                  <Route path="/" element={<Home />} />
                  <Route path="/colleges" element={<Colleges />} />
                  <Route path="/jobs/:jobId" element={<JobDetail />} />
                  <Route path="/result" element={<ApplicationResult />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/auth/linkedin/callback" element={<LinkedInCallback />} />
                  <Route path="/status/:token" element={<ApplicationStatus />} />

                  {/* Referrals — public discovery */}
                  <Route path="/referrals" element={<CompanyReferrals />} />
                  <Route path="/referrals/company/:companyName" element={<CompanyReferralDetail />} />
                  <Route path="/referrals/:slug" element={<ReferralPostPage />} />

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

                  {/* Referrals — protected (any logged-in user can create/dashboard) */}
                  <Route
                    path="/referrals/create"
                    element={
                      <ProtectedRoute>
                        <CreateReferralPost />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/referrals/dashboard"
                    element={
                      <ProtectedRoute>
                        <ReferrerDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/referrals/dashboard/:postId"
                    element={
                      <ProtectedRoute>
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
        </StudentModeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
