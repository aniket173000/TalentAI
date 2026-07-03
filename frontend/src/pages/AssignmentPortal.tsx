import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CandidateAssignmentView, getPortal, submitTranscripts } from '../api/assignments'
import LoadingSpinner from '../components/LoadingSpinner'
import { Button, Card, Icon, Tag } from '../components/ui'

export default function AssignmentPortal() {
  const { token } = useParams()
  const [view, setView] = useState<CandidateAssignmentView | null>(null)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [repoUrl, setRepoUrl] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token) return
    getPortal(token)
      .then(setView)
      .catch(e => setError(e?.response?.status === 404
        ? 'This assignment link is invalid or has been removed.'
        : 'Could not load the assignment. Try again shortly.'))
  }, [token])

  if (error) return <Card padding={26} style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>{error}</Card>
  if (!view) return <LoadingSpinner />

  const submitted = view.status === 'submitted'

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card hero padding={26}>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
          Take-home assignment · {view.company}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', marginTop: 4 }}>
          {view.assignment_title}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Tag>{view.job_title}</Tag>
          <Tag icon="mono">build with claude code</Tag>
          {view.deadline && (
            <Tag tone={view.assignment_open ? 'longshot' : 'full'}>
              deadline {new Date(view.deadline).toLocaleString()}
            </Tag>
          )}
        </div>
      </Card>

      <Card padding={22}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, marginBottom: 10 }}>Project brief</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.7 }}>{view.brief}</div>
      </Card>

      <Card padding={22} style={{ background: 'var(--surface-2)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 10 }}>
          How submission works
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          <li>Build the project locally using <strong>Claude Code</strong>.</li>
          <li>Find your session transcripts in <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 6 }}>~/.claude/projects/&lt;your-project-folder&gt;/</code> — they are <code style={{ fontFamily: 'var(--font-mono)' }}>.jsonl</code> files, one per session.</li>
          <li>Upload all of them below (plus a link to your repo, if you have one).</li>
        </ol>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
          We assess how effectively you collaborate with AI — your prompts, planning, edge-case
          thinking, and verification habits. API keys and screenshots are automatically stripped
          before anything is stored.
        </div>
      </Card>

      {submitted ? (
        <Card padding={26} style={{ textAlign: 'center', background: 'var(--green-soft)' }}>
          <Icon name="check" size={30} />
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, marginTop: 8 }}>
            Submission received
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
            Submitted {view.submitted_at ? new Date(view.submitted_at).toLocaleString() : ''}.
            The recruiting team will get back to you — nothing more to do here.
          </div>
        </Card>
      ) : !view.assignment_open ? (
        <Card padding={26} style={{ textAlign: 'center', background: 'var(--red-soft)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>
            This assignment is closed
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
            The deadline has passed or the recruiter closed submissions.
          </div>
        </Card>
      ) : (
        <Card padding={22}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, marginBottom: 12 }}>
            Submit your work
          </div>

          <input
            ref={fileInput} type="file" multiple accept=".jsonl,application/jsonl"
            style={{ display: 'none' }}
            onChange={e => setFiles(prev => {
              const incoming = Array.from(e.target.files || [])
              const names = new Set(prev.map(f => f.name))
              return [...prev, ...incoming.filter(f => !names.has(f.name))]
            })}
          />
          <button
            onClick={() => fileInput.current?.click()}
            style={{
              width: '100%', padding: 26, borderRadius: 16, cursor: 'pointer',
              border: '2px dashed var(--line)', background: 'var(--surface-2)',
              fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--muted)',
            }}>
            <Icon name="bolt" size={20} />
            <div style={{ marginTop: 6 }}>
              {files.length === 0
                ? 'Click to select your .jsonl transcript files'
                : `${files.length} file(s) selected — click to add more`}
            </div>
          </button>

          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
              {files.map(f => (
                <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                  <Icon name="spark" size={13} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ color: 'var(--muted)' }}>{(f.size / 1e6).toFixed(1)} MB</span>
                  <button onClick={() => setFiles(prev => prev.filter(x => x.name !== f.name))}
                    style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--red-ink)', fontWeight: 800 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <input
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '2px solid var(--line)', fontSize: 14, marginTop: 12 }}
            placeholder="Repository link (optional) — GitHub / GitLab URL of what you built"
            value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
          />

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, marginTop: 14, cursor: 'pointer', lineHeight: 1.55 }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              I consent to {view.company} analyzing my uploaded Claude Code transcripts to assess
              my AI collaboration skills for this application. Credentials and images are stripped
              before storage; transcripts are used only for this assessment.
            </span>
          </label>

          {submitError && (
            <div style={{ color: 'var(--red-ink)', fontSize: 13.5, marginTop: 10, whiteSpace: 'pre-wrap' }}>{submitError}</div>
          )}

          <div style={{ marginTop: 16 }}>
            <Button full disabled={busy || files.length === 0 || !consent} onClick={async () => {
              setBusy(true); setSubmitError('')
              try {
                const updated = await submitTranscripts(token!, files, repoUrl.trim())
                setView(updated)
              } catch (e: any) {
                setSubmitError(e?.response?.data?.detail || 'Upload failed — check your files and try again.')
              } finally { setBusy(false) }
            }}>
              {busy ? 'Uploading & scrubbing…' : 'Submit assignment'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
