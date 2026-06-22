import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'

interface CandidateDetail {
  id: number
  user_id: number | null
  has_resume_file: boolean
  full_name: string | null
  headline: string | null
  location: string | null
  email: string | null
  phone: string | null
  total_yoe: number | null
  normalized_skills: string[]
  unmapped_skills: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  work_history: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  education: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projects: any[]
  certifications: string[]
  profile_summary: string | null
  resume_text: string | null
  resume_filename: string | null
  ingest_status: string
}

interface CandidateApplication {
  id: number
  job_id: number
  job_title: string | null
  job_company: string | null
  match_score: number
  status: string
  candidate_status: string
  applied_at: string | null
}

interface RankingRow {
  rank: number
  candidate_id: number
  final_score: number
  recommendation: string | null
  breakdown: { embed: number; skill: number; keyword: number; rerank: number; llm: number; experience: number }
  llm_strengths: string[]
  llm_risks: string[]
  llm_summary: string | null
}

function scoreColor(s: number) {
  return s >= 80 ? 'text-emerald-600' : s >= 70 ? 'text-blue-600' : s >= 60 ? 'text-amber-600' : 'text-red-500'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lineFor(item: any): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const vals = [item.title || item.role || item.position || item.degree || item.name || item.project_name,
                  item.company || item.employer || item.institution || item.field || item.field_of_study,
                  item.duration || item.years || item.graduation_year]
      .filter(Boolean)
    return vals.join(' · ') || JSON.stringify(item)
  }
  return String(item)
}

export default function CandidateRankingDetail() {
  const { candidateId } = useParams()
  const [params] = useSearchParams()
  const jobId = params.get('job_id')
  const navigate = useNavigate()

  const [cand, setCand] = useState<CandidateDetail | null>(null)
  const [ranking, setRanking] = useState<RankingRow | null>(null)
  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [apps, setApps] = useState<CandidateApplication[] | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<CandidateDetail>(`/candidates/${candidateId}`)
      .then(r => setCand(r.data))
      .catch(() => setCand(null))
      .finally(() => setLoading(false))
  }, [candidateId])

  useEffect(() => {
    if (!candidateId) return
    api.get<{ applications: CandidateApplication[] }>(`/candidates/${candidateId}/applications`)
      .then(r => setApps(r.data.applications))
      .catch(() => setApps([]))
  }, [candidateId])

  useEffect(() => {
    if (!jobId || !candidateId) return
    api.get<{ rankings: RankingRow[] }>('/search/rankings', { params: { job_id: jobId } })
      .then(r => setRanking(r.data.rankings.find(x => x.candidate_id === Number(candidateId)) || null))
      .catch(() => setRanking(null))
    api.get<{ title: string }>(`/jobs/${jobId}`)
      .then(r => setJobTitle(r.data.title))
      .catch(() => setJobTitle(null))
  }, [jobId, candidateId])

  const openResume = async () => {
    setResumeLoading(true)
    try {
      const r = await api.get<{ available: boolean; url?: string }>(`/candidates/${candidateId}/resume-url`)
      if (r.data.available && r.data.url) {
        window.open(r.data.url, '_blank', 'noopener')
      } else {
        alert('Original resume file is not available for this candidate.')
      }
    } catch {
      alert('Could not load the resume. Please try again.')
    } finally {
      setResumeLoading(false)
    }
  }

  if (loading) return <div className="py-16"><LoadingSpinner /></div>
  if (!cand) return <div className="max-w-4xl mx-auto px-4 py-12 text-slate-500">Candidate not found.</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-700 text-sm font-semibold mb-4">
        ← Back
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800">{cand.full_name || 'Unnamed candidate'}</h1>
            <p className="text-slate-500 mt-1">{cand.headline || '—'}</p>
          </div>
          <button
            onClick={openResume}
            disabled={resumeLoading || !cand.has_resume_file}
            title={cand.has_resume_file ? 'Open the original resume file' : 'No uploaded resume file on record'}
            className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl bg-brand-blue text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resumeLoading ? 'Opening…' : '📄 View Resume'}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500 mt-3">
          {cand.location && <span>📍 {cand.location}</span>}
          {cand.total_yoe != null && <span>🧭 {cand.total_yoe} yrs experience</span>}
          {cand.email && <span>✉️ {cand.email}</span>}
          {cand.phone && <span>📞 {cand.phone}</span>}
        </div>
      </div>

      {/* Why this candidate is a good match (job context) */}
      {ranking && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-6 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-slate-800">
              Why this candidate {jobTitle ? <>is a fit for <span className="text-brand-blue">{jobTitle}</span></> : 'matches'}
            </h2>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${scoreColor(ranking.final_score)}`}>{ranking.final_score.toFixed(0)}</span>
              {ranking.recommendation && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-white border-slate-200 text-slate-600">
                  {ranking.recommendation}
                </span>
              )}
            </div>
          </div>
          {ranking.llm_summary && (
            <p className="text-sm text-slate-700 mt-3 leading-relaxed">{ranking.llm_summary}</p>
          )}
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {ranking.llm_strengths.length > 0 && (
              <div className="bg-white/70 rounded-xl border border-emerald-100 p-4">
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">Strengths</div>
                <ul className="text-sm text-slate-700 space-y-1.5">
                  {ranking.llm_strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-emerald-500">✓</span><span>{s}</span></li>)}
                </ul>
              </div>
            )}
            {ranking.llm_risks.length > 0 && (
              <div className="bg-white/70 rounded-xl border border-amber-100 p-4">
                <div className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">Weaknesses / Risks</div>
                <ul className="text-sm text-slate-700 space-y-1.5">
                  {ranking.llm_risks.map((s, i) => <li key={i} className="flex gap-2"><span className="text-amber-500">!</span><span>{s}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Platform applications */}
      {apps && apps.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <h2 className="font-bold text-slate-800 mb-3">Applications on the platform <span className="text-sm font-normal text-slate-400">({apps.length})</span></h2>
          <div className="divide-y divide-slate-100">
            {apps.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{a.job_title || `Job #${a.job_id}`}</p>
                  <p className="text-xs text-slate-400">
                    {a.job_company ? `${a.job_company} · ` : ''}Applied {a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-bold ${scoreColor(a.match_score)}`}>{a.match_score.toFixed(0)}%</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                    {a.candidate_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: parsed profile */}
        <div className="md:col-span-2 space-y-6">
          <Section title="Skills">
            <div className="flex flex-wrap gap-1.5">
              {cand.normalized_skills.map(s => (
                <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">{s}</span>
              ))}
              {cand.unmapped_skills.map(s => (
                <span key={s} className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">{s}</span>
              ))}
            </div>
          </Section>

          {cand.work_history.length > 0 && (
            <Section title="Experience">
              <ul className="space-y-1.5 text-sm text-slate-700">
                {cand.work_history.map((w, i) => <li key={i}>• {lineFor(w)}</li>)}
              </ul>
            </Section>
          )}

          {cand.projects.length > 0 && (
            <Section title="Projects">
              <ul className="space-y-1.5 text-sm text-slate-700">
                {cand.projects.map((p, i) => <li key={i}>• {lineFor(p)}</li>)}
              </ul>
            </Section>
          )}

          {cand.education.length > 0 && (
            <Section title="Education">
              <ul className="space-y-1.5 text-sm text-slate-700">
                {cand.education.map((e, i) => <li key={i}>• {lineFor(e)}</li>)}
              </ul>
            </Section>
          )}

          {cand.resume_text && (
            <Section title={`Resume${cand.resume_filename ? ` · ${cand.resume_filename}` : ''}`}>
              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
                {cand.resume_text}
              </pre>
            </Section>
          )}
        </div>

        {/* Right: ranking breakdown (when viewed in a job context) */}
        <div className="space-y-6">
          {ranking ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-slate-700">Ranking</h3>
                <span className="text-xs text-slate-400">#{ranking.rank}</span>
              </div>
              <div className="text-3xl font-bold text-brand-blue mt-1">{ranking.final_score.toFixed(1)}</div>
              {ranking.recommendation && (
                <div className="text-xs font-semibold text-slate-500 mt-0.5">{ranking.recommendation}</div>
              )}
              <div className="mt-4 space-y-2">
                {([['Embedding', ranking.breakdown.embed], ['Skill', ranking.breakdown.skill],
                   ['Rerank', ranking.breakdown.rerank], ['LLM', ranking.breakdown.llm],
                   ['Experience', ranking.breakdown.experience]] as [string, number][]).map(([label, val]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                      <span>{label}</span><span>{val.toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-blue rounded-full" style={{ width: `${Math.min(100, val)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : cand.profile_summary ? (
            <Section title="Profile summary">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans">{cand.profile_summary}</pre>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}
