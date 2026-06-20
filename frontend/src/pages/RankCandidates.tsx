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
interface RunStatus {
  run_id: number
  status: 'pending' | 'running' | 'done' | 'failed'
  retrieved: number | null
  reranked: number | null
  evaluated: number | null
  error: string | null
}

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
  const [run, setRun] = useState<RunStatus | null>(null)
  const [error, setError] = useState('')
  const [shortlisted, setShortlisted] = useState<Set<number>>(new Set())
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchJobs = useCallback(() => {
    api.get<{ jobs: JobOption[] }>('/jobs/my', { params: { per_page: 100 } })
      .then(r => setJobs(r.data.jobs))
      .catch(() => setJobs([]))
  }, [])
  useEffect(() => { fetchJobs() }, [fetchJobs])

  // Clear any pending poll on unmount.
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  const loadResults = useCallback((jid: number) => {
    api.get<{ rankings: RankingRow[] }>('/search/rankings', { params: { job_id: jid } })
      .then(r => setRankings(r.data.rankings))
      .catch(() => setRankings([]))
  }, [])

  const poll = useCallback((runId: number, jid: number) => {
    api.get<RunStatus>(`/search/runs/${runId}`)
      .then(r => {
        setRun(r.data)
        if (r.data.status === 'done') {
          loadResults(jid)
        } else if (r.data.status === 'failed') {
          setError(r.data.error || 'Ranking run failed.')
        } else {
          pollRef.current = setTimeout(() => poll(runId, jid), 2500)
        }
      })
      .catch(() => { pollRef.current = setTimeout(() => poll(runId, jid), 2500) })
  }, [loadResults])

  const runFunnel = () => {
    if (!jobId) return
    setError('')
    setRankings(null)
    setShortlisted(new Set())
    setRun({ run_id: 0, status: 'pending', retrieved: null, reranked: null, evaluated: null, error: null })
    api.post<{ run_id: number }>('/search/candidates/evaluate', null, {
      params: { job_id: jobId, eval_n: 20 },
    })
      .then(r => poll(r.data.run_id, jobId as number))
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(msg || 'Could not start ranking.')
        setRun(null)
      })
  }

  const shortlist = async (candidateId: number) => {
    if (!jobId) return
    try {
      await api.post('/feedback', { job_id: jobId, candidate_id: candidateId, action: 'shortlisted' })
      setShortlisted(prev => new Set(prev).add(candidateId))
    } catch { /* ignore */ }
  }

  const inProgress = run && (run.status === 'pending' || run.status === 'running')

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Rank Candidates</h1>
      <p className="text-slate-500 text-sm mb-6">
        Pick one of your jobs and rank the entire candidate base against it: retrieve → rerank → LLM-evaluate.
        Runs in the background; the LLM only scores the top 20.
      </p>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Job</label>
          <select
            value={jobId}
            onChange={e => setJobId(e.target.value ? Number(e.target.value) : '')}
            disabled={!!inProgress}
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white disabled:opacity-50"
          >
            <option value="">Select a job…</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <button
          onClick={runFunnel}
          disabled={!jobId || !!inProgress}
          className="bg-brand-blue hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl disabled:opacity-40"
        >
          {inProgress ? 'Ranking…' : 'Rank candidates'}
        </button>
      </div>

      {error && (
        <div className="text-sm bg-red-50 text-red-600 border border-red-200 rounded-xl px-4 py-2.5 mb-6">
          {error}
        </div>
      )}

      {inProgress && (
        <div className="py-8">
          <LoadingSpinner message={
            run?.status === 'pending'
              ? 'Starting the ranking job…'
              : 'Running the funnel — embedding, reranking, and LLM evaluation…'
          } />
          <p className="text-center text-xs text-slate-400 mt-2">This runs in the background; you can keep this tab open.</p>
        </div>
      )}

      {rankings && !inProgress && (
        <>
          {run && (
            <div className="text-sm text-slate-500 mb-4">
              Funnel: <strong className="text-slate-700">{run.retrieved}</strong> retrieved →
              <strong className="text-slate-700"> {run.reranked}</strong> reranked →
              <strong className="text-slate-700"> {run.evaluated}</strong> LLM-evaluated
            </div>
          )}

          {rankings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
              No candidates matched. Upload more resumes to your corpus.
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

                    <div className="shrink-0">
                      <button
                        onClick={() => shortlist(c.candidate_id)}
                        disabled={shortlisted.has(c.candidate_id)}
                        className="text-sm font-semibold px-4 py-2 rounded-xl border border-brand-blue text-brand-blue hover:bg-blue-50 disabled:opacity-40 disabled:cursor-default"
                      >
                        {shortlisted.has(c.candidate_id) ? '✓ Shortlisted' : 'Shortlist'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
