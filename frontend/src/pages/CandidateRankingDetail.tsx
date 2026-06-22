import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Avatar, Button, Card, Icon, Tag, type VouchColor } from '../components/ui'

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
  id: number; job_id: number; job_title: string | null; job_company: string | null
  match_score: number; status: string; candidate_status: string; applied_at: string | null
}

interface RankingRow {
  rank: number; candidate_id: number; final_score: number; recommendation: string | null
  breakdown: { embed: number; skill: number; keyword: number; rerank: number; llm: number; experience: number }
  llm_strengths: string[]; llm_risks: string[]; llm_summary: string | null
}

function scoreColor(s: number): VouchColor {
  return s >= 80 ? 'green' : s >= 70 ? 'violet' : s >= 60 ? 'amber' : 'pink'
}
function initialsOf(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lineFor(item: any): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const vals = [item.title || item.role || item.position || item.degree || item.name || item.project_name,
                  item.company || item.employer || item.institution || item.field || item.field_of_study,
                  item.duration || item.years || item.graduation_year].filter(Boolean)
    return vals.join(' · ') || JSON.stringify(item)
  }
  return String(item)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding={22}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, margin: '0 0 12px', color: 'var(--ink)', letterSpacing: '-0.02em' }}>{title}</h3>
      {children}
    </Card>
  )
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
      .then(r => setCand(r.data)).catch(() => setCand(null)).finally(() => setLoading(false))
  }, [candidateId])

  useEffect(() => {
    if (!candidateId) return
    api.get<{ applications: CandidateApplication[] }>(`/candidates/${candidateId}/applications`)
      .then(r => setApps(r.data.applications)).catch(() => setApps([]))
  }, [candidateId])

  useEffect(() => {
    if (!jobId || !candidateId) return
    api.get<{ rankings: RankingRow[] }>('/search/rankings', { params: { job_id: jobId } })
      .then(r => setRanking(r.data.rankings.find(x => x.candidate_id === Number(candidateId)) || null))
      .catch(() => setRanking(null))
    api.get<{ title: string }>(`/jobs/${jobId}`).then(r => setJobTitle(r.data.title)).catch(() => setJobTitle(null))
  }, [jobId, candidateId])

  const openResume = async () => {
    setResumeLoading(true)
    try {
      const r = await api.get<{ available: boolean; url?: string }>(`/candidates/${candidateId}/resume-url`)
      if (r.data.available && r.data.url) window.open(r.data.url, '_blank', 'noopener')
      else alert('Original resume file is not available for this candidate.')
    } catch { alert('Could not load the resume. Please try again.') }
    finally { setResumeLoading(false) }
  }

  if (loading) return <div className="py-16"><LoadingSpinner /></div>
  if (!cand) return <div className="max-w-4xl mx-auto px-8 py-12" style={{ color: 'var(--muted)', fontWeight: 600 }}>Candidate not found.</div>

  const color: VouchColor = ranking ? scoreColor(ranking.final_score) : 'violet'

  return (
    <div className="max-w-5xl mx-auto px-8 pt-6 pb-24">
      <button onClick={() => navigate(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700, fontSize: 14, marginBottom: 16, padding: 0 }}>
        <Icon name="back" size={18} stroke={2.4} /> Back
      </button>

      {/* header */}
      <Card padding={26} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <Avatar initials={initialsOf(cand.full_name)} color={color} size={56} ring />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', margin: 0, color: 'var(--ink)' }}>{cand.full_name || 'Unnamed candidate'}</h1>
            <p style={{ color: 'var(--muted)', fontWeight: 600, margin: '4px 0 0' }}>{cand.headline || '—'}</p>
          </div>
          <Button variant="primary" icon="bag" onClick={openResume} disabled={resumeLoading || !cand.has_resume_file}>
            {resumeLoading ? 'Opening…' : 'View Resume'}
          </Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14, fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>
          {cand.location && <span>📍 {cand.location}</span>}
          {cand.total_yoe != null && <span>🧭 {cand.total_yoe} yrs experience</span>}
          {cand.email && <span>✉️ {cand.email}</span>}
          {cand.phone && <span>📞 {cand.phone}</span>}
        </div>
      </Card>

      {/* why this candidate matches */}
      {ranking && (
        <Card hero padding={26} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              Why this candidate {jobTitle ? <>is a fit for <span style={{ color: 'var(--violet-ink)' }}>{jobTitle}</span></> : 'matches'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: `var(--${color}-ink)`, lineHeight: 1 }}>{ranking.final_score.toFixed(0)}</span>
              {ranking.recommendation && <Tag tone="match">{ranking.recommendation}</Tag>}
            </div>
          </div>
          {ranking.llm_summary && <p style={{ fontSize: 14.5, color: 'var(--ink)', opacity: 0.82, marginTop: 12, lineHeight: 1.55, fontWeight: 500 }}>{ranking.llm_summary}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 16 }}>
            {ranking.llm_strengths.length > 0 && (
              <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--green-line)', padding: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--green-ink)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Strengths</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {ranking.llm_strengths.map((s, i) => <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}><span style={{ color: 'var(--green-ink)' }}>✓</span><span>{s}</span></li>)}
                </ul>
              </div>
            )}
            {ranking.llm_risks.length > 0 && (
              <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--amber-line)', padding: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--amber-ink)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Weaknesses / Risks</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {ranking.llm_risks.map((s, i) => <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}><span style={{ color: 'var(--amber-ink)' }}>!</span><span>{s}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* platform applications */}
      {apps && apps.length > 0 && (
        <Card padding={24} style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, margin: '0 0 12px', color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Applications on the platform <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>({apps.length})</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {apps.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{a.job_title || `Job #${a.job_id}`}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{a.job_company ? `${a.job_company} · ` : ''}Applied {a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '—'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: `var(--${scoreColor(a.match_score)}-ink)` }}>{a.match_score.toFixed(0)}%</span>
                  <Tag>{a.candidate_status}</Tag>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }} className="vouch-detail-grid">
        {/* left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Section title="Skills">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cand.normalized_skills.map(s => <Tag key={s} tone="match">{s}</Tag>)}
              {cand.unmapped_skills.map(s => <Tag key={s}>{s}</Tag>)}
            </div>
          </Section>
          {cand.work_history.length > 0 && (
            <Section title="Experience">
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {cand.work_history.map((w, i) => <li key={i} style={{ fontSize: 14, color: 'var(--ink)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--violet)' }}>•</span>{lineFor(w)}</li>)}
              </ul>
            </Section>
          )}
          {cand.projects.length > 0 && (
            <Section title="Projects">
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {cand.projects.map((p, i) => <li key={i} style={{ fontSize: 14, color: 'var(--ink)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--violet)' }}>•</span>{lineFor(p)}</li>)}
              </ul>
            </Section>
          )}
          {cand.education.length > 0 && (
            <Section title="Education">
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {cand.education.map((e, i) => <li key={i} style={{ fontSize: 14, color: 'var(--ink)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--violet)' }}>•</span>{lineFor(e)}</li>)}
              </ul>
            </Section>
          )}
          {cand.resume_text && (
            <Section title={`Resume${cand.resume_filename ? ` · ${cand.resume_filename}` : ''}`}>
              <pre style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', maxHeight: 384, overflowY: 'auto', margin: 0 }}>{cand.resume_text}</pre>
            </Section>
          )}
        </div>

        {/* right: ranking breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 20 }}>
          {ranking ? (
            <Card padding={22}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, margin: 0, color: 'var(--ink)' }}>Score breakdown</h3>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>#{ranking.rank}</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {([['Embedding', ranking.breakdown.embed], ['Skill', ranking.breakdown.skill], ['Rerank', ranking.breakdown.rerank], ['LLM', ranking.breakdown.llm], ['Experience', ranking.breakdown.experience]] as [string, number][]).map(([label, val]) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>
                      <span>{label}</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{val.toFixed(0)}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: `var(--${color})`, width: `${Math.min(100, val)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : cand.profile_summary ? (
            <Section title="Profile summary">
              <pre style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', margin: 0 }}>{cand.profile_summary}</pre>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
