import { Link } from 'react-router-dom'
import { Job } from '../types'

interface Props {
  job: Job
}

export default function JobCard({ job }: Props) {
  const fillPct = Math.round((job.active_applications / job.max_count) * 100)
  const spotsLeft = job.max_count - job.active_applications

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md hover:border-blue-200 transition-all duration-200 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-lg leading-snug truncate">
            {job.title}
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            {job.company} · {job.location}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            spotsLeft === 0
              ? 'bg-red-50 text-red-600'
              : spotsLeft <= 3
              ? 'bg-amber-50 text-amber-600'
              : 'bg-emerald-50 text-emerald-600'
          }`}
        >
          {spotsLeft === 0 ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
        </span>
      </div>

      {/* Pool fill bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{job.active_applications} / {job.max_count} candidates</span>
          <span>{fillPct}% filled</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-blue rounded-full transition-all duration-500"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Min. match: {job.min_match_score}%
        </span>
        <Link
          to={`/jobs/${job.id}`}
          className="text-sm font-semibold text-brand-blue hover:underline"
        >
          View & Apply →
        </Link>
      </div>
    </div>
  )
}
