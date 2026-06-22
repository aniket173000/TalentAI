import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'

interface RankingRow {
  rank: number
  candidate_id: number
  full_name: string | null
  headline: string | null
  final_score: number
  recommendation: string | null
  breakdown: { embed: number; skill: number; keyword: number; rerank: number; llm: number; experience: number }
  llm_strengths: string[]
  llm_risks: string[]
  llm_summary: string | null
}

interface JobOption { id: number; title: string }
type RunState = 'pending' | 'running' | 'done' | 'failed'

const REC_BADGE: Record<string, string> = {
  'Strong Match': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Good Match': 'bg-blue-50 text-blue-700 border-blue-200',
  'Possible Match': 'bg-amber-50 text-amber-700 border-amber-200',
  'Weak Match': 'bg-red-50 text-red-600 border-red-200',
}

function scoreColor(s: number) {
  return s >= 80 ? 'text-emerald-600' : s >= 70 ? 'text-blue-600' : s >= 60 ? 'text-amber-600' : 'text-red-500'
}

export default function RankCandidates() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const [rankings, setRankings] = useState<RankingRow[] | null>(null)
  const [phase, setPhase] = useState<'' | RunState>('')
  const [rankedToday, setRankedToday] = useState(false)
  const [rankedAt, setRankedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.get<{ jobs: JobOption[] }>('/jobs/my', { params: { per_page: 100 } })
      .then(r => setJobs(r.data.jobs)).catch(() => setJobs([]))
  }, [])
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  const loadResults = useCallback((jid: number) => {
    api.get<{ rankings: RankingRow[] }>('/search/rankings', { params: { job_id: jid } })
      .then(r => setRankings(r.data.rankings)).catch(() => setRankings([]))
  }, [])

  const poll = useCallback((runId: number, jid: number) => {
    api.get<{ status: RunState; error: string | null }>(`/search/runs/${runId}`)
      .then(r => {
        setPhase(r.data.status)
        if (r.data.status === 'done') {
          setRankedToday(true); setRankedAt(new Date().toISOString()); loadResults(jid)
        } else if (r.data.status === 'failed') {
          setError(r.data.error || 'Ranking run failed.')
        } else {
          pollRef.current = setTimeout(() => poll(runId, jid), 2500)
        }
      })
      .catch(() => { pollRef.current = setTimeout(() => poll(runId, jid), 2500) })
  }, [loadResults])

  // On job change: show today's cached ranking instantly, resume an in-progress run, or offer to rank.
  useEffect(() => {
    setRankings(null); setPhase(''); setRankedToday(false); setRankedAt(null); setError('')
    if (pollRef.current) clearTimeout(pollRef.current)
    if (!jobId) return
    api.get<{ run_id: number | null; status: string; ranked_today: boolean; ranked_at: string | null }>(
      '/search/runs/latest', { params: { job_id: jobId } },
    ).then(r => {
      const d = r.data
      if (d.status === 'done' && d.ranked_today) {
        setRankedToday(true); setRankedAt(d.ranked_at); loadResults(jobId as number)
      } else if (d.run_id && (d.status === 'pending' || d.status === 'running')) {
        setPhase(d.status as RunState); poll(d.run_id, jobId as number)
      }
    }).catch(() => {})
  }, [jobId, loadResults, poll])

  const runFunnel = () => {
    if (!jobId) return
    setError(''); setRankings(null); setPhase('pending')
    api.post<{ run_id: number; status: RunState; cached: boolean; ranked_at: string | null }>(
      '/search/candidates/evaluate', null, { params: { job_id: jobId, eval_n: 10 } },
    ).then(r => {
      const d = r.data
      if (d.status === 'done') {           // cached — ranked earlier today
        setRankedToday(true); setRankedAt(d.ranked_at); setPhase('done'); loadResults(jobId as number)
      } else {
        poll(d.run_id, jobId as number)
      }
    }).catch((err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Could not start ranking.'); setPhase('')
    })
  }

  const inProgress = phase === 'pending' || phase === 'running'

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Rank Candidates</h1>
      <p className="text-slate-500 text-sm mb-6">
        Pick a job and rank the entire candidate base against it: retrieve → rerank → LLM-evaluate.
        Each role can be ranked <strong>once per day</strong> — results are cached and shown instantly on return.
      </p>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Job</label>
          <select
            value={jobId}
            onChange={e => setJobId(e.target.value ? Number(e.target.value) : '')}
            disabled={inProgress}
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white disabled:opacity-50"
          >
            <option value="">Select a job…</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <button
          onClick={runFunnel}
          disabled={!jobId || inProgress || rankedToday}
          className="bg-brand-blue hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl disabled:opacity-40"
          title={rankedToday ? 'Already ranked today — next rank available tomorrow' : ''}
        >
          {inProgress ? 'Ranking…' : rankedToday ? 'Ranked today' : 'Rank candidates'}
        </button>
      </div>

      {rankedToday && rankings && (
        <div className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-4 py-2.5 mb-6">
          ✓ Ranked today{rankedAt ? ` at ${new Date(rankedAt).toLocaleTimeString()}` : ''} — showing cached results.
          The next rank for this role is available tomorrow.
        </div>
      )}

      {error && (
        <div className="text-sm bg-red-50 text-red-600 border border-red-200 rounded-xl px-4 py-2.5 mb-6">{error}</div>
      )}

      {inProgress && (
        <div className="py-8">
          <LoadingSpinner message="Running the funnel — retrieve → rerank → LLM evaluation…" />
          <p className="text-center text-xs text-slate-400 mt-2">Runs in the background; results are cached for the day once done.</p>
        </div>
      )}

      {rankings && !inProgress && (
        rankings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
            No candidates matched. Add candidates to the platform or run the bulk import.
          </div>
        ) : (
          <div className="space-y-3">
            {rankings.map(c => (
              <div key={c.candidate_id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start gap-4">
                  <div className="text-center w-16 shrink-0">
                    <div className="text-xs text-slate-400 font-semibold">#{c.rank}</div>
                    <div className={`text-2xl font-bold ${scoreColor(c.final_score)}`}>{c.final_score.toFixed(0)}</div>
                    <div className="text-[10px] text-slate-400">final</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => navigate(`/recruiter/candidates/${c.candidate_id}?job_id=${jobId}`)}
                        className="font-semibold text-slate-800 hover:text-brand-blue"
                      >
                        {c.full_name || 'Unnamed candidate'}
                      </button>
                      {c.recommendation && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${REC_BADGE[c.recommendation] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {c.recommendation}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 text-xs mt-0.5">{c.headline || '—'}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
                      <span>embed <strong className="text-slate-700">{c.breakdown.embed.toFixed(0)}</strong></span>
                      <span>skill <strong className="text-slate-700">{c.breakdown.skill.toFixed(0)}</strong></span>
                      <span>rerank <strong className="text-slate-700">{c.breakdown.rerank.toFixed(0)}</strong></span>
                      <span>llm <strong className="text-slate-700">{c.breakdown.llm.toFixed(0)}</strong></span>
                      <span>exp <strong className="text-slate-700">{c.breakdown.experience.toFixed(0)}</strong></span>
                    </div>
                    {c.llm_summary && <p className="text-sm text-slate-600 mt-3 line-clamp-2">{c.llm_summary}</p>}
                  </div>
                  <div className="shrink-0 flex flex-col gap-2">
                    <button
                      onClick={() => navigate(`/recruiter/candidates/${c.candidate_id}?job_id=${jobId}`)}
                      className="text-sm font-semibold px-4 py-2 rounded-xl bg-brand-blue text-white hover:bg-blue-600 transition-colors"
                    >
                      View Profile
                    </button>
                    <button
                      onClick={() => navigate(`/recruiter/candidates/${c.candidate_id}?job_id=${jobId}&tab=applications`)}
                      className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-brand-blue hover:text-brand-blue transition-colors"
                    >
                      Applications
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
