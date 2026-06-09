import { Link, useLocation } from 'react-router-dom'
import ScoreRing from '../components/ScoreRing'
import { ApplyResult } from '../types'

interface LocationState {
  result: ApplyResult
  jobTitle: string
}

export default function ApplicationResult() {
  const location = useLocation()
  const state = location.state as LocationState | null

  if (!state?.result) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">No result to display.</p>
        <Link to="/" className="mt-4 inline-block text-brand-blue hover:underline text-sm">
          ← Back to jobs
        </Link>
      </div>
    )
  }

  const { result, jobTitle } = state
  const accepted = result.status === 'accepted'

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
      {/* Status banner */}
      <div className={`rounded-2xl p-8 mb-8 text-center ${accepted ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex justify-center mb-4">
          <ScoreRing score={result.match_score} />
        </div>
        <h1 className={`text-2xl font-extrabold mb-2 ${accepted ? 'text-emerald-700' : 'text-red-700'}`}>
          {accepted ? '🎉 Application Accepted!' : '❌ Not Shortlisted'}
        </h1>
        <p className="text-slate-600 text-sm">{result.message}</p>

        {accepted && result.rank && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white border border-emerald-200 rounded-full px-4 py-1.5 text-sm">
            <span className="font-bold text-emerald-600">Rank #{result.rank}</span>
            <span className="text-slate-400">out of {result.total_in_pool} candidates</span>
          </div>
        )}
        {accepted && result.displaced && (
          <p className="mt-2 text-xs text-emerald-600 font-medium">
            You displaced the previous lowest-ranked candidate.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {/* Strengths */}
        {result.strengths && result.strengths.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="text-emerald-500">✓</span> Your Strengths
            </h2>
            <ul className="space-y-2">
              {result.strengths.map((s, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI summary */}
        {result.summary && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span>🤖</span> AI Assessment
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">{result.summary}</p>
          </div>
        )}

        {/* Gaps */}
        {!accepted && result.gaps && result.gaps.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="text-amber-500">⚠</span> Identified Gaps
            </h2>
            <ul className="space-y-2">
              {result.gaps.map((g, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvement tips */}
        {!accepted && result.improvement_suggestions && result.improvement_suggestions.length > 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="text-brand-blue">💡</span> How to Strengthen Your Resume
            </h2>
            <ul className="space-y-3">
              {result.improvement_suggestions.map((tip, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          to={`/`}
          className="flex-1 text-center border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-lg py-3 text-sm transition-colors"
        >
          Browse More Jobs
        </Link>
        {accepted && (
          <div className="flex-1 text-center bg-emerald-100 text-emerald-700 font-semibold rounded-lg py-3 text-sm">
            Check your email for next steps
          </div>
        )}
      </div>
    </div>
  )
}
