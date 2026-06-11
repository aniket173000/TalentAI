import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { CandidateStatus } from '../types'

interface StatusData {
  candidate_status: CandidateStatus
  job_title: string
  company: string
  applied_at: string
  score_tier: string | null
  status_feedback: string | null
}

const STEPS: { key: CandidateStatus; label: string; icon: string }[] = [
  { key: 'pool_accepted',       label: 'Shortlisted',     icon: '⭐' },
  { key: 'under_review',        label: 'Under Review',    icon: '🔍' },
  { key: 'interview_scheduled', label: 'Interview Stage', icon: '🎤' },
  { key: 'offer_extended',      label: 'Offer Extended',  icon: '🎉' },
]

// Ordered for progress calculation
const STEP_ORDER: CandidateStatus[] = [
  'pool_accepted', 'under_review', 'interview_scheduled', 'offer_extended',
]

const STATUS_META: Record<string, { color: string; bg: string; border: string; description: string }> = {
  pool_accepted: {
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    description: 'Congratulations! Your application has been shortlisted. A recruiter will review your profile shortly.',
  },
  under_review: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description: 'Your profile is currently being reviewed by our recruitment team.',
  },
  interview_scheduled: {
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    description: 'You have been selected for the interview stage. Our team will reach out with the details.',
  },
  offer_extended: {
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    description: 'An offer has been extended to you! Please check your email for the offer details.',
  },
  rejected: {
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    description: 'Thank you for your interest. We have decided not to move forward with your application at this time.',
  },
  interview_rejected: {
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    description: 'Thank you for going through our interview process. Unfortunately, we will not be moving forward after the interview stage.',
  },
}

const TIER_META: Record<string, { label: string; color: string; bg: string }> = {
  'Top 25':  { label: 'Top 25%',  color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200'   },
  'Top 50':  { label: 'Top 50%',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'     },
  'Top 100': { label: 'Top 100%', color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200'   },
}

export default function ApplicationStatus() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }
    api
      .get<StatusData>(`/applications/status/${token}`)
      .then(r => setData(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Application not found</h1>
          <p className="text-slate-500 text-sm mb-6">The link may be invalid or expired.</p>
          <Link to="/" className="text-brand-blue hover:underline text-sm font-medium">← Browse jobs</Link>
        </div>
      </div>
    )
  }

  const isRejected = data.candidate_status === 'rejected'
  const isInterviewRejected = data.candidate_status === 'interview_rejected'
  const showStepper = !isRejected

  // For interview_rejected, pin the stepper at the interview step with a red marker
  const stepperStatus: CandidateStatus = isInterviewRejected ? 'interview_scheduled' : data.candidate_status
  const activeIdx = STEP_ORDER.indexOf(stepperStatus)

  const meta = STATUS_META[data.candidate_status] ?? {
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    description: 'Your application status has been updated.',
  }
  const tier = data.score_tier ? TIER_META[data.score_tier] : null

  const displayLabel = {
    pool_accepted:       'Shortlisted',
    under_review:        'Under Review',
    interview_scheduled: 'Interview Stage',
    offer_extended:      'Offer Extended',
    rejected:            'Not Moving Forward',
    interview_rejected:  'Interview Not Passed',
  }[data.candidate_status] ?? data.candidate_status.replace(/_/g, ' ')

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-slate-500 text-sm font-medium">{data.company}</p>
        <h1 className="text-2xl font-extrabold text-slate-900 mt-1">{data.job_title}</h1>
        <p className="text-xs text-slate-400 mt-1">
          Applied {new Date(data.applied_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Current status card */}
      <div className={`rounded-2xl border ${meta.border} ${meta.bg} p-6 mb-6 text-center`}>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Current Status</p>
        <p className={`text-2xl font-extrabold ${meta.color}`}>{displayLabel}</p>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{meta.description}</p>

        {/* Score tier badge — visible for pool members */}
        {tier && (
          <div className={`inline-flex items-center gap-1.5 mt-4 rounded-full border px-4 py-1.5 text-sm font-bold ${tier.bg} ${tier.color}`}>
            🏆 {tier.label} of candidates
          </div>
        )}
      </div>

      {/* Interview rejection feedback */}
      {isInterviewRejected && data.status_feedback && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Recruiter Feedback</p>
          <p className="text-sm text-slate-700 leading-relaxed">{data.status_feedback}</p>
        </div>
      )}

      {/* Progress timeline */}
      {showStepper && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-5">Application Progress</p>
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const isDone    = i < activeIdx
              const isCurrent = i === activeIdx
              const isFailed  = isCurrent && isInterviewRejected
              const isFuture  = i > activeIdx

              return (
                <div key={step.key} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 shrink-0
                      ${isFailed  ? 'bg-red-500 border-red-500 text-white'
                        : isDone  ? 'bg-emerald-500 border-emerald-500 text-white'
                        : isCurrent ? 'bg-brand-blue border-brand-blue text-white'
                        : 'bg-white border-slate-300 text-slate-300'}`}
                    >
                      {isFailed ? '✕' : isDone ? '✓' : step.icon}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-0.5 h-8 ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                    )}
                  </div>
                  <div className="pt-1 pb-8">
                    <p className={`text-sm font-semibold ${
                      isFailed  ? 'text-red-500'
                        : isFuture  ? 'text-slate-300'
                        : isCurrent ? 'text-brand-blue'
                        : 'text-slate-700'
                    }`}>
                      {isFailed ? 'Interview Not Passed' : step.label}
                    </p>
                    {isCurrent && !isFailed && (
                      <p className="text-xs text-slate-400 mt-0.5">You are here</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-slate-400 mb-6">
        Bookmark this page to check your status anytime — no login required.
      </p>

      <Link
        to="/"
        className="block text-center text-sm text-brand-blue hover:underline font-medium"
      >
        ← Browse more jobs
      </Link>
    </div>
  )
}
