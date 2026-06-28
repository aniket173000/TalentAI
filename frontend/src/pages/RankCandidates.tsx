import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { Avatar, Button, Card, Icon, ScoreRing, Tag, type VouchColor } from '../components/ui'

interface RankingRow {
  rank: number
  candidate_id: number
  full_name: string | null
  headline: string | null
  final_score: number
  recommendation: string | null
  breakdown: { role_fit: number | null; skills: number | null; experience: number | null; ai_fluency: number | null; assessment: number | null }
  llm_strengths: string[]
  llm_risks: string[]
  llm_summary: string | null
}

interface JobOption { id: number; title: string; total_applicants?: number; pool_count?: number; max_count?: number; location?: string }
type RunState = 'pending' | 'running' | 'done' | 'failed'

const REC_TONE: Record<string, 'match' | 'longshot' | 'full' | 'neutral'> = {
  'Strong Match': 'match', 'Good Match': 'match', 'Possible Match': 'longshot', 'Weak Match': 'full',
}

function scoreColor(s: number): VouchColor {
  return s >= 80 ? 'green' : s >= 70 ? 'violet' : s >= 60 ? 'amber' : 'pink'
}
function initialsOf(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function JobCardOption({ job, active, onSelect }: { job: JobOption; active: boolean; onSelect: (id: number) => void }) {
  return (
    <button onClick={() => onSelect(job.id)} style={{
      textAlign: 'left', cursor: 'pointer', padding: 18, borderRadius: 18,
      background: active ? 'var(--ink)' : 'var(--surface)', color: active ? 'var(--bg)' : 'var(--ink)',
      border: '2px solid var(--ink)', boxShadow: active ? '4px 4px 0 var(--violet)' : '4px 4px 0 var(--card-shadow)',
      transition: 'transform .12s ease, box-shadow .12s ease', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, fontFamily: 'var(--font-body)',
    }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'translate(2px,2px)' }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'none' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}>
      <div style={{ width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', border: `2px solid ${active ? 'var(--bg)' : 'var(--line)'}`, background: active ? 'var(--violet)' : 'transparent' }}>
        {active && <Icon name="check" size={13} stroke={3.2} style={{ color: '#fff' }} />}
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 4 }}>{job.title}</div>
        {job.location && <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.7 }}>{job.location}</div>}
      </div>
      <div style={{ display: 'flex', gap: 16, paddingTop: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700 }}>{job.total_applicants ?? 0} <span style={{ opacity: 0.6, fontWeight: 600 }}>applicants</span></span>
        {job.max_count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700 }}>{job.pool_count ?? 0}/{job.max_count} <span style={{ opacity: 0.6, fontWeight: 600 }}>in pool</span></span>}
      </div>
    </button>
  )
}

function FitList({ title, items, kind }: { title: string; items: string[]; kind: 'good' | 'bad' }) {
  const good = kind === 'good'
  if (!items?.length) return null
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
        <Icon name={good ? 'spark' : 'alert'} size={14} stroke={2.4} style={{ color: good ? 'var(--green-ink)' : 'var(--amber-ink)' }} />
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: good ? 'var(--green-ink)' : 'var(--amber-ink)' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 16, height: 16, borderRadius: 5, marginTop: 2, flexShrink: 0, display: 'grid', placeItems: 'center', background: good ? 'var(--green-soft)' : 'var(--amber-soft)', color: good ? 'var(--green-ink)' : 'var(--amber-ink)', border: `1.5px solid ${good ? 'var(--green-line)' : 'var(--amber-line)'}` }}>
              <Icon name={good ? 'check' : 'x'} size={10} stroke={3.4} />
            </div>
            <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500, lineHeight: 1.4 }}>{it}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CandidateCard({ c, idx, jobId, onView }: { c: RankingRow; idx: number; jobId: number | ''; onView: (tab?: string) => void }) {
  const color = scoreColor(c.final_score)
  const medal = c.rank <= 3
  return (
    <div className="vouch-rankcard" style={{ padding: 22, background: 'var(--surface)', borderRadius: 20, border: '2px solid var(--ink)', boxShadow: '5px 5px 0 var(--card-shadow)', ['--rise-delay' as string]: `${idx * 0.06}s` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, background: medal ? 'var(--ink)' : 'var(--surface-2)', color: medal ? 'var(--bg)' : 'var(--muted)', border: '2px solid var(--ink)' }}>{c.rank}</div>
        <Avatar initials={initialsOf(c.full_name)} color={color} size={48} ring={medal} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => onView()} style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{c.full_name || 'Unnamed candidate'}</button>
            {c.recommendation && <Tag tone={REC_TONE[c.recommendation] ?? 'neutral'}>{c.recommendation}</Tag>}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, marginTop: 3 }}>{c.headline || '—'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--muted)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {([['role fit', c.breakdown.role_fit], ['skills', c.breakdown.skills], ['AI fluency', c.breakdown.ai_fluency], ['exp', c.breakdown.experience]] as [string, number | null][])
              .map(([label, val]) => <span key={label}>{label} {val != null ? val.toFixed(0) : '—'}</span>)}
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <ScoreRing score={Math.round(c.final_score)} color={color} />
          <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, marginTop: 5, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Match</div>
        </div>
      </div>

      {(c.llm_strengths?.length || c.llm_risks?.length) ? (
        <div style={{ display: 'flex', gap: 26, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <FitList title="Why they fit" items={c.llm_strengths} kind="good" />
          <FitList title="Watch-outs" items={c.llm_risks} kind="bad" />
        </div>
      ) : c.llm_summary ? (
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', lineHeight: 1.5 }}>{c.llm_summary}</p>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="soft" onClick={() => onView('applications')}>Applications</Button>
        <Button size="sm" variant="primary" iconRight="arrow" onClick={() => onView()}>View profile</Button>
      </div>
    </div>
  )
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
        if (r.data.status === 'done') { setRankedToday(true); setRankedAt(new Date().toISOString()); loadResults(jid) }
        else if (r.data.status === 'failed') { setError(r.data.error || 'Ranking run failed.') }
        else { pollRef.current = setTimeout(() => poll(runId, jid), 2500) }
      })
      .catch(() => { pollRef.current = setTimeout(() => poll(runId, jid), 2500) })
  }, [loadResults])

  useEffect(() => {
    setRankings(null); setPhase(''); setRankedToday(false); setRankedAt(null); setError('')
    if (pollRef.current) clearTimeout(pollRef.current)
    if (!jobId) return
    api.get<{ run_id: number | null; status: string; ranked_today: boolean; ranked_at: string | null }>(
      '/search/runs/latest', { params: { job_id: jobId } },
    ).then(r => {
      const d = r.data
      if (d.status === 'done' && d.ranked_today) { setRankedToday(true); setRankedAt(d.ranked_at); loadResults(jobId as number) }
      else if (d.run_id && (d.status === 'pending' || d.status === 'running')) { setPhase(d.status as RunState); poll(d.run_id, jobId as number) }
    }).catch(() => {})
  }, [jobId, loadResults, poll])

  const runFunnel = () => {
    if (!jobId) return
    setError(''); setRankings(null); setPhase('pending')
    api.post<{ run_id: number; status: RunState; cached: boolean; ranked_at: string | null }>(
      '/search/candidates/evaluate', null, { params: { job_id: jobId, eval_n: 10 } },
    ).then(r => {
      const d = r.data
      if (d.status === 'done') { setRankedToday(true); setRankedAt(d.ranked_at); setPhase('done'); loadResults(jobId as number) }
      else { poll(d.run_id, jobId as number) }
    }).catch((err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Could not start ranking.'); setPhase('')
    })
  }

  const selectJob = (id: number) => { if (pollRef.current) clearTimeout(pollRef.current); setJobId(id) }
  const inProgress = phase === 'pending' || phase === 'running'
  const job = jobs.find(j => j.id === jobId)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-28">
      <div style={{ marginBottom: 12 }}><Tag icon="sliders" tone="longshot">Recruiter</Tag></div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(28px,6vw,40px)', lineHeight: 1.04, letterSpacing: '-0.035em', margin: '0 0 12px', color: 'var(--ink)' }}>Rank the candidates</h1>
      <p style={{ margin: '0 0 28px', fontSize: 16.5, color: 'var(--muted)', fontWeight: 500, maxWidth: 620, lineHeight: 1.5 }}>
        Pick one of your open roles and rank the candidate base against it — with a clear read on what makes each person strong or risky for that exact job.
      </p>

      <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>Your open roles</div>
      {jobs.length === 0 ? (
        <Card padding={40} style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 22 }}>No posted jobs yet — create one to rank candidates.</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px,100%), 1fr))', gap: 14, marginBottom: 22 }}>
          {jobs.map(j => <JobCardOption key={j.id} job={j} active={j.id === jobId} onSelect={selectJob} />)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30, flexWrap: 'wrap' }}>
        <Button size="lg" variant="primary" icon="sliders" iconRight="arrow" onClick={runFunnel} disabled={!jobId || inProgress || rankedToday}>
          {inProgress ? 'Ranking…' : rankedToday ? 'Ranked today' : 'Find best-ranked candidates'}
        </Button>
        {job && <span style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>Scoring <b style={{ color: 'var(--ink)' }}>{job.total_applicants ?? 0}</b> applicants for <b style={{ color: 'var(--ink)' }}>{job.title}</b></span>}
      </div>

      {rankedToday && rankings && (
        <div style={{ fontSize: 13.5, background: 'var(--green-soft)', color: 'var(--green-ink)', border: '1.5px solid var(--green-line)', borderRadius: 14, padding: '10px 16px', marginBottom: 24, fontWeight: 600 }}>
          ✓ Ranked today{rankedAt ? ` at ${new Date(rankedAt).toLocaleTimeString()}` : ''} — showing cached results. Next rank available tomorrow.
        </div>
      )}
      {error && <div style={{ fontSize: 13.5, background: 'var(--red-soft)', color: 'var(--red-ink)', border: '1.5px solid var(--red-line)', borderRadius: 14, padding: '10px 16px', marginBottom: 24, fontWeight: 600 }}>{error}</div>}

      {inProgress && (
        <Card padding={0} style={{ padding: '60px 30px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span className="vouch-spin" style={{ width: 22, height: 22, border: '3px solid var(--violet)', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Ranking candidates…</span>
          </div>
          <p style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 14, margin: '8px 0 0' }}>Retrieve → rerank → LLM evaluation. Runs in the background; results cache for the day.</p>
        </Card>
      )}

      {!jobId && !inProgress && (
        <div style={{ textAlign: 'center', padding: '70px 20px', border: '2px dashed var(--line)', borderRadius: 22, color: 'var(--muted)' }}>
          <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: 16, background: 'var(--surface-2)', border: '2px solid var(--line)', display: 'grid', placeItems: 'center' }}>
            <Icon name="trophy" size={28} stroke={2.2} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15.5, color: 'var(--ink)' }}>Pick a role to rank</p>
          <p style={{ margin: '6px 0 0', fontWeight: 500, fontSize: 14 }}>Select one of your open roles above to get started.</p>
        </div>
      )}

      {rankings && !inProgress && (
        rankings.length === 0 ? (
          <Card padding={48} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>No candidates matched. Add candidates to the platform or run the bulk import.</Card>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <Icon name="trophy" size={20} stroke={2.2} style={{ color: 'var(--violet)' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Top {Math.min(10, rankings.length)} {job ? `for ${job.title}` : ''}</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {rankings.slice(0, 10).map((c, i) => (
                <CandidateCard key={c.candidate_id} c={c} idx={i} jobId={jobId}
                  onView={(tab) => navigate(`/recruiter/candidates/${c.candidate_id}?job_id=${jobId}${tab ? `&tab=${tab}` : ''}`)} />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
