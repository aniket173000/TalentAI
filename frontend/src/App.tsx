import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { StudentModeProvider } from './context/StudentModeContext'
import Apply from './pages/Apply'
import ApplicationResult from './pages/ApplicationResult'
import CandidateDashboard from './pages/CandidateDashboard'
import CreateJob from './pages/CreateJob'
import EditJob from './pages/EditJob'
import Home from './pages/Home'
import JobDetail from './pages/JobDetail'
import ApplicationStatus from './pages/ApplicationStatus'
import LinkedInCallback from './pages/LinkedInCallback'
import Login from './pages/Login'
import Profile from './pages/Profile'
import RecruiterPortal from './pages/RecruiterPortal'
import Register from './pages/Register'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StudentModeProvider>
        <div className="min-h-screen bg-slate-50 flex flex-col">
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public */}
              <Route path="/" element={<Home />} />
              <Route path="/jobs/:jobId" element={<JobDetail />} />
              <Route path="/result" element={<ApplicationResult />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/auth/linkedin/callback" element={<LinkedInCallback />} />
              <Route path="/status/:token" element={<ApplicationStatus />} />

              {/* Candidate-only */}
              <Route
                path="/jobs/:jobId/apply"
                element={
                  <ProtectedRoute role="candidate">
                    <Apply />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute role="candidate">
                    <CandidateDashboard />
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
                  <ProtectedRoute role="recruiter">
                    <RecruiterPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recruiter/jobs/create"
                element={
                  <ProtectedRoute role="recruiter">
                    <CreateJob />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recruiter/jobs/:jobId/edit"
                element={
                  <ProtectedRoute role="recruiter">
                    <EditJob />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
        </StudentModeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
