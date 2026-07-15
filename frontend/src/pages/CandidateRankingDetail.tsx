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

interface RankingRow {
  rank: number; candidate_id: number; final_score: number; recommendation: string | null
  breakdown: { role_fit: number | null; skills: number | null; experience: number | null; ai_fluency: number | null; assessment: number | null }
  ai_fluency_note: string | null
  llm_strengths: string[]; llm_risks: string[]; llm_summary: string | null
}

// Recruiter-facing factors: plain-language label + what it means + weight.
const SCORE_FACTORS: { key: keyof RankingRow['breakdown']; label: string; desc: string; weight: number }[] = [
  { key: 'role_fit', label: 'Role Fit', desc: 'Overall match of the profile to this job', weight: 30 },
  { key: 'skills', label: 'Skills Match', desc: 'Coverage of the must-have skills', weight: 25 },
  { key: 'experience', label: 'Experience', desc: 'Seniority & years vs the role', weight: 15 },
  { key: 'ai_fluency', label: 'AI Fluency', desc: 'How effectively they use AI in their work', weight: 15 },
  { key: 'assessment', label: 'Overall Assessment', desc: "The AI recruiter's holistic verdict", weight: 15 },
]

function scoreColor(s: number): VouchColor {
  return s >= 80 ? 'green' : s >= 70 ? 'violet' : s >= 60 ? 'amber' : 'pink'
}
function initialsOf(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// Pull the first non-empty value across a set of possible key names (resilient to
// schema variance between extractors / legacy rows).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(obj: any, ...keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null
  for (const k of keys) {
    const v = obj[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dateRange(item: any): string | null {
  const start = pick(item, 'start_date', 'start', 'from', 'start_year')
  const endRaw = pick(item, 'end_date', 'end', 'to', 'end_year')
  const end = endRaw ?? (item?.is_current ? 'Present' : null)
  if (start && end) return `${start} — ${end}`
  return start || end || pick(item, 'duration', 'years')
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card padding={22}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, margin: '0 0 14px', color: 'var(--ink)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {title}
        {count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{count}</span>}
      </h3>
      {children}
    </Card>
  )
}

// ── Structured profile renderers ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExperienceItem({ w, last }: { w: any; last: boolean }) {
  if (typeof w === 'string') {
    return <li style={{ fontSize: 14, color: 'var(--ink)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--violet)' }}>•</span>{w}</li>
  }
  const title = pick(w, 'title', 'role', 'position', 'job_title')
  const company = pick(w, 'company', 'employer', 'organization', 'organisation')
  const dates = dateRange(w)
  const desc = pick(w, 'description', 'summary', 'responsibilities', 'details')
  // Full per-role bullet points exactly as written in the resume.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlRaw = (w.highlights ?? w.bullets ?? w.achievements) as any
  const highlights: string[] = Array.isArray(hlRaw)
    ? hlRaw.map((h: unknown) => String(h).trim()).filter(Boolean)
    : (typeof hlRaw === 'string' ? hlRaw.split('\n').map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean) : [])
  return (
    <li style={{ position: 'relative', paddingLeft: 20, paddingBottom: last ? 0 : 18 }}>
      {/* timeline dot + line */}
      <span style={{ position: 'absolute', left: 0, top: 5, width: 9, height: 9, borderRadius: 99, background: 'var(--violet)', border: '2px solid var(--surface)', boxShadow: '0 0 0 1.5px var(--violet)' }} />
      {!last && <span style={{ position: 'absolute', left: 4, top: 15, bottom: 0, width: 1.5, background: 'var(--line)' }} />}
      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{title || 'Role'}</div>
      <div style={{ fontSize: 13, color: 'var(--violet-ink)', fontWeight: 600, marginTop: 1 }}>
        {company || '—'}{dates && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>  ·  {dates}</span>}
      </div>
      {desc && <p style={{ fontSize: 13, color: 'var(--ink)', opacity: 0.78, margin: '6px 0 0', lineHeight: 1.55, fontWeight: 500 }}>{desc}</p>}
      {highlights.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {highlights.map((h, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--ink)', opacity: 0.82, display: 'flex', gap: 8, lineHeight: 1.5, fontWeight: 500 }}>
              <span style={{ color: 'var(--violet)', flexShrink: 0 }}>•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProjectItem({ p }: { p: any }) {
  if (typeof p === 'string') {
    return <div style={{ fontSize: 14, color: 'var(--ink)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--violet)' }}>•</span>{p}</div>
  }
  const name = pick(p, 'name', 'project_name', 'title')
  const desc = pick(p, 'description', 'summary')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const techRaw = (p.technologies ?? p.tech ?? p.stack) as any
  const tech: string[] = Array.isArray(techRaw) ? techRaw : (typeof techRaw === 'string' ? techRaw.split(/[,/]/).map(s => s.trim()).filter(Boolean) : [])
  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{name || 'Project'}</div>
      {desc && <p style={{ fontSize: 13, color: 'var(--ink)', opacity: 0.78, margin: '4px 0 0', lineHeight: 1.55, fontWeight: 500 }}>{desc}</p>}
      {tech.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {tech.map((t, i) => <Tag key={i}>{t}</Tag>)}
        </div>
      )}
    </div>
  )
}

// Renders the structured profile_summary blurb (title line + "Label: value" lines)
// with the section labels bolded.
const SUMMARY_LABELS = ['Skills', 'Experience', 'Industries', 'Projects', 'Education']
function ProfileSummary({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.map((line, i) => {
        const idx = line.indexOf(':')
        const label = idx > -1 ? line.slice(0, idx).trim() : ''
        if (label && SUMMARY_LABELS.includes(label)) {
          return (
            <div key={i} style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{label}: </span>
              <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{line.slice(idx + 1).trim()}</span>
            </div>
          )
        }
        // First unlabelled line = role/title headline
        if (i === 0) {
          return <div key={i} style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{line}</div>
        }
        return <div key={i} style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.5 }}>{line}</div>
      })}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EducationItem({ e }: { e: any }) {
  if (typeof e === 'string') {
    return <div style={{ fontSize: 14, color: 'var(--ink)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--violet)' }}>•</span>{e}</div>
  }
  const degree = pick(e, 'degree', 'qualification', 'field', 'field_of_study')
  const inst = pick(e, 'institution', 'college', 'university', 'school')
  const year = pick(e, 'year', 'graduation_year', 'end_year', 'grad_year')
  return (
    <div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{degree || inst || 'Education'}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
        {degree && inst ? inst : ''}{year && <span>{degree && inst ? '  ·  ' : ''}{year}</span>}
      </div>
    </div>
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
  const [resumeLoading, setResumeLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<CandidateDetail>(`/candidates/${candidateId}`)
      .then(r => setCand(r.data)).catch(() => setCand(null)).finally(() => setLoading(false))
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
  if (!cand) return <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12" style={{ color: 'var(--muted)', fontWeight: 600 }}>Candidate not found.</div>

  const color: VouchColor = ranking ? scoreColor(ranking.final_score) : 'violet'

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 pb-24">
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

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }} className="vouch-detail-grid">
        {/* left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {(cand.normalized_skills.length > 0 || cand.unmapped_skills.length > 0) && (
            <Section title="Skills" count={cand.normalized_skills.length + cand.unmapped_skills.length}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cand.normalized_skills.map(s => <Tag key={s} tone="match">{s}</Tag>)}
                {cand.unmapped_skills.map(s => <Tag key={s}>{s}</Tag>)}
              </div>
            </Section>
          )}
          {cand.work_history.length > 0 && (
            <Section title="Experience" count={cand.work_history.length}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {cand.work_history.map((w, i) => <ExperienceItem key={i} w={w} last={i === cand.work_history.length - 1} />)}
              </ul>
            </Section>
          )}
          {cand.projects.length > 0 && (
            <Section title="Projects" count={cand.projects.length}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {cand.projects.map((p, i) => <ProjectItem key={i} p={p} />)}
              </div>
            </Section>
          )}
          {cand.education.length > 0 && (
            <Section title="Education" count={cand.education.length}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {cand.education.map((e, i) => <EducationItem key={i} e={e} />)}
              </div>
            </Section>
          )}
          {cand.certifications.length > 0 && (
            <Section title="Certifications" count={cand.certifications.length}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cand.certifications.map((c, i) => (
                  <li key={i} style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--violet)' }}>🏅</span>{c}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {cand.work_history.length === 0 && cand.projects.length === 0 && cand.education.length === 0 && (
            <Section title="Profile">
              <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 500, margin: 0, lineHeight: 1.55 }}>
                {cand.ingest_status === 'completed'
                  ? 'No structured experience, projects, or education were extracted from this résumé. Open the original resume above for the full details.'
                  : 'This candidate’s résumé is still being processed. Structured experience and education will appear here once parsing completes.'}
              </p>
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
              <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, margin: '4px 0 0', lineHeight: 1.45 }}>
                The match score is a weighted blend of these factors.
              </p>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {SCORE_FACTORS.map(({ key, label, desc, weight }) => {
                  const val = ranking.breakdown[key]
                  const has = val != null
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: has ? 'var(--ink)' : 'var(--muted)' }}>
                          {has ? (val as number).toFixed(0) : '—'}
                          <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {weight}%</span>
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500, margin: '1px 0 5px' }}>{desc}</div>
                      <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                        {has && <div style={{ height: '100%', borderRadius: 99, background: `var(--${color})`, width: `${Math.min(100, val as number)}%` }} />}
                      </div>
                      {key === 'ai_fluency' && ranking.ai_fluency_note && (
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500, marginTop: 5, fontStyle: 'italic', lineHeight: 1.4 }}>
                          {ranking.ai_fluency_note}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          ) : cand.profile_summary ? (
            <Section title="Profile summary">
              <ProfileSummary text={cand.profile_summary} />
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
