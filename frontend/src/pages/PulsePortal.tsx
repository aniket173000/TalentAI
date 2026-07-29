import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PulsePortal as Portal, PulseReport, getPortal, setConsent, myReport, submitSessions } from '../api/pulse'
import PulseWave from '../components/PulseWave'
import '../styles/pulse.css'

/**
 * Engineer-facing Pulse portal (tokenized, no login). Consent gate → submit →
 * your own signal. This is the "coaching, not surveillance" surface: the
 * engineer controls consent and only ever sees their own data.
 */
export default function PulsePortal() {
  const { token } = useParams()
  const [portal, setPortal] = useState<Portal | null>(null)
  const [report, setReport] = useState<PulseReport | null>(null)
  const [error, setError] = useState('')
  const [fullName, setFullName] = useState('')
  const [attribution, setAttribution] = useState(false)
  const [shareReport, setShareReport] = useState(false)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [workNote, setWorkNote] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token) return
    getPortal(token)
      .then(p => { setPortal(p); myReport(token).then(setReport).catch(() => {}) })
      .catch(e => setError(e?.response?.status === 404
        ? 'This Pulse link is invalid or has been revoked.'
        : 'Could not load your Pulse page. Try again shortly.'))
  }, [token])

  async function optIn() {
    if (!token) return
    setBusy(true)
    try {
      const p = await setConsent(token, { playbook_attribution: attribution, share_individual_report: shareReport }, fullName || undefined)
      setPortal(p)
    } finally { setBusy(false) }
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const picked = Array.from(list).filter(f => f.name.endsWith('.jsonl'))
    const rejected = Array.from(list).length - picked.length
    setUploadMsg(rejected > 0 ? `${rejected} non-.jsonl file(s) ignored.` : '')
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...picked.filter(f => !names.has(f.name))]
    })
  }

  async function upload() {
    if (!token || files.length === 0) return
    setUploading(true); setUploadMsg('')
    try {
      const p = await submitSessions(token, files, workNote || undefined)
      setPortal(p); setFiles([]); setWorkNote('')
      setUploadMsg('Submitted. Scoring your sessions — your signal appears below in ~10–30s.')
      for (let i = 0; i < 30; i++) {
        try { setReport(await myReport(token)); break } catch { /* not ready */ }
        await new Promise(r => setTimeout(r, 1500))
      }
    } catch (e: any) {
      setUploadMsg(e?.response?.data?.detail || 'Upload failed — make sure these are Claude Code .jsonl sessions.')
    } finally { setUploading(false) }
  }

  if (error) return <div className="pulse-root"><div className="pulse-wrap"><div className="p-panel ticked" style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>{error}</div></div></div>
  if (!portal) return <div className="pulse-root"><div className="pulse-wrap mono">Loading your signal…</div></div>

  const tips = report?.highlights?.coaching_tips || []

  return (
    <div className="pulse-root">
      <div className="pulse-wrap pulse-stack" style={{ maxWidth: 760 }}>
        {/* header */}
        <div className="rise">
          <div className="eyebrow">nideknil <span className="dot">▸</span> pulse · {portal.org_name}</div>
          <h1 className="display-xl" style={{ marginTop: 10 }}>Your private<br />AI fluency signal.</h1>
          <p className="lede" style={{ marginTop: 10 }}>
            Only you see your own report — your team sees aggregates. Sessions are scrubbed of secrets
            before they’re stored. Cadence <span className="mono">{portal.cadence}</span> · period <span className="mono">{portal.current_period_label}</span>.
          </p>
        </div>

        {!portal.consented ? (
          /* CONSENT GATE */
          <div className="p-panel ticked rise" style={{ animationDelay: '.05s' }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>opt in</div>
            <input className="p-input" placeholder="Your name" value={fullName} onChange={e => setFullName(e.target.value)} />
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, margin: '14px 0 8px' }}>
              <input type="checkbox" checked={attribution} onChange={e => setAttribution(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Credit my best techniques to me in the team Playbook &amp; leaderboard.</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, marginBottom: 14 }}>
              <input type="checkbox" checked={shareReport} onChange={e => setShareReport(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Let my manager see my individual report <span style={{ color: 'var(--p-muted)' }}>(off = team aggregates only)</span>.</span>
            </label>
            <button className="p-btn signal" onClick={optIn} disabled={busy}>{busy ? 'Setting up…' : 'I consent — set me up →'}</button>
          </div>
        ) : (
          /* SUBMIT */
          <div className="p-panel ticked rise" style={{ animationDelay: '.05s' }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>submit this period’s sessions</div>
            <div className="dropzone" data-over={dragOver}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
              onClick={() => fileInput.current?.click()}>
              <div className="big">〰️</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Drop your <span className="mono">.jsonl</span> sessions, or click to choose</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--p-muted)', marginTop: 4 }}>from ~/.claude/projects/&lt;your-project&gt;/ · secrets scrubbed before storage</div>
              <input ref={fileInput} type="file" accept=".jsonl" multiple style={{ display: 'none' }}
                onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </div>

            {files.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {files.map(f => (
                  <div className="row" key={f.name}>
                    <span style={{ fontSize: 13 }}>{f.name} <span className="mono" style={{ color: 'var(--p-muted)' }}>({(f.size / 1024).toFixed(0)} KB)</span></span>
                    <button className="p-link" style={{ color: 'var(--p-signal)' }} onClick={() => setFiles(files.filter(x => x.name !== f.name))}>remove</button>
                  </div>
                ))}
                <input className="p-input" style={{ margin: '10px 0' }} value={workNote} onChange={e => setWorkNote(e.target.value)}
                  placeholder="Optional — what did you work on? (sharpens scoring)" />
                <button className="p-btn signal" onClick={upload} disabled={uploading}>
                  {uploading ? 'Uploading & scoring…' : `Submit ${files.length} file${files.length > 1 ? 's' : ''} →`}
                </button>
              </div>
            )}
            {uploadMsg && <div style={{ fontSize: 12.5, marginTop: 10, color: uploadMsg.startsWith('Submitted') ? 'var(--p-mint)' : 'var(--p-signal)' }}>{uploadMsg}</div>}

            <div style={{ borderTop: '1px solid var(--p-line)', margin: '16px 0 12px' }} />
            <div className="eyebrow" style={{ marginBottom: 8 }}>prefer the terminal?</div>
            <code className="p-code">{portal.submit_command}</code>
            {portal.latest_status && <div className="mono" style={{ fontSize: 12, color: 'var(--p-muted)', marginTop: 8 }}>latest submission: {portal.latest_status}</div>}
          </div>
        )}

        {/* REPORT */}
        {report && (
          <div className="p-panel ticked">
            <div className="hero-grid" style={{ alignItems: 'center' }}>
              <div>
                <div className="eyebrow"><span className="dot">◉</span> your signal · {report.period_label}</div>
                <div className="readout" style={{ marginTop: 8 }}>
                  <span className="num">{report.overall_score}</span><span className="den">/100</span>
                </div>
                <p className="lede" style={{ fontSize: 13, marginTop: 8 }}>{report.summary}</p>
              </div>
              <PulseWave values={[report.overall_score]} height={150} id="me" />
            </div>

            <div style={{ marginTop: 14 }}>
              {report.dimensions.map((d, i) => (
                <div className="meter-row" key={d.key}>
                  <span className="label">{d.label}</span>
                  <span className={`meter ${d.score == null ? 'null' : ''}`}>
                    <span style={{ width: `${d.score ?? 4}%`, animationDelay: `${i * 0.05}s` }} />
                  </span>
                  <span className={`score ${d.score == null ? 'na' : ''}`}>{d.score ?? 'n/a'}</span>
                </div>
              ))}
            </div>

            {tips.length > 0 && (
              <div className="p-panel" style={{ background: 'var(--p-panel-2)', marginTop: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>try this next</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                  {tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
