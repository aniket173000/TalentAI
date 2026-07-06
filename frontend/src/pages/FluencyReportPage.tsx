import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FluencyReport, getReport } from '../api/assignments'
import LoadingSpinner from '../components/LoadingSpinner'
import { Button, Card, ScoreRing, Tag } from '../components/ui'

const CONF_TONE = { high: 'match', medium: 'longshot', low: 'full' } as const

function barColor(score: number) {
  return score >= 75 ? 'var(--green-ink)' : score >= 55 ? 'var(--violet)' : 'var(--amber-ink)'
}

export default function FluencyReportPage() {
  const { submissionId } = useParams()
  const [report, setReport] = useState<FluencyReport | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!submissionId) return
    getReport(Number(submissionId))
      .then(setReport)
      .catch(e => setError(e?.response?.data?.detail || 'Could not load report'))
  }, [submissionId])

  if (error) return <Card padding={24} style={{ maxWidth: 640, margin: '40px auto' }}>{error}</Card>
  if (!report) return <LoadingSpinner />

  const m = report.metrics || {}
  const visibleFlags = (report.integrity_flags || []).filter(f => f.severity !== 'info')

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <Card hero padding={26}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <ScoreRing score={Math.round(report.overall_score)} size={86}
            color={report.overall_score >= 75 ? 'green' : report.overall_score >= 55 ? 'violet' : 'amber'} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
              AI Fluency Report
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>
              {report.candidate_name}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {report.integrity_confidence && (
                <Tag tone={CONF_TONE[report.integrity_confidence]}>
                  integrity confidence: {report.integrity_confidence}
                </Tag>
              )}
              <Tag icon="mono">{report.provider} · {report.chunk_model}</Tag>
              <Tag icon="mono">{new Date(report.created_at).toLocaleString()}</Tag>
            </div>
          </div>
          <Link to={-1 as any}><Button variant="ghost" size="sm">Back</Button></Link>
        </div>
        <p style={{ marginTop: 18, fontSize: 15, lineHeight: 1.65 }}>{report.summary}</p>
      </Card>

      {/* Integrity flags */}
      {visibleFlags.length > 0 && (
        <Card padding={18} style={{ background: 'var(--amber-soft)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
            ⚠ Integrity signals — read the score with these in mind
          </div>
          {visibleFlags.map((f, i) => (
            <div key={i} style={{ fontSize: 13.5, marginBottom: 6, display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <Tag tone={f.severity === 'high' ? 'full' : 'longshot'}>{f.severity}</Tag>
              <span>{f.detail}</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            Transcript submission is consent-based and cannot be fully tamper-proofed. These are
            heuristic anomaly signals, not accusations.
          </div>
        </Card>
      )}

      {/* Dimensions */}
      <Card padding={22}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
          Rubric breakdown
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {report.dimensions.map(d => (
            <div key={d.key} style={{ borderBottom: '1.5px solid var(--line)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220 }}>
                  <span style={{ fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 15 }}>{d.label}</span>
                  {d.weight != null && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>· {d.weight}%</span>
                  )}
                </div>
                <div style={{ flex: 1, height: 10, background: 'var(--track)', borderRadius: 99, minWidth: 120, overflow: 'hidden' }}>
                  {d.score != null && (
                    <div style={{ width: `${d.score}%`, height: '100%', background: barColor(d.score), borderRadius: 99 }} />
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, width: 46, textAlign: 'right' }}>
                  {d.score != null ? Math.round(d.score) : '—'}
                </div>
                <Tag tone={CONF_TONE[d.confidence]}>{d.confidence}</Tag>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>{d.note}</div>
              {d.evidence.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {d.evidence.map((q, i) => (
                    <div key={i} style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '7px 10px',
                      background: 'var(--surface-2)', borderLeft: '3px solid var(--violet)', borderRadius: 6,
                    }}>“{q}”</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Highlights + interview questions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {report.highlights?.best_moment && (
          <Card padding={18} style={{ background: 'var(--green-soft)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5, marginBottom: 8 }}>★ Best moment</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{report.highlights.best_moment}</div>
          </Card>
        )}
        {report.highlights?.growth_area && (
          <Card padding={18} style={{ background: 'var(--amber-soft)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5, marginBottom: 8 }}>△ Growth area</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{report.highlights.growth_area}</div>
          </Card>
        )}
      </div>

      {(report.highlights?.interview_questions?.length || 0) > 0 && (
        <Card padding={20}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 10 }}>
            Suggested interview probes
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            {report.highlights.interview_questions!.map((q, i) => <li key={i}>{q}</li>)}
          </ol>
        </Card>
      )}

      {/* Git snapshot (only present when submitted via the CLI) */}
      {m.git && (
        <Card padding={20}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
            Repository snapshot
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
            Captured by the submit CLI and cross-checked against the transcript timeline.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Tag icon="mono">{m.git.commit_count} commits</Tag>
            <Tag icon="mono">{m.git.file_count} files</Tag>
            {m.git.branch && <Tag icon="mono">branch {m.git.branch}</Tag>}
          </div>
          {Array.isArray(m.git.recent_subjects) && m.git.recent_subjects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {m.git.recent_subjects.slice(0, 8).map((s: string, i: number) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
                  · {s}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Transcript metrics */}
      <Card padding={20}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
          Transcript metrics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {[
            ['Sessions', m.sessions], ['Prompts typed', m.prompts],
            ['Tool actions', m.tool_calls], ['Verification runs', m.verification_runs],
            ['Tool errors', m.tool_errors], ['Work bursts', m.work_bursts],
            ['Active hours', m.active_hours], ['Wall-clock hours', m.wall_clock_hours],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: 12, borderRadius: 12, border: '2px solid var(--line)', background: 'var(--surface-2)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>{value ?? '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
