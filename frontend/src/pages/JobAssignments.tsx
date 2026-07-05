import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import {
  Assignment, Submission, createAssignment, inviteCandidates,
  listAssignments, listSubmissions, retryAnalysis, updateAssignment,
} from '../api/assignments'
import LoadingSpinner from '../components/LoadingSpinner'
import { Button, Card, Icon, ScoreRing, Tag } from '../components/ui'

const STATUS_TONE: Record<Submission['status'], 'neutral' | 'match' | 'longshot' | 'full'> = {
  invited: 'neutral', submitted: 'longshot', processing: 'longshot',
  analyzed: 'match', failed: 'full',
}

// "touched the MCP server" — not "is actively working right now" (claude mcp list/get
// can themselves trigger a handshake). Kept deliberately vague ("Xm/Xh/Xd ago").
function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

interface PoolCandidate { id: number; candidate_name: string; candidate_email: string }

export default function JobAssignments() {
  const { jobId } = useParams()
  const [assignments, setAssignments] = useState<Assignment[] | null>(null)
  const [selected, setSelected] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!jobId) return
    const data = await listAssignments(Number(jobId))
    setAssignments(data)
    if (data.length && !selected) setSelected(data[0])
  }, [jobId, selected])

  useEffect(() => { load().catch(() => setError('Could not load assignments')) }, [load])

  const loadSubmissions = useCallback(async () => {
    if (!selected) return
    const subs = await listSubmissions(selected.id)
    setSubmissions(subs)
    // Poll while any submission is mid-pipeline.
    const active = subs.some(s => s.status === 'submitted' || s.status === 'processing')
    if (pollRef.current) window.clearTimeout(pollRef.current)
    if (active) pollRef.current = window.setTimeout(loadSubmissions, 6000)
  }, [selected])

  useEffect(() => {
    loadSubmissions().catch(() => {})
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current) }
  }, [loadSubmissions])

  if (!assignments) return <LoadingSpinner />

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' }}>
            AI Fluency Assignments
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            Take-home projects built with Claude Code — scored on how well the candidate collaborates with AI.
          </div>
        </div>
        <Button icon="plus" onClick={() => setShowCreate(true)}>New assignment</Button>
      </div>

      {error && <Card padding={16} style={{ background: 'var(--red-soft)' }}>{error}</Card>}

      {assignments.length === 0 && !showCreate && (
        <Card padding={40} style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
            No assignments yet
          </div>
          <div style={{ color: 'var(--muted)', marginBottom: 18 }}>
            Create a take-home project and invite applicants. Candidates submit their Claude Code
            transcripts and you get a scored report on their AI collaboration skills.
          </div>
          <Button icon="plus" onClick={() => setShowCreate(true)}>Create your first assignment</Button>
        </Card>
      )}

      {showCreate && (
        <CreateForm
          jobId={Number(jobId)}
          onDone={a => { setShowCreate(false); setAssignments(prev => [a, ...(prev || [])]); setSelected(a) }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {assignments.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {assignments.map(a => (
            <button key={a.id} onClick={() => setSelected(a)} style={{
              cursor: 'pointer', padding: '10px 16px', borderRadius: 14,
              border: '2px solid var(--ink)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14,
              background: selected?.id === a.id ? 'var(--ink)' : 'var(--surface)',
              color: selected?.id === a.id ? 'var(--bg)' : 'var(--ink)',
            }}>
              {a.title} {a.status === 'closed' && '· closed'}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <Card padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19 }}>{selected.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  {selected.brief.length > 400 ? selected.brief.slice(0, 400) + '…' : selected.brief}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Tag icon="mono">tool: claude code</Tag>
                  {selected.deadline && <Tag>deadline {new Date(selected.deadline).toLocaleDateString()}</Tag>}
                  {selected.evaluation_focus && <Tag tone="longshot">{selected.evaluation_focus.slice(0, 60)}</Tag>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Button size="sm" variant="soft" icon="users" onClick={() => setShowInvite(true)}>Invite</Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  const next = selected.status === 'active' ? 'closed' : 'active'
                  const updated = await updateAssignment(selected.id, { status: next })
                  setSelected(updated)
                  setAssignments(prev => (prev || []).map(x => x.id === updated.id ? updated : x))
                }}>{selected.status === 'active' ? 'Close' : 'Reopen'}</Button>
              </div>
            </div>
          </Card>

          {showInvite && (
            <InvitePanel
              jobId={Number(jobId)}
              assignmentId={selected.id}
              onDone={() => { setShowInvite(false); loadSubmissions() }}
              onCancel={() => setShowInvite(false)}
            />
          )}

          <SubmissionsTable submissions={submissions} onRetry={async id => {
            await retryAnalysis(id); loadSubmissions()
          }} />
        </>
      )}
    </div>
  )
}

function CreateForm({ jobId, onDone, onCancel }: {
  jobId: number; onDone: (a: Assignment) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [focus, setFocus] = useState('')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const input = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '2px solid var(--line)', fontSize: 14.5, fontFamily: 'var(--font-body)', background: 'var(--surface)' } as const

  return (
    <Card padding={22}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginBottom: 14 }}>New assignment</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input style={input} placeholder="Title — e.g. Build a URL shortener with analytics" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea style={{ ...input, minHeight: 160 }} placeholder={'Project brief the candidate will see.\nBe specific: features, constraints, stack expectations, what "done" means.'} value={brief} onChange={e => setBrief(e.target.value)} />
        <input style={input} placeholder="Evaluation focus (optional) — e.g. backend-heavy, I care about API design reasoning" value={focus} onChange={e => setFocus(e.target.value)} />
        <label style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
          Deadline (optional)
          <input type="datetime-local" style={{ ...input, width: 'auto' }} value={deadline} onChange={e => setDeadline(e.target.value)} />
        </label>
        {err && <div style={{ color: 'var(--red-ink)', fontSize: 13.5 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button disabled={busy || !title.trim() || !brief.trim()} onClick={async () => {
            setBusy(true); setErr('')
            try {
              const a = await createAssignment({
                job_id: jobId, title, brief,
                evaluation_focus: focus.trim() || undefined,
                deadline: deadline ? new Date(deadline).toISOString() : undefined,
              })
              onDone(a)
            } catch (e: any) {
              setErr(e?.response?.data?.detail || 'Failed to create assignment')
            } finally { setBusy(false) }
          }}>{busy ? 'Creating…' : 'Create assignment'}</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}

function InvitePanel({ jobId, assignmentId, onDone, onCancel }: {
  jobId: number; assignmentId: number; onDone: () => void; onCancel: () => void
}) {
  const [pool, setPool] = useState<PoolCandidate[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [emails, setEmails] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get(`/applications/job/${jobId}/all`)
      .then(r => setPool((r.data.applications || []).map((a: any) => ({
        id: a.id, candidate_name: a.candidate_name, candidate_email: a.candidate_email,
      }))))
      .catch(() => setPool([]))
  }, [jobId])

  return (
    <Card padding={20} style={{ background: 'var(--surface-2)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Invite candidates</div>
      {!pool ? <LoadingSpinner /> : (
        <>
          {pool.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}>
              {pool.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '6px 8px', borderRadius: 10, background: picked.has(c.id) ? 'var(--hero)' : 'transparent' }}>
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => {
                    setPicked(prev => {
                      const next = new Set(prev)
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                      return next
                    })
                  }} />
                  <strong>{c.candidate_name}</strong>
                  <span style={{ color: 'var(--muted)' }}>{c.candidate_email}</span>
                </label>
              ))}
            </div>
          )}
          <input
            style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: '2px solid var(--line)', fontSize: 14, marginBottom: 12 }}
            placeholder="Or invite by email — comma-separated"
            value={emails} onChange={e => setEmails(e.target.value)}
          />
          {err && <div style={{ color: 'var(--red-ink)', fontSize: 13.5, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button size="sm" disabled={busy || (picked.size === 0 && !emails.trim())} onClick={async () => {
              setBusy(true); setErr('')
              try {
                await inviteCandidates(assignmentId, {
                  application_ids: [...picked],
                  emails: emails.split(',').map(s => s.trim()).filter(Boolean),
                })
                onDone()
              } catch (e: any) {
                setErr(e?.response?.data?.detail || 'Invite failed')
              } finally { setBusy(false) }
            }}>{busy ? 'Inviting…' : `Send invites`}</Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </>
      )}
    </Card>
  )
}

function SubmissionsTable({ submissions, onRetry }: {
  submissions: Submission[]; onRetry: (id: number) => void
}) {
  if (submissions.length === 0) {
    return (
      <Card padding={26} style={{ textAlign: 'center', color: 'var(--muted)' }}>
        No candidates invited yet.
      </Card>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {submissions.map(s => (
        <Card key={s.id} padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {s.overall_score != null
              ? <ScoreRing score={Math.round(s.overall_score)} size={52} color={s.overall_score >= 75 ? 'green' : s.overall_score >= 55 ? 'violet' : 'amber'} />
              : <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px dashed var(--line)', display: 'grid', placeItems: 'center', color: 'var(--muted)', flexShrink: 0 }}>
                  <Icon name={s.status === 'processing' || s.status === 'submitted' ? 'clock' : 'spark'} size={18} />
                </div>}
            <div style={{ minWidth: 180, flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15.5 }}>{s.candidate_name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{s.candidate_email}</div>
            </div>
            <Tag tone={STATUS_TONE[s.status]}>{s.status}</Tag>
            {s.session_count != null && <Tag icon="mono">{s.session_count} sessions</Tag>}
            {s.integrity_confidence && s.integrity_confidence !== 'high' && (
              <Tag tone={s.integrity_confidence === 'low' ? 'full' : 'longshot'}>
                integrity: {s.integrity_confidence}
              </Tag>
            )}
            {s.mcp_last_seen_at && (
              <Tag icon="mono" tone="match">
                connected via Claude Code · active {relativeTime(s.mcp_last_seen_at)}
              </Tag>
            )}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {s.status === 'analyzed' && (
                <Link to={`/recruiter/submissions/${s.id}/report`}>
                  <Button size="sm" iconRight="arrow">View report</Button>
                </Link>
              )}
              {s.status === 'failed' && (
                <Button size="sm" variant="soft" onClick={() => onRetry(s.id)}>Retry analysis</Button>
              )}
            </div>
          </div>
          {s.status === 'failed' && s.error && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--red-ink)', fontFamily: 'var(--font-mono)' }}>
              {s.error.slice(0, 300)}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
