import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import Apply from './pages/Apply'
import ApplicationResult from './pages/ApplicationResult'
import CandidateDashboard from './pages/CandidateDashboard'
import Home from './pages/Home'
import JobDetail from './pages/JobDetail'
import Login from './pages/Login'
import RecruiterPortal from './pages/RecruiterPortal'
import Register from './pages/Register'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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

              {/* Recruiter-only */}
              <Route
                path="/recruiter"
                element={
                  <ProtectedRoute role="recruiter">
                    <RecruiterPortal />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
