import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import JDFormatter from '../components/JDFormatter'
import LoadingSpinner from '../components/LoadingSpinner'
import PracticeApplyModal from '../components/PracticeApplyModal'
import { useAuth } from '../context/AuthContext'
import { useStudentMode } from '../context/StudentModeContext'
import { Application, Job } from '../types'

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const { isRecruiter } = useAuth()
  const { studentMode } = useStudentMode()
  const [job, setJob] = useState<Job | null>(null)
  const [leaderboard, setLeaderboard] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [practiceOpen, setPracticeOpen] = useState(false)

  useEffect(() => {
    const isNumeric = /^\d+$/.test(jobId ?? '')
    const jobFetch = isNumeric
      ? api.get<Job>(`/jobs/${jobId}`)
      : api.get<Job>(`/jobs/slug/${jobId}`)

    jobFetch
      .then(jobRes => {
        setJob(jobRes.data)
        return api.get<Application[]>(`/applications/job/${jobRes.data.id}`)
      })
      .then(appRes => setLeaderboard(appRes.data))
      .catch(() => setError('Failed to load job details.'))
      .finally(() => setLoading(false))
  }, [jobId])

  if (loading) return <LoadingSpinner message="Loading job…" />
  if (error || !job) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center text-red-500">{error || 'Job not found'}</div>
  )

  const spotsLeft = job.max_count - job.active_applications

  return (
    <>
    {practiceOpen && job && (
      <PracticeApplyModal
        jobId={job.id}
        jobTitle={job.title}
        company={job.company}
        isFresherFriendly={job.is_fresher_friendly}
        onClose={() => setPracticeOpen(false)}
      />
    )}
    <div className="max-w-4xl mx-auto px-4 py-12 animate-fade-in">
      {/* Header */}
      <div className="bg-navy-900 text-white rounded-2xl p-8 mb-8">
        <p className="text-brand-teal text-sm font-semibold uppercase tracking-wider mb-2">
          {job.company}
        </p>
        <h1 className="text-3xl font-extrabold mb-2">{job.title}</h1>
        <p className="text-slate-300 text-sm mb-6">{job.location}</p>

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="bg-navy-800 rounded-lg px-4 py-2">
            <span className="text-slate-400">Spots left</span>
            <span className={`ml-2 font-bold ${spotsLeft === 0 ? 'text-red-400' : 'text-brand-teal'}`}>
              {spotsLeft} / {job.max_count}
            </span>
          </div>
          <div className="bg-navy-800 rounded-lg px-4 py-2">
            <span className="text-slate-400">Min. match score</span>
            <span className="ml-2 font-bold text-brand-blue">{job.min_match_score}%</span>
          </div>
          <div className="bg-navy-800 rounded-lg px-4 py-2">
            <span className="text-slate-400">Applicants</span>
            <span className="ml-2 font-bold text-white">{job.active_applications}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* JD */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-800 text-lg mb-5">Job Description</h2>
            <JDFormatter text={job.jd_text} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Apply CTA — hidden for recruiters */}
          {!isRecruiter && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
              <p className="text-slate-500 text-sm text-center">
                {spotsLeft > 0
                  ? 'AI screens your resume instantly. Score ≥ 80% to enter the pool.'
                  : 'The pool is full — a high-scoring resume can still displace the lowest-ranked candidate.'}
              </p>
              <Link
                to={`/jobs/${job.id}/apply`}
                className="block w-full bg-brand-blue hover:bg-blue-600 text-white font-semibold rounded-lg py-3 text-center transition-colors"
              >
                Apply Now
              </Link>

              {/* Practice Apply — always visible for candidates, glows in student mode */}
              <button
                onClick={() => setPracticeOpen(true)}
                className={`block w-full font-semibold rounded-lg py-3 text-sm transition-all ${
                  studentMode
                    ? 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white shadow-md shadow-violet-200'
                    : 'bg-slate-50 hover:bg-violet-50 text-violet-600 border border-violet-200 hover:border-violet-400'
                }`}
              >
                ✨ Test My Chances
              </button>

              {job.is_fresher_friendly && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Project-First scoring active
                </div>
              )}
            </div>
          )}

          {/* Current leaderboard */}
          {leaderboard.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-bold text-slate-800 mb-4">Current Top Candidates</h3>
              <div className="space-y-3">
                {leaderboard.slice(0, 5).map(app => (
                  <div key={app.id} className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {app.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {app.candidate_name.split(' ')[0]} {app.candidate_name.split(' ')[1]?.[0]}.
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="h-1 flex-1 bg-slate-100 rounded-full">
                          <div
                            className="h-full bg-brand-blue rounded-full"
                            style={{ width: `${app.match_score}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{app.match_score.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
