import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Apply from './pages/Apply'
import ApplicationResult from './pages/ApplicationResult'
import Home from './pages/Home'
import JobDetail from './pages/JobDetail'
import RecruiterPortal from './pages/RecruiterPortal'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jobs/:jobId" element={<JobDetail />} />
            <Route path="/jobs/:jobId/apply" element={<Apply />} />
            <Route path="/result" element={<ApplicationResult />} />
            <Route path="/recruiter" element={<RecruiterPortal />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
