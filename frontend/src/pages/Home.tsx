import { useEffect, useState } from 'react'
import api from '../api/client'
import JobCard from '../components/JobCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { Job } from '../types'

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Job[]>('/jobs/')
      .then(r => setJobs(r.data))
      .catch(() => setError('Failed to load jobs. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-navy-900 mb-3">
          Find Your Next Role
        </h1>
        <p className="text-slate-500 text-lg max-w-xl mx-auto">
          Upload your resume — our AI screens and ranks candidates in seconds.
          Only the best matches make the shortlist.
        </p>
      </div>

      {loading && <LoadingSpinner message="Loading open positions…" />}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm text-center">
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-lg font-medium text-slate-500">No open positions yet.</p>
          <p className="text-sm mt-1">Check back soon or visit the Recruiter Portal to post one.</p>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <>
          <p className="text-sm text-slate-400 mb-6">{jobs.length} open position{jobs.length !== 1 ? 's' : ''}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
